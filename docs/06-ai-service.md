# 🤖 6. AI Service Documentation

The AI service is a standalone **FastAPI (Python 3.11)** microservice reachable only from the Node.js monolith. It exposes a narrow REST API for ML tasks.

**Base URL (internal):** `http://ai-service:8000`
**Auth:** Internal shared secret via `X-Internal-Key` header (never exposed publicly)
**Timeout contract:** Callers set a 2-second timeout and fall back gracefully.

---

## 6.1 Design Principles

1. **Stateless.** No DB connection. Every request is self-contained.
2. **Narrow surface.** One endpoint per ML capability.
3. **Graceful degradation.** If model load fails, return cached/default value + `X-Degraded: true`.
4. **Versioned.** All routes prefixed `/v1/...`.
5. **Observable.** Every request emits structured logs + Prometheus metrics (latency, model name, cache hit/miss).

---

## 6.2 Endpoints

### 6.2.1 `POST /v1/summarize`

**Purpose:** Abstractive summary of a long article.

**Request**
```json
{
  "text": "full plain-text article body",
  "maxWords": 60,
  "style": "neutral" | "engaging" | "academic"
}
```

**Response 200**
```json
{
  "summary": "In a landmark shift for Indian universities...",
  "confidence": 0.87,
  "model": "facebook/bart-large-cnn",
  "tokensIn": 1240,
  "tokensOut": 55,
  "cached": false
}
```

**Errors:** `422` (empty text), `503` (model unavailable)

---

### 6.2.2 `POST /v1/keywords`

**Purpose:** Extract keywords / tags for a new article.

**Request**
```json
{ "text": "...", "maxKeywords": 10 }
```

**Response 200**
```json
{
  "keywords": ["education policy", "NEP 2020", "classroom tech", "..."],
  "model": "yake"
}
```

---

### 6.2.3 `POST /v1/recommend`

**Purpose:** Personalized / content-based article recommendations.

**Request**
```json
{
  "userId": "ObjectId-string | null",
  "seedArticleId": "ObjectId-string | null",
  "recentCategories": ["research_innovation"],
  "limit": 6,
  "candidatePool": [
    { "id": "a1", "title": "...", "tags": ["ai","edu"], "category": "..." },
    { "id": "a2", "title": "...", "tags": ["..."] }
  ]
}
```

The monolith is responsible for providing the **candidate pool** (last 200 published). The AI service only ranks it.

**Response 200**
```json
{
  "recommendations": [
    { "articleId": "a17", "score": 0.92, "reason": "similar tags" },
    { "articleId": "a04", "score": 0.88, "reason": "same category" }
  ],
  "model": "sentence-transformers/all-MiniLM-L6-v2"
}
```

---

### 6.2.4 `POST /v1/tts`

**Purpose:** Generate MP3 audio narration of article body.

**Request**
```json
{
  "articleId": "...",
  "text": "plain text",
  "voice": "en-IN-female-1",
  "speed": 1.0
}
```

**Response 200**
```json
{
  "audioBase64": "UklGRiQA...",
  "durationSec": 412,
  "format": "mp3",
  "model": "coqui-XTTS-v2"
}
```

The monolith uploads the returned audio to S3 and stores the URL in `articles.ai.ttsAudioUrl`.

For large articles, the service may chunk internally and concatenate.

---

### 6.2.5 `POST /v1/semantic-search`

**Purpose:** Embedding-based retrieval over article corpus.

**Request**
```json
{
  "query": "AI tutoring tools in Indian schools",
  "limit": 20,
  "candidatePool": [
    { "id": "a1", "embedding": [0.12, ...] }
  ]
}
```

Or, if the service maintains its own FAISS/Qdrant index:

```json
{ "query": "...", "limit": 20 }
```

**Response 200**
```json
{
  "results": [
    { "articleId": "a33", "score": 0.89 },
    { "articleId": "a12", "score": 0.84 }
  ]
}
```

---

### 6.2.6 `POST /v1/moderate`

**Purpose:** Classify comment toxicity / spam.

**Request**
```json
{ "text": "You are an idiot" }
```

**Response 200**
```json
{
  "toxic": true,
  "score": 0.94,
  "labels": ["insult", "harassment"],
  "model": "unitary/toxic-bert"
}
```

---

### 6.2.7 `GET /v1/healthz`

Liveness probe. Returns `{ "status": "ok", "models": { ... } }`.

### 6.2.8 `GET /v1/readyz`

Readiness probe. Returns 200 only if all required models are loaded.

### 6.2.9 `GET /v1/metrics`

Prometheus metrics exposition.

---

## 6.3 Models & Runtime

| Task | Default model | RAM | GPU? |
|------|---------------|-----|------|
| Summarize | `facebook/bart-large-cnn` | 2 GB | optional |
| Keywords | `yake` (non-ML) | 100 MB | no |
| Recommend | `all-MiniLM-L6-v2` | 500 MB | no |
| TTS | `coqui-XTTS-v2` | 4 GB | recommended |
| Semantic search | `all-MiniLM-L6-v2` | shared | no |
| Moderation | `unitary/toxic-bert` | 500 MB | no |

All models are loaded **lazily on first request** and cached in memory. Model files are bundled into the Docker image or mounted from an EFS volume.

---

## 6.4 Integration Flow (Monolith ↔ AI)

The monolith uses an `ai-proxy` module as its sole AI gateway:

```
Article Service ──► ai-proxy.summarize(text)
                           │
                           ▼
                 circuit breaker (opossum)
                           │
                           ├── open ──► return cached/null, log degraded
                           │
                           └── closed ──► axios.post('/v1/summarize', ...)
                                              │
                                              ▼
                                       (2s timeout)
                                              │
                                              ├── success → return JSON
                                              └── failure → retry once → fallback
```

**Failure policy:**
- Max 1 retry with 200 ms jitter
- Circuit breaks after 5 consecutive failures, cools down for 30 s
- On degraded, the article is still published — missing summary is regenerated later by a cron job

**Idempotency:** Summaries are cached on `articles.ai.summary`. The AI endpoint is only called if the cached value is missing or `force=true`.

---

## 6.5 Input/Output Size Limits

| Endpoint | Max input | Max output |
|----------|-----------|------------|
| `/summarize` | 20,000 chars | 500 chars |
| `/keywords` | 20,000 chars | 20 keywords |
| `/recommend` | 200 candidates | `limit` recs (≤ 50) |
| `/tts` | 10,000 chars | 10 MB audio |
| `/semantic-search` | 512 chars query | 50 results |
| `/moderate` | 2,000 chars | single label set |

Requests exceeding limits return `413 PAYLOAD_TOO_LARGE`.

---

## 6.6 Future Extensibility

Planned additions (Phase 3+), each as a new `/v1/*` endpoint so the monolith doesn't change:

- `POST /v1/translate` — multilingual support for international readers
- `POST /v1/image-caption` — auto alt-text for accessibility
- `POST /v1/fact-check` — cross-reference claims against a curated corpus
- `POST /v1/title-suggest` — headline generator during drafting
- `POST /v1/seo-optimize` — meta description + tags
- `POST /v1/plagiarism-check` — detect lifted content
- `POST /v1/trend-forecast` — predict article trending likelihood

The service can swap from local HuggingFace models to hosted LLM APIs (Claude, GPT-4o) by changing only the internal model-loader module — the REST contract stays stable.
