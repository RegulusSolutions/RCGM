# RCGM — Architecture (Local Development)

## 1. High-level topology

```
                         ┌────────────────────────┐
   Browser  ───────────► │  Next.js (apps/web)     │   :3000
                         │  App Router, RSC + CSR   │
                         └───────────┬─────────────┘
                                     │ fetch() same-origin proxy (/api/*)
                                     │  → rewrites to backend, HTTP-only cookie forwarded
                                     ▼
                         ┌────────────────────────┐
                         │  FastAPI (apps/api)      │   :8000
                         │  REST, Pydantic, RBAC    │
                         └───────────┬─────────────┘
                            ┌────────┴─────────┐
                            ▼                  ▼
                   ┌────────────────┐  ┌───────────────────┐
                   │ PostgreSQL 16   │  │ Local file storage │
                   │ (docker volume) │  │ (docker volume)     │
                   └────────────────┘  └───────────────────┘
```

- Both apps run as separate Docker containers on a shared `rcgm_net` bridge network, plus
  `postgres`. Next.js talks to FastAPI over the internal Docker network
  (`http://api:8000`) for server-side calls, and the browser talks to Next.js, which proxies
  `/api/*` to the backend so the HTTP-only session cookie is always same-site from the browser's
  point of view (avoids CORS/cookie complications while keeping cookies HTTP-only + `SameSite=
  Lax`).
- File storage is a mounted volume `apps/api/storage/uploads` (outside the web root, never
  served by static file mounts) accessed only through an authenticated `/api/files/{id}`
  endpoint that streams bytes after an authorization + tenant-ownership check.

## 2. Backend (`apps/api`)

```
apps/api/
├── app/
│   ├── main.py                 # FastAPI app factory, middleware, routers
│   ├── config.py                # Pydantic Settings (.env driven)
│   ├── database.py              # SQLAlchemy engine/session
│   ├── deps.py                  # shared dependencies (current user, tenant scope, RBAC)
│   ├── security.py              # Argon2 hashing, session tokens, CSRF, rate limiting
│   ├── logging_config.py        # structlog / stdlib JSON logging setup
│   ├── models/                  # SQLAlchemy 2.0 ORM models (one module per domain)
│   ├── schemas/                 # Pydantic request/response models
│   ├── services/                # business rules (status engine, checklist, expense engine,
│   │                             #   flag windows, audit service, file storage service)
│   ├── routers/                 # one router per route group (see api-reference.md)
│   └── core/
│       ├── permissions.py       # role/permission constants + matrix from roles-and-permissions.md
│       └── errors.py            # consistent error envelope + exception handlers
├── alembic/                     # migrations
├── scripts/
│   ├── seed.py                  # idempotent development seed (Jims Diamond Lounge)
│   └── reset_dev_db.py
├── tests/
├── pyproject.toml / requirements.txt
└── Dockerfile
```

Key architectural decisions:
- **Business rules live in `services/`, not in routers or models** — e.g. `TripStatusService`
  owns `ALLOWED_NEXT`, clearance gating, and the CLOSED gate check; `ChecklistService` owns lamp
  derivation; `ExpenseService` owns snapshot generation + staleness; `FlagWindowService` owns
  amber/red computation for Open Tasks. Routers only orchestrate: validate input → call service →
  persist → audit → notify → return.
- **Audit is a cross-cutting service** (`services/audit.py`) called explicitly at every mutation
  point identified in the feature inventory; it is never optional and never user-editable (no
  DELETE/PATCH route exists for `audit_events`).
- **Database constraints, not just Pydantic**, enforce: valid status enum, non-null
  `tenant_id` FKs, `CHECK (departure_date >= arrival_date)`, unique booking/trip numbers per
  tenant, etc. Pydantic guards input shape/type; Postgres guards data integrity even if a bug
  bypasses a service.
- **RBAC dependency** (`deps.require_role(*roles)`) plus a **tenant-scope dependency**
  (`deps.get_tenant_scope`) are composed on every tenant-owned router. A resource-ownership
  check (`assert obj.tenant_id == scope.tenant_id`) additionally guards every single-object
  fetch to defeat IDOR even if a route filter were ever missed.
- **Storage abstraction** (`services/storage.py`) exposes `save(file) -> StoredFile`,
  `open_stream(key)`, `delete(key)` behind a `StorageBackend` protocol. `LocalDiskBackend` is
  used for localhost; the same interface is designed to be implemented later by `S3Backend` /
  `R2Backend` / `MinioBackend` without changing any calling code, per the requirement in §3 of
  the brief.

## 3. Frontend (`apps/web`)

```
apps/web/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (app)/                       # authenticated shell (layout enforces session + role)
│   │   ├── layout.tsx                # sidebar + topbar, role-aware nav from a server component
│   │   ├── dashboard/page.tsx        # role-dispatching dashboard
│   │   ├── guests/…
│   │   ├── trips/[tripId]/…          # tabs: overview/guest/companions/documents/clearance/
│   │   │                             # flights/hotel/visa/transport/expenses/checklist/notes/
│   │   │                             # handover/timeline
│   │   ├── groups/…
│   │   ├── master-data/…
│   │   ├── settings/…
│   │   ├── users/…
│   │   ├── tasks/…
│   │   ├── reports/…
│   │   └── audit/…
│   ├── g/[token]/page.tsx           # public guest itinerary (no auth shell)
│   └── api/[...proxy]/route.ts      # same-origin reverse proxy to FastAPI, forwards cookies
├── components/
│   ├── ui/                          # shadcn/ui primitives
│   ├── layout/ (Sidebar, Topbar, RoleGate)
│   ├── data-table/ (TanStack Table wrapper: pagination, sorting, filters)
│   └── trip/ (StatusBadge, ChecklistPanel, Timeline, HandoverBanner, ExpenseSummaryCard, …)
├── lib/ (api-client.ts, auth.ts, zod-schemas.ts, permissions.ts)
├── hooks/
└── middleware.ts                    # redirects unauthenticated users, role-based route guards
```

- **Server Components** fetch initial page data (guest list, trip detail) directly from FastAPI
  using the forwarded session cookie; **Client Components** are used only for interactive forms
  (React Hook Form + Zod), tables with client-side sort/filter, modals, and the notification bell
  polling.
- The frontend never authenticates or authorizes — `middleware.ts` only performs a cheap
  "is there a session cookie" redirect for UX; the backend is the sole source of truth for RBAC.
  Any role-conditional UI (hiding a button) is a convenience layer, not a security boundary.

## 4. Authentication & session design

- Login: `POST /api/auth/login` — verifies `username` (unique across tenants, matching the
  prototype's flat username namespace) + Argon2id password hash, checks `user.active`,
  increments/resets a rate-limit counter (per-IP + per-username, sliding window, in-memory for
  localhost, Redis-ready interface for later), issues an opaque, randomly generated session
  token (not JWT — JWTs are unnecessary for a first-party same-origin app and complicate
  revocation), stores the session server-side (`sessions` table: token hash, user_id, tenant_id,
  role, created_at, expires_at, last_seen_at, ip, user_agent), sets it as an `HttpOnly`,
  `Secure` (in prod)/`SameSite=Lax` cookie.
- Every authenticated request loads the session row, checks expiry + `user.active`, and re-hydrates
  `current_user` (id, tenant_id, role, name, username, agent_id, can_mark_paid). Session
  expiration is sliding (refreshed on activity) with an absolute max lifetime, both configurable.
- Logout deletes the session row and clears the cookie.
- Disabled users: `user.active = false` blocks new logins immediately and invalidates existing
  sessions on next request check.
- CSRF: same-site cookie + custom header (`X-Requested-With`) required on all mutating requests,
  checked by middleware, since the API is same-origin-proxied.
- No plaintext passwords stored or logged anywhere; audit log stores usernames, never passwords.

## 5. Multi-tenancy

- Single Postgres database, shared schema, `tenant_id` column on every tenant-owned table
  (row-level multi-tenancy) — simplest to operate for a first local version, and the isolation
  is enforced uniformly by the `deps.get_tenant_scope` + per-query filters + ownership asserts
  described above. This can be upgraded later (e.g., Postgres RLS policies) without changing the
  table shape.
- `tenants` table itself has no `tenant_id` (it *is* the tenant); only `SUPER_ADMIN` may read/
  write it.

## 6. Notifications

- Implemented as rows in `notifications` (recipient role **and/or** specific `user_id`, tenant,
  related trip, message, read flag, created_at). The frontend polls
  `GET /api/notifications?since=` every N seconds (client component, `setInterval`), matching the
  brief's "polling is acceptable for the first local version." The service layer
  (`services/notifications.py`) exposes `notify_role(tenant_id, role, message, trip_id)` and
  `notify_user(...)` so a later swap to WebSockets/SSE only touches the transport layer, not the
  call sites (mirrors the prototype's single `notify()` call sites almost 1:1).

## 7. File storage

- `documents` table stores metadata only (tenant_id, category, owner type/id, trip_id,
  uploaded_by, uploaded_at, mime_type, size_bytes, storage_key). The actual bytes live under
  `apps/api/storage/uploads/<tenant_id>/<random-uuid>.<ext>` — **randomized filenames**, original
  filename kept only in the metadata row, never in the path. Downloads always go through
  `GET /api/files/{document_id}` which re-checks tenant + role + trip-association authorization
  before streaming, so raw paths are never exposed to the client.

## 8. Observability

- Structured JSON logging (`structlog`) for every request (method, path, status, duration,
  user_id, tenant_id, request_id) and every service-level business event, correlated with the
  audit trail by `request_id`.
- `/api/health` (liveness: process up) and `/api/health/ready` (readiness: DB connection +
  migrations at head + storage directory writable) for Docker healthchecks.

## 9. Local development environment

- `docker-compose.yml` defines `postgres`, `api`, `web` with named volumes `pgdata` and
  `uploads`, an `.env` file for shared configuration, and a bridge network. `api` runs Alembic
  migrations on container start (idempotent) before starting Uvicorn; a separate one-shot
  `seed` profile/service runs `scripts/seed.py`.
- The repository already contains a top-level `.env` with a `DATABASE_URL` pointing at a
  Postgres instance on `localhost:5433` — `.env.example` mirrors this variable name so the same
  configuration surface works whether Postgres is the bundled `docker compose` service or an
  externally provisioned instance; nothing in the application code hard-codes the connection
  string.

## 10. Path to deployment (not executed in this task)

- The FastAPI/Next.js containers are already deployment-shaped (multi-stage Dockerfiles,
  environment-driven config, no localhost-only assumptions). `infrastructure/nginx/` holds a
  reference reverse-proxy config (TLS termination, static asset caching, upload size limits) to
  be wired up on the Ubuntu VPS in a later task — not activated locally. `docs/deployment-notes.md`
  captures these assumptions explicitly, as required by the brief.
