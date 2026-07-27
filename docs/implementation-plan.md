# RCGM — Phased Implementation Plan

This plan follows the exact workflow mandated in the task brief (§14). Steps 1–2 (Inspect, Plan)
are this document plus `feature-inventory.md`, `roles-and-permissions.md`, `architecture.md`,
`database-schema.md`. Steps 3–7 are executed in order below and tracked live in
`implementation-progress.md`.

## Guiding constraints carried into every phase

1. No frontend authentication/authorization — the backend is the only source of truth.
2. No localStorage/IndexedDB for application records — everything lives in PostgreSQL + the
   local file store, accessed exclusively through the authenticated API.
3. Every business rule identified in `feature-inventory.md` is preserved; the four explicitly
   identified gaps (vehicle conflict detection, expense summary history, handover history,
   guest-link access logging) are added as documented enhancements, not new unrelated features.
4. Tenant isolation and RBAC are enforced server-side on every route, not just hidden in the UI.
5. Seed data is idempotent (`scripts/seed.py` can run repeatedly without duplicating rows).

## Phase 0 — Repository & environment scaffolding

- `rcgm/` structure per the brief: `apps/web`, `apps/api`, `docs/`, `infrastructure/`.
- `docker-compose.yml`, `.env.example`, base Dockerfiles for `api` and `web`, top-level `README.md`.
- Deliverable: `docker compose up --build` boots three empty-but-healthy services.

## Phase 1 — Foundation (auth, tenancy, RBAC, shell, audit)

- SQLAlchemy models + Alembic migration for: tenants, tenant_settings, users, sessions,
  login_attempts, permissions/role_permissions/user_permissions, roles lookup, audit_events.
- `core/security.py`: Argon2id hashing, session issuance/verification, login rate limiting.
- `deps.py`: `get_current_user`, `require_role(*roles)`, `get_tenant_scope`.
- `services/audit.py`: `record_event(...)`.
- Routers: `/api/auth` (login, logout, me), `/api/health`, `/api/health/ready`.
- Seed script v1: one tenant (Jims Diamond Lounge) + 8 demo users (one per role) with Argon2
  hashes of the same demo passwords used in the prototype, documented as dev-only.
- Frontend: login page (navy/gold branding), authenticated app shell (topbar, role-aware
  sidebar from a server-fetched `/api/auth/me`), logout, disabled-user error message, empty
  role dashboards returning "no data yet."
- **Verification gate**: all 8 seeded users can log in and land on a role-correct empty
  dashboard; a wrong password / inactive user is rejected with a generic error; audit_events
  gets a LOGIN row each time.

## Phase 2 — Core features (guests, requests, companions, documents, clearance, trip shell)

- Models/migrations: guests, guest_preferences, trip_groups, trips, companions,
  trip_clearances, trip_notes, trip_handovers, trip_checklist_items, documents, master-data
  tables needed as FK targets (hotels, airlines, vehicles, drivers, transport_vendors, packages,
  marketing_agents, currencies, visa_fee_guides) since the request form references packages/
  agents from the very first workflow.
- `services/storage.py` (local disk backend) + `/api/files` upload/download routers with
  MIME/size validation and randomized storage keys.
- `services/trip_numbering.py` (tenant-scoped sequence generator for TRIP-/GRP-/BK- numbers).
- Marketing: guest arrival request wizard (React Hook Form + Zod, mirroring every validation
  rule in feature-inventory §4 including the 182-day passport-expiry warning and the
  arrival/departure ordering hard rule), draft save/edit/cancel, companion add/remove, recurring
  guest lookup + pre-fill.
- Coordinator: trip detail shell with tabs (Overview/Guest/Companions/Documents/Clearance/
  Notes/Handover/Timeline populated; Flights/Hotel/Visa/Transport/Expenses/Checklist tabs render
  a "locked until cleared"/"coming in next phase" state until Phase 3).
- Clearance recording endpoint + gating (`TripStatusService`), locking Reservations/Transport
  visibility until clearance exists.
- Master data CRUD (Tenant Admin) + read-only view (Coordinator) for the 8 catalogues, soft
  deactivate only.
- **Verification gate**: a Marketing user can create, save-draft, edit, and submit a request
  with a companion and a passport upload; a Coordinator can see it, record clearance, and the
  trip auto-transitions SUBMITTED→CLEARED; every step produces the correct audit_events rows.

## Phase 3 — Operational features (bookings, visas, transport, groups, tasks, notifications)

- Models/migrations: flight_bookings, hotel_bookings, visa_applications, transport_legs,
  notifications.
- Flight/Hotel booking services with the exact validation set from feature-inventory §7
  (PNR/confirmation-no required to confirm, cancellation charge flow, payment permission gate,
  currency + manual LKR equivalent, hotel amount auto-calc).
- Visa lane service (feature-inventory §8): fee-guide pre-fill (editable), status-dependent
  required fields, Coordinator-only mutation.
- Transport leg service (feature-inventory §9) including the **new** vehicle double-booking
  conflict check (warn + require override reason + audit event) and the cost-field hiding for
  the Transport role at the serialization layer (not just the UI).
- Trip groups: create/detail/add-remove member, group-level shared bookings/legs.
- `ChecklistService` (derived lamp states) + `FlagWindowService` (amber/red anchor computation)
  → Open Tasks endpoint with the brief's required filters (urgency, trip, guest, task type,
  date range, department) — an enhancement over the prototype's unfiltered list.
- Notifications service + polling endpoint + bell UI; all trigger points from
  feature-inventory §14 wired, plus the two the brief adds (handover created/acknowledged,
  guest link created/revoked).
- Boards: arrivals/departures run sheet, dispatch board, F&B arrival-preferences board.
- **Verification gate**: Reservations can create/confirm a flight and hotel booking; Transport
  can assign and complete pickup/drop legs without ever seeing cost fields; assigning the same
  vehicle to overlapping times without override is blocked; Open Tasks correctly escalates
  amber/red per tenant settings.

## Phase 4 — Closure & reporting

- Models/migrations: expense_summaries, expense_summary_items, package_qualification_flags,
  guest_share_links, guest_link_access_log.
- `ExpenseService`: generate versioned snapshot, staleness detection via audit events after
  `generated_at`, history retained (never overwritten) — closes the prototype gap explicitly.
- `ChecklistService` gate for CLOSED transition (`gateCheck` equivalent) wired into
  `TripStatusService`.
- Manager package-qualification endpoint (history-preserving).
- Guest share link: CSPRNG token, expiry, revoke/regenerate, optional access logging; public
  `/api/public/trips/{token}` endpoint returning only the guest-safe fields (never cost/payment/
  passport/DOB/internal notes/compliance/audit/private docs) + a matching public Next.js route.
- Reports module: all 9 reports from feature-inventory §21 as real DB queries with filters +
  CSV export + print-friendly view.
- **Verification gate**: a fully-arranged trip can pass every checklist item, generate a current
  (non-stale) expense summary, receive a Manager qualification decision, and transition through
  COMPLETED → CLOSED; the guest link renders correctly and hides every restricted field; all 9
  reports return real, filterable data and export valid CSV.

## Phase 5 — Hardening & verification

- Security pass: confirm no plaintext secrets, CSRF header enforcement, rate limiting behavior,
  file upload validation, IDOR spot-checks across every tenant-scoped router, error responses
  never leak stack traces (global exception handler → generic envelope + server-side log).
- Backend tests (pytest): auth, RBAC, tenant isolation, status transitions, clearance gating,
  booking validation, vehicle conflict, expense staleness, closure gate, guest-link expiry,
  audit-event creation on representative mutations.
- Frontend tests (Playwright/Vitest as applicable): login, request creation/submission,
  clearance, flight booking, hotel booking, transport assignment, expense generation, closure,
  smoke test per role dashboard.
- Full `docker compose down && docker compose up --build` restart test confirming data/files
  survive via named volumes.
- Update `docs/implementation-progress.md` to final state for the local-development milestone.

## Explicit non-goals for this task (per brief §16)

- No production deployment, no Ubuntu VPS provisioning, no domain/TLS configuration.
- No real KYC/AML/PEP/sanctions screening logic — clearance remains a recorded external result.
- No automatic FX conversion — currency + manually entered LKR equivalent only.
- No paid third-party services for local development.
