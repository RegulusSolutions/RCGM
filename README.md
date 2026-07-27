# RCGM — Regulus Casino Guest Manager

A multi-tenant casino guest travel & hospitality lifecycle platform:
**guest request → compliance clearance → visa → flight → hotel → transport →
stay → expenses → completion → closure.**

This repository is a full rebuild of the original single-file HTML prototype
into a secure, production-shaped full-stack application. See `docs/` for the
functional spec extracted from the prototype, the role/permission matrix, the
architecture, the database schema, and the phased implementation plan.

> **Current state:** the backend (FastAPI + PostgreSQL) is fully implemented,
> migrated, seeded and verified end-to-end via Docker. The frontend
> (`apps/web`, Next.js) has not been started yet — see
> `docs/implementation-progress.md` for the detailed, up-to-date status of
> every module.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui — **not yet built** |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | Server-side sessions, HTTP-only cookies, Argon2 password hashing, RBAC, tenant isolation |
| File storage | Local disk (dev), abstracted behind `StorageBackend` for a later S3/R2/MinIO swap |
| Dev environment | Docker Compose |

## Quick start (backend + database only, today)

The `web` service in `docker-compose.yml` has no application yet, so bring up
only `postgres` and `api` for now:

```bash
docker compose up --build postgres api
```

This will:

1. Start PostgreSQL 16 on `localhost:5434` (chosen to avoid clashing with any
   pre-existing local Postgres on the default `5432`/`5433`).
2. Build and start the FastAPI backend on `http://localhost:8000`.
3. On every container start, the entrypoint (`apps/api/docker-entrypoint.sh`)
   automatically runs:
   - `alembic upgrade head` — applies all database migrations.
   - `python -m scripts.seed` — loads **idempotent, development-only** demo
     data (safe to run repeatedly; it looks up every entity by a natural key
     before inserting).

Once running:

- API: <http://localhost:8000>
- Interactive API docs (Swagger UI): <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>
- Liveness check: <http://localhost:8000/api/health>
- Readiness check (DB + storage): <http://localhost:8000/api/health/ready>

Once the frontend exists and its `Dockerfile` is added, `docker compose up
--build` (all three services) will bring up the complete stack, with the web
app on `http://localhost:3000`.

## Demo credentials (development seed only)

`scripts/seed.py` creates one demo tenant — **Jims Diamond Lounge (`JDL`)** —
with one user per role. Every password is `<username>123`:

| Username | Password | Role |
|---|---|---|
| `superadmin` | `superadmin123` | Super Admin (platform-level, no tenant) |
| `admin` | `admin123` | Tenant Admin |
| `marketing` | `marketing123` | Marketing Agent |
| `coordinator` | `coordinator123` | Coordinator (also holds Mark-Paid) |
| `reservations` | `reservations123` | Reservations (also holds Mark-Paid) |
| `transport` | `transport123` | Transport |
| `host` | `host123` | F&B / Host (restricted, view-only) |
| `manager` | `manager123` | Manager |

**These credentials are for local development only.** They are never seeded
outside of `ENVIRONMENT=development`, and must never be reused in a
production deployment.

## Database migrations

```bash
# Apply all pending migrations
docker compose run --rm --entrypoint alembic api upgrade head

# Create a new migration after changing SQLAlchemy models
docker compose run --rm --entrypoint alembic api revision --autogenerate -m "describe the change"
```

## Reset the development database

```bash
docker compose down -v   # drops the pgdata and uploads volumes
docker compose up --build postgres api
```

## Running backend tests

```bash
docker compose run --rm --entrypoint pytest api
```

(Backend test suite is not yet written — tracked in
`docs/implementation-progress.md` Phase 5.)

## Repository structure

```text
rcgm/
├── apps/
│   ├── web/            # Next.js frontend (not started yet)
│   └── api/             # FastAPI backend
│       ├── app/
│       │   ├── models/       # SQLAlchemy ORM models
│       │   ├── routers/      # API route groups (one file per domain)
│       │   ├── services/     # Business logic (checklist, expenses, flags, storage, ...)
│       │   ├── schemas/      # Pydantic request/response models
│       │   └── core/         # Errors, permissions constants
│       ├── alembic/          # Migrations
│       └── scripts/seed.py   # Idempotent development seed data
├── docs/                 # Functional spec, architecture, schema, plan, progress
├── infrastructure/        # docker/nginx configuration for later VPS deployment
├── docker-compose.yml
└── .env.example
```

## Troubleshooting

- **Port conflicts**: if `5434`, `8000`, or `3000` are already in use on your
  machine, override them in a local `.env` file (`POSTGRES_PORT`, `API_PORT`,
  `WEB_PORT`) — see `.env.example`.
- **"relation does not exist" errors**: migrations haven't run. Run
  `docker compose run --rm --entrypoint alembic api upgrade head` manually.
- **Seed data missing**: run `docker compose run --rm --entrypoint python api -m scripts.seed`.
- **Stale containers after a model change**: `docker compose build api` to
  rebuild, then re-run migrations.

## Documentation

- [`docs/feature-inventory.md`](docs/feature-inventory.md) — full functional
  spec extracted from the original HTML prototype.
- [`docs/roles-and-permissions.md`](docs/roles-and-permissions.md) — role
  matrix and permission rules.
- [`docs/architecture.md`](docs/architecture.md) — system architecture.
- [`docs/database-schema.md`](docs/database-schema.md) — schema design.
- [`docs/api-reference.md`](docs/api-reference.md) — API conventions and route groups.
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — phased plan.
- [`docs/implementation-progress.md`](docs/implementation-progress.md) — **live status of every module.**
