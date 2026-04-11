# 🔄 7. Workflow & State Management

This document defines the authoritative state machines for every piece of content or user interaction that has a lifecycle.

---

## 7.1 Article Lifecycle

### States

```
   ┌──────────┐   submit    ┌────────────┐   approve   ┌──────────┐   publish   ┌────────────┐
   │  draft   │────────────►│ submitted  │────────────►│ approved │────────────►│ published  │
   └────┬─────┘             └─────┬──────┘             └──────────┘             └─────┬──────┘
        │                         │                                                    │
        │ edit                    │ reject                                              │ unpublish
        ▼                         ▼                                                    ▼
   ┌──────────┐             ┌────────────┐                                      ┌────────────┐
   │  draft   │             │  rejected  │                                      │unpublished │
   └──────────┘             └────────────┘                                      └────────────┘
```

### State table

| Current | Action | Actor | Next | Side effects |
|---------|--------|-------|------|--------------|
| `draft` | edit | author/editor | `draft` | none |
| `draft` | submit | author/editor | `submitted` | notify editors of section; `submittedAt = now` |
| `draft` | delete | owner/admin | deleted | remove media refs |
| `submitted` | approve | editor/admin | `approved` | AI pipeline runs (summary, keywords); notify author; `approvedAt = now` |
| `submitted` | reject | editor/admin | `rejected` | notify author with reason |
| `submitted` | edit | author | `draft` | clears approval queue position |
| `approved` | publish | editor/admin | `published` | `publishedAt = now`; invalidate caches; push to search index; broadcast notifications; trigger newsletter queue |
| `approved` | edit | editor | `draft` | requires re-approval |
| `published` | unpublish | admin | `unpublished` | removed from feeds, search, caches; author notified |
| `published` | edit (minor) | editor | `published` | correction flag; cache invalidated; audit entry |
| `rejected` | edit | author | `draft` | can resubmit |
| `unpublished` | re-publish | admin | `published` | same as publish action |

### Validation rules per transition

**`draft → submitted`** requires:
- `title` non-empty, ≤ 200 chars
- `body` plain-text ≥ 300 chars
- `category` set to valid enum
- `coverImageMediaId` present
- `tags` array length 1–10
- Author is active and email-verified

**`submitted → approved`** requires:
- Actor role is `editor` or `admin`
- Article currently in `submitted` state (optimistic concurrency on `version`)
- AI pipeline completes (soft — degraded AI does not block approval)

**`approved → published`** requires:
- Actor role is `editor` or `admin`
- `approvedAt` is set
- No unresolved edits

### Concurrency control

Every article has an integer `version` field. Every write uses `findOneAndUpdate({ _id, version }, { $inc: { version: 1 }, ... })`. Mismatched version → `409 CONFLICT`.

---

## 7.2 Comment Moderation Flow

### States

```
     ┌─────────┐   auto/manual approve   ┌──────────┐
     │ pending ├────────────────────────►│ approved │
     └────┬────┘                         └────┬─────┘
          │                                   │ hide
          │ reject                            ▼
          ▼                             ┌──────────┐
     ┌─────────┐                        │  hidden  │
     │ rejected│                        └──────────┘
     └─────────┘
```

### Flow

1. Reader posts comment → `POST /articles/:id/comments`
2. System runs AI moderation (phase 2): if toxicity score < 0.3 → auto-approve; if > 0.7 → auto-reject; otherwise → `pending`
3. Editor opens moderation queue → `GET /comments/pending`
4. Editor approves / rejects / hides individual comments
5. Author of article is notified when a new approved comment lands
6. Reader can delete their own comment; editor can hide any; admin can delete any

### Edge cases

- Comments on unpublished/deleted articles → orphaned, auto-hidden
- Rate-limited: 10 comments/minute per reader
- Parent comment deleted → reply remains but shows "[comment removed]"
- AI moderation unavailable → fall back to `pending` (manual queue)

---

## 7.3 Organisation / Author Onboarding & Submission Flow

### Onboarding

```
Admin creates Organisation ──► Admin creates Author user linked to org ──► Author receives email → sets password
       │                                                                                  │
       └────────────────── OR ────────────────────────────────────────────────────────────┘
Author self-registers ──► selects existing organisation (if public listing enables this) ──► awaits admin verification
```

### Submission flow

```
Author drafts article ──► validates → submit ──► queue (status=submitted)
                                                        │
                                                        ▼
                                        Editor of section reviews
                                                        │
                                       ┌────────────────┼─────────────┐
                                       ▼                                ▼
                                    approve                           reject (with reason)
                                       │                                │
                                       ▼                                ▼
                                    AI pipeline runs           author notified, article → draft (editable)
                                       │
                                       ▼
                                    approved → editor sets placement → publish
                                                                          │
                                                                          ▼
                                                  invalidate caches, notify subscribers
```

---

## 7.4 Event (Calendar) Submission Flow

```
Organisation → POST /events → status: pending
                                      │
                                      ▼
                        Editor reviews in /admin/approvals/events
                                      │
                     ┌────────────────┼────────────────┐
                     ▼                                  ▼
                 approve (published)               reject (notify org)
                     │
                     ▼
              appears in public calendar
```

---

## 7.5 E-paper Publication Flow

1. Admin uploads issue PDF + cover → `POST /epapers`
2. System stores media docs, links them to `epapers`
3. Newsletter notification job dispatches "New issue available" email to all subscribed readers
4. Readers download via `/epapers/:id/download` (pre-signed URL or stream)

---

## 7.6 Notification Fan-out Flow

```
article.published event emitted by articles service
          │
          ▼
notifications.service.handleArticlePublished(article)
          │
          ▼
1. Query users with category in followedCategories
2. For each batch of 500 users:
   - Redis pub/sub → websocket fan-out for in-app
   - Push into email queue (if reader opted in)
3. Queue is consumed by email worker (phase 2) or sent inline (MVP)
```

Email batches use templates; unsubscribe links contain signed tokens. Hard-bounced emails mark `user.isActive=false`.

---

## 7.7 AI Pipeline Flow (on article approval)

```
articles.service.approveArticle(id)
          │
          ▼
Parallel tasks:
  ├─ ai-proxy.summarize(plainText) ──► article.ai.summary
  ├─ ai-proxy.extractKeywords(plainText) ──► article.ai.keywords
  └─ compute readingTimeMin locally ──► article.ai.readingTimeMin

If any task fails:
  - Log warning with requestId
  - Article is still approved (graceful degradation)
  - Failed fields are re-computed by a cron job: "ai-backfill" every 15 min
```

---

## 7.8 User Session Lifecycle

```
Register ──► email verification ──► active
Login ──► access token (15 min) + refresh token (30 days, httpOnly cookie)
Refresh ──► rotate refresh, revoke old jti, issue new pair
Logout ──► revoke refresh (jti → Redis blocklist), clear cookie
Password change ──► revoke all sessions for user
```

Idle session (no activity 30 days) → refresh expires naturally.

---

## 7.9 State Consistency Rules

1. **Single source of truth:** MongoDB documents.
2. **Caches are derived.** Redis never holds state that isn't reconstructible from Mongo.
3. **All state transitions go through the module's service layer** — never direct DB writes from controllers.
4. **Every transition emits an event** (in-process `EventEmitter` for MVP; move to BullMQ in phase 2).
5. **Audit trail:** Phase 2 adds `audit_logs` collection capturing `{ entity, entityId, action, actor, before, after, at }`.
