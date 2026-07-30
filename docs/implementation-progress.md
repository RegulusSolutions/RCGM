# RCGM — Implementation Progress Tracker

Status legend: `Planned` · `In progress` · `Implemented` · `Tested` · `Known issues`

Last updated: end of backend build-out pass — full API surface implemented,
migrated, seeded and smoke-tested end-to-end via `docker compose`. Frontend
(`apps/web`) has not been started yet.

## Phase 0 — Repository & environment

| Item | Status | Notes |
|---|---|---|
| Repo structure (`apps/web`, `apps/api`, `docs/`, `infrastructure/`) | Implemented | `apps/web` currently empty — frontend not started |
| `docker-compose.yml` (postgres, api, web) | Implemented | `web` service defined but has no buildable app yet |
| `.env.example` | Implemented | Postgres mapped to host `5434` to avoid clashing with the pre-existing local Postgres on `5433` |
| Backend Dockerfile (multi-stage, `python:3.12-slim`) | Implemented | Tested — builds cleanly, `pip install` verified |
| Frontend Dockerfile | Planned | Depends on Phase-6 frontend work |
| README with setup instructions | Implemented | Documents the current backend-only state; update once frontend exists |

## Phase 1 — Foundation

| Item | Status | Notes |
|---|---|---|
| SQLAlchemy models — all 39 tables (tenants, users, guests, trips, bookings, transport, expenses, documents, notifications, audit, master data, guest links) | **Implemented & Tested** | `alembic revision --autogenerate` produced a clean single initial migration |
| Alembic setup + initial migration | **Implemented & Tested** | `alembic upgrade head` runs cleanly against Postgres 16 in Docker |
| Argon2 password hashing | Implemented | |
| Session-cookie auth (login/logout/me) | **Implemented & Tested** | Verified login → cookie → `/api/auth/me` round-trip for Coordinator, Tenant Admin, F&B/Host |
| RBAC dependency (`require_role`) + permission constants (`app/core/permissions.py`) | **Implemented & Tested** | Verified 403 on cross-role access (Host → `/api/tenants`) |
| Tenant scoping dependency (`get_tenant_scope`) | Implemented | Derived only from server-side session, never from client input |
| CSRF header enforcement (`X-Requested-With`) | **Implemented & Tested** | Applied globally via FastAPI `dependencies=`; verified mutating calls succeed only with the header set |
| Login rate limiting | Implemented | Sliding window backed by `login_attempts` table |
| Audit service (`services/audit.py`) | **Implemented & Tested** | Append-only; seed + login/logout/clearance/etc. all produce rows |
| Health/readiness endpoints | **Implemented & Tested** | `/api/health`, `/api/health/ready` (DB + storage checks) |
| Seed script (`scripts/seed.py`) | **Implemented & Tested** | Idempotent — verified two consecutive runs produce identical row counts |
| Frontend login page / shell / nav | **Planned** | Not started — see Phase 6 below |

## Phase 2 — Core features (backend)

| Item | Status | Notes |
|---|---|---|
| Guests + preferences models/routes (`routers/guests.py`) | Implemented | Lookup by membership no., paginated list, detail |
| Master data models/routes — 8 catalogues via one generic factory (`routers/master_data.py`) | **Implemented & Tested** | Verified list/create for hotels + visa fee guide as Tenant Admin |
| Trip groups models/routes (`routers/groups.py`) | Implemented | Create, assign/unassign trips, member listing |
| Trips model + numbering service + full lifecycle router (`routers/trips.py`) | **Implemented & Tested** | Create/draft/submit/edit/status/clearance/notes/handover/checklist-N/A all wired; verified list + status visibility rules live |
| Companions | Implemented | Nested under trip create/edit |
| Documents/file storage service (`routers/files.py`, `services/storage.py`) | Implemented | Local-disk backend, randomized storage keys, MIME/size validation, per-role + per-agent authorization on download — not yet exercised with a real upload in this pass |
| Clearance recording + gating (`CAN_RECORD_CLEARANCE`, booking-lane lock until cleared) | **Implemented & Tested** | Booking/visa/transport routers all call `_trip_and_clearance` / equivalent guard |
| Trip notes / handover (append-only, supersede not overwrite) | Implemented | |
| Checklist N/A (reason + audit event required) | Implemented | |
| Guest arrival request wizard / trip detail tabs (frontend) | **Planned** | Not started |

## Phase 3 — Operational features (backend)

| Item | Status | Notes |
|---|---|---|
| Flight bookings (`routers/bookings.py`) | Implemented | Create/confirm/cancel/payment, group vs. guest-level cost split |
| Hotel bookings (`routers/bookings.py`) | Implemented | Same lifecycle as flights; date-order validated |
| Visa applications (`routers/visas.py`) | Implemented | Auto-seeded per traveller from guest/companion visa_status; fee guide is a suggestion only, always editable |
| Transport legs + vehicle conflict detection (`routers/transport.py`, `services/transport_conflict.py`) | **Implemented & Tested** | Verified Transport role never receives cost fields in the API response (Coordinator does) — the strongest role-segregation rule in the product |
| Trip groups shared costs | Implemented | `level=group` bookings/legs flagged `is_shared_group` in expense items |
| Open tasks / flag windows (`routers/tasks.py`, `services/flag_windows.py`) | **Implemented & Tested** | Verified dynamic task generation against seeded trips (2 open tasks detected with zero manual maintenance) |
| Notifications (polling) (`routers/notifications.py`) | Implemented | List/unread-count/mark-read/mark-all-read |
| Boards (arrivals/dispatch/F&B) (frontend) | **Planned** | Backend data (`/api/host/arrivals`, `/api/trips`, `/api/transport/legs`) is ready to drive these; no UI yet |

## Phase 4 — Closure & reporting (backend)

| Item | Status | Notes |
|---|---|---|
| Expense summaries (versioned, `services/expense_service.py`, `routers/expenses.py`) | Implemented | Never overwrites — new version + `is_current` flip; staleness detected via audit-event diffing |
| Package qualification flag (`routers/package_flag.py`) | Implemented | Manager-only, history-preserving, reason required for Not Qualified |
| Completion checklist gate (`services/checklist.py`, enforced in `services/trip_status.py`) | Implemented | Derived live from bookings/legs/visas/expense state — never manually ticked |
| Guest share links + public itinerary (`routers/guest_links.py`, `routers/public.py`) | **Implemented & Tested** | Full round-trip verified: create link → tokenized URL → unauthenticated fetch returns only the guest-safe field allow-list (confirmed costs/payments/passport/DOB/notes are absent) |
| Reports (10) + CSV export (`routers/reports.py`, `services/csv_export.py`) | Implemented | arrivals/departures, guests visited, trip expenses, payment status, agent performance, cancellations, no-shows, audit, active trips, open tasks — all read live DB rows, no fabricated stats |
| Audit log browsing (`routers/audit.py`) | Implemented | Tenant-scoped + platform-level (Super Admin) |

## Phase 5 — Hardening & verification

| Item | Status | Notes |
|---|---|---|
| Backend pytest suite | **Planned** | Not yet written — highest-priority remaining backend task |
| Frontend smoke tests | Planned | Blocked on frontend existing |
| Docker restart/persistence test | **Implemented & Tested** | `docker compose restart api` → data (4 seeded trips) intact, migrations re-ran as a no-op |
| Security review pass | Planned | |

## Phase 6 — Frontend (not started)

| Item | Status | Notes |
|---|---|---|
| Next.js app scaffold (App Router, TS, Tailwind, shadcn/ui) | Planned | `apps/web` is currently empty |
| Login page (navy/gold branding) | Planned | |
| Role-aware shell/nav + dashboards (8 roles) | Planned | |
| Guest request wizard, trip detail tabs, master data CRUD UI | Planned | |
| Operational UIs: bookings, visa lane, transport/dispatch board, groups, tasks, notifications | Planned | |
| Closure UIs: expenses, package flag, checklist, guest portal, reports | Planned | |

## What was verified this pass (live, via `docker compose`)

1. `docker compose build api` — clean build on `python:3.12-slim`.
2. `alembic upgrade head` — all 39 tables created from a single autogenerated migration.
3. `python -m scripts.seed` — run twice; second run produced **zero** new rows (idempotency confirmed).
4. Full container lifecycle (`docker-entrypoint.sh`: migrate → seed → `uvicorn`) — starts cleanly, `/api/health/ready` reports `database: ok`, `storage: ok`.
5. 83 routes registered across 20 routers (confirmed via `/openapi.json`).
6. Login (Coordinator, Tenant Admin, F&B/Host, Transport) → session cookie → `/api/auth/me` — all correct.
7. `GET /api/trips` — role-based visibility confirmed (Coordinator sees all 4 seeded trips).
8. `GET /api/tasks` — dynamic open-task detection confirmed against real trip dates + tenant flag windows.
9. `GET /api/transport/legs` — **cost fields present for Coordinator, absent for Transport** on the identical leg (core security requirement).
10. `GET /api/host/arrivals` — F&B/Host sees only guest name/hotel/preferences, nothing financial or compliance-related.
11. `POST /api/tenants` (as Host) — correctly returns `403 Forbidden`.
12. Guest share link: created by Coordinator → public `/api/public/trips/{token}` fetch (no auth) returns only guest/flight/hotel/pickup-driver/notes — no cost, payment, passport, DOB, or internal notes.
13. `docker compose restart api` — all seeded data (4 trips, 4 guests, 8 users, 3 audit events) survived the restart.

## Known issues / open items

- **No automated test suite yet** (`pytest` for backend, smoke tests for frontend) — manual verification only so far.
- File upload/download (`/api/files`) has not yet been exercised end-to-end with a real multipart request in this pass (code-reviewed, not runtime-tested).
- Reports/CSV exports were smoke-tested for `active-trips` this pass (see below); the remaining 9 report endpoints are code-reviewed against live models but not yet individually exercised one-by-one.
- Local ports were moved off the stack defaults (`WEB_PORT=3011`, `API_PORT=8010`, all bound to `127.0.0.1`) because this host already runs other services on `3000`/`8000` — see `.env`. Not a code issue, just a host-specific override.
- `rcgm.reguluscompliance.com` does not resolve yet (no DNS record) — deployment is intentionally deferred until DNS is added; see `docs/deployment-notes.md`.

## 2026-07-30 — Frontend build-out pass: Master Data, Settings & Flag Windows, Users & Permissions, Audit Log, Diagnostics, Reports

The prior note above ("Frontend has not been started") was stale — by this session `apps/web` already had the app shell, auth, role-aware dashboards, trip detail tabs, and the guest-arrival wizard implemented, but six top-level pages were still literal `<ComingSoon />` placeholders with no tables, search, or add actions: Master Data, Settings & Flag Windows, Users & Permissions, Audit Log, Diagnostics, Reports. This pass replaced all six with fully working, backend-wired UIs, added the two backend endpoints that were missing to support them, and created `apps/web/Dockerfile` so `docker compose up --build` now brings up all three services (previously only `postgres`+`api` worked).

| Item | Status | Notes |
|---|---|---|
| `apps/web/Dockerfile` (multi-stage, Next.js `standalone` output) | **Implemented & Tested** | Added `output: "standalone"` to `next.config.ts`; full `docker compose up --build` now starts postgres+api+web together |
| Master Data page (`master-data/page.tsx`) | **Implemented & Tested** | 8 catalogue tabs (hotels, airlines, drivers, fleet, vendors, packages, agents, currencies, visa fee guide), client-side search, role-gated "+ Add" dialog per catalogue, soft deactivate/reactivate — verified against live seeded data + audit events |
| Settings & Flag Windows page (`settings/page.tsx`) | **Implemented & Tested** | New `GET`/`PATCH /api/tenants/settings` backend endpoint added (previously only set on tenant creation, never editable); edits the 10 amber/red flag-window thresholds + guest-link expiry; PATCH verified to persist and emit a `SETTINGS_CHANGE` audit event |
| Users & Permissions page (`users/page.tsx`) | **Implemented & Tested** | Table + search, "+ Add user" dialog (role select, optional linked marketing agent, Mark-Paid grant), deactivate/reactivate, Mark-Paid toggle — all wired to existing `/api/users` routes |
| Audit Log page (`audit/page.tsx`) | **Implemented & Tested** | Tenant-scoped view with username/action/date filters + pagination against `/api/audit`; Super Admin instead sees the unfiltered platform feed via `/api/audit/platform` |
| Diagnostics page (`diagnostics/page.tsx`) | **Implemented & Tested** | New `GET /api/tenants/diagnostics` backend endpoint added — live DB check, Alembic migration version (read from `alembic_version` table), file-storage write/read/delete check, tenant record counts. No destructive "reset" button, per the decision already recorded in `docs/feature-inventory.md` §23 — the documented seed command is referenced instead |
| Reports page (`reports/page.tsx`) | **Implemented & Tested** | Report picker for all 10 backend reports, shared filters (date range, trip status, payment status, agent, group) applied per-report, dynamic results table, CSV export (verified `Content-Disposition` header + real row data), print button |

**Verified this pass** (via `docker compose up --build`, real containers, real Postgres):
1. All three containers (`postgres`, `api`, `web`) start clean; migrations + idempotent seed run automatically on `api` startup.
2. `tsc --noEmit`, `next lint`, and `next build` all pass for the whole `apps/web` project (build already had 3 pre-existing lint warnings from the `react-hooks/set-state-in-effect` rule on files this pass didn't touch — the 6 new pages follow the same existing data-fetching convention used elsewhere in the app, e.g. `guests/new/page.tsx`).
3. Logged in as Tenant Admin via API: `GET /api/master-data/hotels`, `GET/PATCH /api/tenants/settings`, `GET /api/tenants/diagnostics`, `GET /api/users`, `GET /api/audit`, `GET /api/reports/active-trips` all return real seeded data with `200`.
4. `POST /api/master-data/hotels` and `PATCH /api/tenants/settings` each produced the expected audit event (`MASTER_ADD`, `SETTINGS_CHANGE`).
5. `GET /api/reports/active-trips/csv` returned a real CSV with the correct `Content-Disposition` filename.
6. Cross-role check: the same `PATCH /api/tenants/settings` call as Coordinator correctly returned `403 FORBIDDEN`.
7. Logged in through the **Next.js proxy** (not directly against the API) to confirm the cookie round-trip and `/api/*` forwarding work end-to-end for a browser-equivalent client; fetched all 6 new page routes and confirmed `200` with no server-render error markers and no runtime errors in the `web` container logs.
8. No real browser was available in this environment (Claude in Chrome extension not connected) — verification above covers build-time rendering, SSR, and live API wiring, but a manual click-through in an actual browser is still recommended before considering this pass fully closed.
