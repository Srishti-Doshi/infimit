# 📰 Infimit — AI-Powered Digital Newspaper Platform

**Complete System Blueprint & Technical Documentation**

This `docs/` folder contains the complete, production-grade architecture documentation required to build the Infimit platform end-to-end.

---

## 📑 Document Index

| # | Document | Purpose |
|---|----------|---------|
| 1 | [Product Requirement Document (PRD)](01-PRD.md) | Product vision, personas, goals, success metrics |
| 2 | [System Architecture](02-system-architecture.md) | High-level diagram, components, request lifecycles |
| 3 | [Module Breakdown](03-module-breakdown.md) | Backend modules, responsibilities, interactions |
| 4 | [Database Design](04-database-design.md) | Collections, schemas, relationships, indexes |
| 5 | [API Documentation](05-api-documentation.md) | Endpoints, request/response, RBAC, errors |
| 6 | [AI Service Documentation](06-ai-service.md) | FastAPI endpoints, models, integration flows |
| 7 | [Workflow & State Management](07-workflows.md) | Article, comment, organisation state machines |
| 8 | [Analytics & Tracking Plan](08-analytics.md) | Metrics, trending formula, storage strategy |
| 9 | [Phase-wise Development Plan](09-development-phases.md) | MVP → scaling → advanced roadmap |
| 10 | [Security & Access Control](10-security.md) | JWT, RBAC, data protection |
| 11 | [DevOps & Deployment](11-devops.md) | Docker, CI/CD, hosting, environments |
| 12 | [Folder Structure](12-folder-structure.md) | Monolith + AI service directory trees |
| 13 | [Feature Documentation](13-feature-documentation.md) | Deep-dive per feature: flow, logic, edge cases |

---

## 🧱 Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | **React + TypeScript** (Vite), TailwindCSS, Redux Toolkit / Zustand, React Query |
| Backend (Modular Monolith) | **Node.js + Express + TypeScript** |
| Primary DB | **MongoDB** (Mongoose ODM) |
| Cache / Queue | **Redis** (ioredis) |
| AI Microservice | **Python 3.11 + FastAPI** |
| Object Storage | S3-compatible (AWS S3 / Cloudflare R2) |
| Auth | JWT (access + refresh), httpOnly cookies |
| Communication | REST (JSON), HTTP/1.1 keep-alive |
| Container | Docker + docker-compose |
| CI/CD | GitHub Actions |
| Hosting | AWS ECS / Render / Railway |

---

## 👥 Roles at a Glance

1. **Admin** — Manages editors, organisations, article approvals, e-paper uploads, analytics
2. **Editor** — Creates/edits articles, moderates comments, controls placement, manages ads
3. **Organisation / Author** — Submits articles & events, manages branding profile
4. **Reader** — Reads, comments, bookmarks, subscribes, views e-papers

---

## 🧭 Navigation Tips

- Start with the **PRD** if you're new to the project.
- Jump to **System Architecture** and **Module Breakdown** if you're a backend engineer.
- Read **API Documentation** and **Database Design** before writing any endpoint.
- Frontend engineers should read **Feature Documentation** + **API Documentation**.
- DevOps engineers should start with **DevOps & Deployment** + **Security**.
