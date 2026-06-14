# Infimit

> A multi-tenant news & events platform for the higher-education ecosystem —
> editorial workflow, AI summarization, and a public reader portal.

**Status:** Phase 1 (MVP) is **dev-complete**, tagged `v0.5.0-subphase5-dev-complete`.
All five subphases shipped and the AI service is integrated; deployment is the
remaining step (intentionally deferred). For the detailed, authoritative
current-state brief, start with [`CONTEXT.md`](CONTEXT.md).

---

## What it is

Infimit lets institutions publish news and events through a full editorial
pipeline — authors draft, editors review and approve, then publish — with
AI-generated article summaries and a public reader experience (home feed,
categories, search, article pages, e-paper archive, bookmarks).

## Architecture

A monorepo of three services:

| Service | Stack | Responsibility |
|---------|-------|----------------|
| `backend/` | Node 20 · Express · TypeScript · MongoDB · Redis · S3/MinIO | REST API, auth (RS256 JWT + RBAC), article lifecycle, comments, e-paper, search, reader feeds, analytics, media, and the `ai-proxy` client |
| `frontend/` | React 18 · Vite · TypeScript · Tailwind · React Router v6 · TanStack Query · Zustand | Public reader portal + role-based dashboards (author / editor / admin) |
| `ai-service/` | Python 3.11 · FastAPI · Groq | Internal AI endpoints. `/v1/summarize` (Groq `llama-3.3-70b-versatile`) is live; the rest are stubbed for later phases |

The backend reaches the AI service only through an internal HTTP client
(`ai-proxy`) wrapped in a circuit breaker and authenticated by a shared
`X-Internal-Key`. If the AI service is down, the backend degrades gracefully
(articles publish with no summary rather than failing).

## Tech stack

- **Backend:** Node.js 20, Express, TypeScript (strict), MongoDB/Mongoose,
  Redis (ioredis), AWS S3 / MinIO, Argon2id, RS256 JWT, opossum, pdfkit,
  Zod, Pino.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, React Router v6,
  TanStack Query, Zustand, MSW, DOMPurify, react-helmet-async.
- **AI service:** Python 3.11, FastAPI, Pydantic v2, Groq SDK, uvicorn.
- **Tooling:** ESLint, Prettier, Jest (backend), Vitest (frontend),
  pytest (ai-service), GitHub Actions CI, Docker Compose.

## Repository layout

```
backend/      Node/Express API (modular monolith)
frontend/     React/Vite reader portal + dashboards
ai-service/   FastAPI AI microservice
docs/         Product + architecture docs (PRD, system design, per-subphase handler docs)
CONTEXT.md    Authoritative current-state brief — start here
TESTING.md    Manual QA catalogue
```

## Getting started

**Prerequisites:** Node 20, Python 3.11+, Docker. A free
[Groq](https://console.groq.com) API key is needed only for real AI summaries.

**1. Infrastructure** (MongoDB + Redis + MinIO):

```bash
docker compose -f docker-compose.dev.yml up -d mongo redis minio minio-init
```

**2. Backend** — http://localhost:4000

```bash
cd backend
cp .env.example .env
npm install
npm run keys:generate          # RS256 JWT dev keypairs
npm run migrate && npm run seed
npm run dev
```

**3. Frontend** — http://localhost:5173

```bash
cd frontend
npm install
npm run dev
```

**4. AI service** — http://localhost:8000 (optional; the backend degrades
gracefully without it)

```bash
cd ai-service
python -m venv venv
venv/bin/python -m pip install -r requirements.txt      # Windows: venv\Scripts\python
# Create ai-service/.env with GROQ_API_KEY and an AI_INTERNAL_KEY
# that matches backend/.env, then:
venv/bin/python -m uvicorn app.main:app --port 8000
```

Dev seed accounts (admin / editors / author) share one password — see
`backend/scripts/seed.ts`.

## Testing

| Service | Command | Notes |
|---------|---------|-------|
| Backend | `npm test` | Jest + mongodb-memory-server |
| Frontend | `npm test` | Vitest |
| AI service | `pytest` | FastAPI TestClient; Groq is mocked in unit tests |

CI (GitHub Actions, [`.github/workflows/ci.yml`](.github/workflows/ci.yml))
runs **backend**, **frontend**, and **ai-service** checks on every pull
request and every push to `main`. All must pass to merge.

## Project status

Phase 1 (MVP) shipped across five subphases — Foundations → Identity →
Content Engine → Editorial Workflow → Reader Experience — and is tagged
`v0.5.0`. The AI service is merged and integrated end-to-end. Deployment was
intentionally deferred (no cloud accounts in scope). Phase 2 will add
semantic search, recommendations, the remaining AI endpoints, and the
deployment pipeline.

See [`CONTEXT.md`](CONTEXT.md) for the authoritative current-state brief and
[`docs/`](docs/) for product and architecture documentation.

## Team

Built by four engineering interns:

- **Srishti Doshi** — Frontend
- **Prince Malviya** — Backend
- **Zamanuddin Khan** — AI service
- **Saloni Patil** — AI service

## License

Developed as part of an internship; intended for educational and development
purposes.
