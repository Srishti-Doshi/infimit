# 📘 1. Product Requirement Document (PRD)

**Product Name:** Infimit — AI-Powered Digital Newspaper Platform
**Version:** 1.0
**Document Owner:** Product & Engineering
**Status:** Approved for Development

---

## 1.1 Overview

Infimit is a modern, AI-augmented digital newspaper platform focused on **education, research, and campus journalism**. It provides a centralized publishing ecosystem where verified organisations, authors, and editors collaborate to produce high-quality editorial content, while readers consume it through a fast, personalized, and accessible reading experience.

The platform combines classical editorial workflows (draft → review → publish) with modern AI features (summarization, recommendations, text-to-speech, semantic search) and offers a downloadable **newspaper-style PDF experience** — merging print heritage with digital convenience.

Unlike traditional CMS-based news sites, Infimit treats each article as a **structured, analyzable, and remixable asset**, unlocking trending detection, personalized feeds, and e-paper compilation from the same source of truth.

---

## 1.2 Goals

### Business Goals
1. Become the go-to digital newspaper for the **education and academia vertical**.
2. Provide organisations (colleges, NGOs, research labs) a frictionless publishing channel.
3. Monetize via **advertisements, sponsored content, and premium newsletters**.
4. Scale to **100K+ monthly active readers** within 12 months of launch.

### Product Goals
1. **Editorial excellence** — strict admin approval workflow guarantees quality.
2. **AI-first reading** — summaries, recommendations, TTS built into the core reader.
3. **Multi-role collaboration** — clean separation between Admin, Editor, Author, Reader.
4. **E-paper continuity** — every issue downloadable as a print-style PDF.
5. **Performance** — LCP < 2.5s on 4G, TTI < 3.5s.

### Technical Goals
1. **Modular monolith** that can later be split into services without rewrites.
2. **Stateless backend** — horizontally scalable behind a load balancer.
3. **Isolated AI service** (FastAPI) so ML workloads never block the main API.
4. **Typed end-to-end** — TypeScript on both client and server.

---

## 1.3 User Personas

### Persona 1 — "Anita, the Admin"
- Role: Chief Editor / Platform Admin
- Age: 35–50
- Needs: Bird's-eye view of platform health, ability to approve/reject content, upload weekly e-papers, manage editors and partner organisations.
- Pain points: Slow approval queues, no trustworthy analytics, too many tools.
- KPIs she cares about: Time-to-publish, DAU, article quality score.

### Persona 2 — "Rohan, the Editor"
- Role: Section Editor (e.g., Research & Innovation)
- Age: 25–40
- Needs: Write & edit articles with AI assistance, moderate comments, control featured/trending placements, manage ads for his section.
- Pain points: Manual formatting, no AI help, clunky image uploads, disconnected analytics.

### Persona 3 — "Priya, the Author / Organisation"
- Role: College PR officer / faculty contributor / student journalist
- Age: 20–45
- Needs: Submit articles, track status, manage her organisation's branded profile, post events.
- Pain points: Opaque editorial process, no feedback on rejection, no analytics on her own pieces.

### Persona 4 — "Arjun, the Reader"
- Role: Student / Faculty / Education enthusiast
- Age: 16–60
- Needs: Quickly scan headlines, deep-read long-form articles, save for later, get notifications for topics he follows, download the daily paper.
- Pain points: Information overload, slow news sites, ads everywhere, no offline reading.

---

## 1.4 Feature Breakdown

### 🧑‍💻 Reader Features
- Smart navbar filters: **date, category, location**
- Core categories: Education Policy · Campus News · Research & Innovation · Student Achievements · Technology in Education (+ subcategories, future-ready)
- Homepage: Top Headlines (TRAIL), Featured Banner, Latest Feed, Trending
- Article page: Headline, Author, Publish date, Reading time, Embedded media, Social share, Comments, **AI Summary**, Downloadable newspaper-style PDF
- Full-text search (keywords, author, date, topic)
- E-paper viewer + archive
- Auth (register/login)
- User profile, bookmarks, notifications, newsletter
- **Advanced:** Dark mode, Smart recommendations, Text-to-speech

### ✍️ Editor Features
- Rich article editor with **AI assistance** (title suggest, summary, SEO)
- Edit/update existing articles
- Upload images & videos
- Comment moderation (approve/reject/hide)
- Manage authors & organisations assigned to their section
- Section analytics dashboard
- Advertisement management (placement, status, scheduling)
- Article placement control (featured, trending, TRAIL banner)

### 👑 Admin Features
- Create/remove editors
- Create/manage organisations
- Full article approval backlog
- Platform-wide analytics dashboard
- Upload e-newspaper PDFs (dated, archived)
- Override any editor action

### 🏛️ Organisation / Author Features
- Submit new articles to editorial queue
- Profile management (logo, description, contacts, social links)
- Submission tracking dashboard (Pending / Approved / Published / Rejected)
- Event submission to dynamic calendar
- Future: Public organisation catalog

### 🔧 System Features
- Per-article downloadable newspaper-format PDF
- Visitor tracking (views, read duration, engagement)
- Advertisement delivery system (slots, impressions, clicks)
- Static pages: About Us, Contact Us, Privacy, Terms

---

## 1.5 Success Metrics

| Category | Metric | Target (6 months) |
|----------|--------|-------------------|
| Reach | Monthly Active Readers | 50,000 |
| Engagement | Avg. read duration | > 2 min |
| Engagement | Bookmark rate | > 8% of reads |
| Retention | 30-day retention | > 35% |
| Editorial | Articles published/week | 120+ |
| Editorial | Time draft → published | < 24 h median |
| Performance | LCP (p75) | < 2.5 s |
| Performance | API p95 latency | < 300 ms |
| AI | Summary helpfulness rating | > 4.0/5 |
| Business | Monthly ad revenue | TBD |

---

## 1.6 Non-Goals (Out of Scope for v1)

- Native mobile apps (web-responsive only)
- Paywall / paid subscriptions
- Multi-language i18n (English only for MVP)
- Live video streaming
- Marketplace for authors
- AI-generated full articles (only assistance, not autowriting)

---

## 1.7 Constraints & Assumptions

- All content is **English** for v1.
- Articles are **text-first** with embedded media; no interactive widgets in MVP.
- MongoDB is the system of record; Redis is cache only (no durability assumptions).
- AI models are **called via REST** — no gRPC, no shared memory.
- All user media is stored in S3-compatible object storage, never on local disk.
