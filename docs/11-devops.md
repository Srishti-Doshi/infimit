# ⚙️ 11. DevOps & Deployment Plan

The platform consists of three deployable units and their supporting stores. Everything is containerized and deployed via GitHub Actions.

---

## 11.1 Deployable Units

| Unit | Language | Port | Image |
|------|----------|------|-------|
| **frontend** | React + Vite (static) | 80 (via CDN) | `infimit/frontend:<sha>` |
| **backend** | Node.js 20 + Express | 4000 | `infimit/backend:<sha>` |
| **ai-service** | Python 3.11 + FastAPI | 8000 | `infimit/ai-service:<sha>` |

Supporting services:
- MongoDB (managed — Atlas)
- Redis (managed — Upstash / ElastiCache)
- S3 / Cloudflare R2 (managed — object storage)

---

## 11.2 Environments

| Env | Purpose | Data | Access |
|-----|---------|------|--------|
| **local** | Developer workstation | Seeded fake data | anyone |
| **dev** | Shared integration | Refreshed nightly | eng team |
| **staging** | Pre-prod, mirrors prod | Anonymized prod snapshot weekly | eng + QA + product |
| **production** | Real users | Real | on-call only |

Each env has its own:
- Mongo cluster (or DB within shared cluster in dev)
- Redis instance
- S3 bucket
- `.env` file in Vault
- DNS subdomain (`api.infimit.com`, `staging-api.infimit.com`, etc.)

---

## 11.3 Local Development — `docker-compose.yml`

```yaml
version: "3.9"
services:
  mongo:
    image: mongo:6
    ports: ["27017:27017"]
    volumes: ["mongo-data:/data/db"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    ports: ["4000:4000"]
    env_file: ./backend/.env.local
    depends_on: [mongo, redis, ai-service]
    volumes: ["./backend:/app"]

  ai-service:
    build: ./ai-service
    ports: ["8000:8000"]
    env_file: ./ai-service/.env.local
    volumes: ["./ai-service:/app", "./models:/models"]

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    env_file: ./frontend/.env.local
    volumes: ["./frontend:/app"]
    command: npm run dev

volumes:
  mongo-data:
```

Bootstrap:
```
git clone ...
cp .env.example .env.local    # repeat per service
docker compose up
npm --workspace backend run seed
```

---

## 11.4 Dockerfiles (high level)

### Backend (`backend/Dockerfile`)
- Multi-stage: builder installs deps + compiles TS → runner uses `node:20-alpine` + only `dist/` + `node_modules --production`
- Non-root user `node`
- Healthcheck hitting `/healthz`
- Image size target: < 200 MB

### AI service (`ai-service/Dockerfile`)
- Base `python:3.11-slim`
- Multi-stage: builder installs pip wheels → runner keeps only runtime deps
- Models mounted from volume (not baked) in staging/prod to keep image small
- Non-root user `app`
- Image size target: < 1.5 GB

### Frontend (`frontend/Dockerfile`)
- Builder runs `vite build` → `nginx:alpine` serves `dist/`
- Nginx config enables gzip, brotli, long cache headers for hashed assets
- Image size target: < 50 MB

---

## 11.5 CI/CD Pipeline (GitHub Actions)

```
on: push (any branch)
jobs:
  lint:
    - eslint, prettier, typecheck (backend + frontend)
    - ruff, black, mypy (ai-service)

  test:
    - backend: jest unit + supertest integration (against mongo-memory-server + redis-mock)
    - frontend: vitest + react-testing-library
    - ai-service: pytest

  build-image:
    needs: [lint, test]
    - docker build & push to GHCR tagged with git sha

  deploy-staging:
    needs: build-image
    if: branch == develop
    - kubectl set image / ECS update-service
    - run db migrations (mongo-migrate)
    - smoke tests

  deploy-production:
    needs: build-image
    if: branch == main
    environment: production (requires manual approval)
    - blue/green swap
    - smoke tests
    - slack notify
```

---

## 11.6 Hosting Architecture (Production)

**Target cloud:** AWS (alt: Render or Railway for smaller budgets)

```
                Route 53
                    │
                    ▼
              CloudFront (CDN)
                    │
         ┌──────────┼──────────┐
         ▼                     ▼
     S3 (static)         ALB (public)
                              │
                    ┌─────────┴────────┐
                    ▼                   ▼
              ECS Service          ECS Service
              (backend, 2+)        (ai-service, 1+)
                    │                   │
                    ▼                   ▼
              VPC private subnets → internal SG
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
      Mongo      Redis       S3
      Atlas     Upstash     bucket
```

- Load balancer terminates TLS (ACM cert)
- WAF rules (rate limit, common attack patterns) in front of ALB
- Autoscaling on CPU + request count
- Each ECS task has read-only root filesystem + minimal IAM role
- All inter-service traffic stays inside VPC (AI service not publicly reachable)

---

## 11.7 Observability

| Layer | Tool |
|-------|------|
| Error tracking | **Sentry** (backend + frontend + ai-service) |
| Logs | **CloudWatch Logs** (or Loki) — structured JSON from Pino |
| Metrics | **Prometheus** scraping `/metrics` on backend and ai-service |
| Dashboards | **Grafana** |
| Traces | **OpenTelemetry → Tempo / Jaeger** (phase 2) |
| Uptime | **BetterUptime / UptimeRobot** pinging `/healthz` |
| Alerts | Prometheus Alertmanager → PagerDuty |

### Key dashboards
- API latency p50/p95/p99 per route
- Error rate per route
- DB connection pool usage
- Redis hit/miss ratio
- AI service queue depth + model latency
- Trending cron duration

---

## 11.8 Backups & Disaster Recovery

- **Mongo Atlas** continuous backups (7-day point-in-time)
- Nightly encrypted snapshots to a **separate AWS account** (off-site)
- Redis is ephemeral; no backups required
- S3 buckets have **versioning on** + **MFA delete** for production
- **Quarterly DR drill**: restore staging from prod backup, verify integrity

**RTO:** 1 hour · **RPO:** 5 minutes

---

## 11.9 Release Strategy

- **Trunk-based development** — short-lived branches, merge to `main` via PR
- **Feature flags** via [GrowthBook] / ConfigCat for risky features
- **Blue/green** deploys: two ECS target groups, swap after health checks
- **Rollback:** one-command `git revert` + redeploy; or ALB target group flip back

---

## 11.10 Cost Snapshot (rough, month 3)

| Item | Estimate |
|------|----------|
| ECS Fargate (4 tasks) | $120 |
| Mongo Atlas M10 | $60 |
| Redis (Upstash 1GB) | $40 |
| S3 + CloudFront | $30 |
| Route 53 + WAF | $20 |
| Sentry team tier | $26 |
| **Total** | **~$300/mo** |

Scales linearly until ~250K MAU. Beyond that, heaviest levers are Mongo tier and CloudFront bandwidth.
