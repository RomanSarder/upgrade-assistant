# Dependency Upgrade Advisor

Renovate and Dependabot tell you what to upgrade. This tells you how risky that upgrade is and why.

The agent reads the actual changelog for each outdated package, extracts breaking changes using RAG over embedded changelog content, and produces a risk-rated report — so you know which upgrades to batch this sprint and which ones need a migration.

---

## The problem

Every non-trivial Node.js project has a backlog of available dependency upgrades. The risk assessment work — reading changelogs, identifying breaking changes, deciding whether to upgrade now or defer — gets skipped because it's tedious. Engineers defer upgrades indefinitely, then get surprised when they finally do them in bulk.

The questions that actually matter:

- "axios 0.x → 1.0 is available — does it break my interceptors?"
- "I have 12 available upgrades — which ones can I batch safely?"
- "React 17 → 18 dropped — what do I actually need to change?"

None of these can be answered by a version bump notification. They require reading and reasoning over changelog content.

---

## What it does

Upload a `package.json`. The agent:

1. Fetches changelogs for every outdated package from GitHub Releases
2. Chunks and embeds the content into pgvector
3. Runs semantic search over the embeddings to retrieve relevant sections
4. Reasons over retrieved content to identify breaking changes
5. Produces a risk-rated report with specific breaking change descriptions and recommendations

Risk levels: `safe` · `low` · `medium` · `high` · `breaking`

---

## Eval results

Evaluated against 20 known upgrades with verified ground truth from official changelogs and migration guides.

| Metric | Result | Target |
|---|---|---|
| Verdict accuracy | 20/20 (100%) | ≥ 85% |
| Breaking change recall | 46/51 (90%) | ≥ 85% |
| False positive rate | 0/2 (0%) | ≤ 15% |
| Avg cost per package | $0.11 | — |
| Avg latency per package | 51.4s | — |

---

## Why not just use Renovate or Dependabot?

| Tool | What it answers |
|---|---|
| Dependabot / Renovate | "lodash 4.18.0 is available" |
| Upgrade Advisor | "upgrading axios 0.x → 1.0 changes error handling — here's exactly what breaks" |

Both tools open PRs. Neither reads the changelog and tells you what will break. This project is the thing that comes after Renovate opens the PR — it tells you whether to merge it.

---

## Stack

| Technology | Role |
|---|---|
| Fastify | HTTP API — schema-first, fast, plugin-based |
| Drizzle ORM | SQL-first database access |
| BullMQ | Background job queue for changelog fetching and analysis |
| Redis | BullMQ backend |
| PostgreSQL + pgvector | Relational data + vector embeddings in one database |
| Voyage AI | Changelog chunk embeddings (1024-dim) |
| Anthropic Claude | Agent reasoning and risk synthesis |
| React + Vite | Frontend SPA |
| Railway | Deployment — three services + managed Postgres and Redis |

---

## Architecture

Three processes:

```
frontend/   React + Vite SPA
            Vite dev server on :5173, proxies /api/* → :3000

backend/    Fastify API
            POST /api/analyse   — budget check → enqueue BullMQ job
            GET  /api/stream    — SSE endpoint for agent reasoning
            GET  /api/results   — fetch past analysis results

worker/     BullMQ consumers
            Changelog fetch jobs
            Analysis jobs — runs the agent loop per package
```

One PostgreSQL database handles both relational data and vector embeddings via pgvector. No separate vector store.

The agent loop per package:

1. `fetch_changelog` — GitHub Releases API → raw CHANGELOG.md fallback
2. `query_changelog` — semantic search over embedded chunks
3. `check_npm_metadata` — deprecation status, maintenance health
4. `synthesise_risk` — writes recommendation, emits SSE event

See [`backend/src/changelog/README.md`](backend/src/changelog/README.md) for a detailed walkthrough of how changelogs are discovered, cleaned, chunked, embedded, and cached.

### Monorepo layout

```
packages/shared/        Shared types and constants (frontend + backend)
packages/backend-core/  Shared backend logic (backend + worker)
                        — DB schema (Drizzle), changelog pipeline,
                          agent tools, embeddings
backend/                Fastify API server (imports backend-core)
worker/                 BullMQ worker (imports backend-core via tsx path aliases)
frontend/               React + Vite SPA
```

`packages/backend-core` is the bridge between `backend` and `worker`. Both declare it as a workspace dependency. The worker resolves it at runtime via tsx tsconfig path aliases (no compilation step required for the worker); the backend compiles it as part of its TypeScript build.

## What I would do next

**Anthropic rate limiting**

Analysis jobs currently run as a single loop per repo. Under concurrent load, multiple jobs spike Anthropic API calls simultaneously and hit rate limits. The fix: move per-package analysis into individual BullMQ jobs with `concurrency: 5` on the worker, so throughput is controlled proactively. Backoff on 429 as a secondary safety net for token spikes on large changelogs.

**GitHub rate limiting**

Two changes, different effort levels:

- Add a GitHub token to authenticated requests — 5,000 requests/hour instead of 60. One environment variable.
- Deduplicate changelog fetches via Redis. 50 users analysing the same popular package currently triggers 50 GitHub API calls for identical data. A Redis check before each fetch collapses that to one call per package per TTL window.

The UI also doesn't distinguish between "no changelog exists" and "GitHub blocked us temporarily." Those need separate states — one is permanent, one resolves on retry.

**Linear integration**

The agent already writes the breaking change description and migration notes as part of its reasoning. That content should be one click away from becoming a tracked engineering task. A Linear integration would let you create a ticket directly from a breaking change row — agent reasoning pre-populated as the ticket body, no copy-paste.

---

## Local setup

### Prerequisites

- Node.js 20+
- Docker (PostgreSQL and Redis)
- Anthropic API key
- Voyage AI API key
- GitHub token (avoids rate limits on changelog fetching)

### 1. Start infrastructure

```bash
docker-compose up -d
```

Starts PostgreSQL on port 5432 and Redis on port 6379.

### 2. Install dependencies

```bash
npm ci
```

### 3. Run database migrations

```bash
npm run db:migrate --workspace=backend
```

### 4. Environment variables

**backend/.env**

```
DATABASE_URL=postgresql://upgrade:upgrade@localhost:5432/upgrade_advisor
REDIS_URL=redis://localhost:6379
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
GITHUB_TOKEN=
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
```

**worker/.env**

```
DATABASE_URL=postgresql://upgrade:upgrade@localhost:5432/upgrade_advisor
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
GITHUB_TOKEN=
```

### 5. Start the backend (terminal 1)

```bash
npm run dev --workspace=backend
```

Fastify API on http://localhost:3000.

### 6. Start the worker (terminal 2)

```bash
npm run dev --workspace=worker
```

### 7. Start the frontend (terminal 3)

```bash
npm run dev --workspace=frontend
```

Vite dev server on http://localhost:5173.
