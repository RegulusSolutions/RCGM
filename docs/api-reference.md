# RCGM — API Reference (living document)

Base URL (local): `http://localhost:8000`. Interactive OpenAPI docs at `/docs` (Swagger) and
`/redoc`. This file is updated as each phase lands; see `implementation-progress.md` for what is
currently implemented vs planned.

## Conventions

- All request/response bodies are JSON; all mutating requests require the session cookie plus
  header `X-Requested-With: rcgm-web` (CSRF defense-in-depth).
- Pagination: `?page=1&page_size=25` on list endpoints, response envelope
  `{items: [...], page, page_size, total, total_pages}`.
- Filtering/sorting: list endpoints accept documented `?field=value` filters and `?sort=field` /
  `?sort=-field` for descending.
- Errors: consistent envelope
  `{"error": {"code": "STRING_CODE", "message": "human readable", "details": {...}}}` with the
  appropriate HTTP status; 500s never include stack traces or internal exception text in
  production mode (`DEBUG=false`).
- Every route enforces RBAC (`docs/roles-and-permissions.md`) and tenant scoping
  (`docs/architecture.md` §5) server-side.

## Route groups

| Prefix | Purpose |
|---|---|
| `/api/auth` | login, logout, current session (`/me`) |
| `/api/tenants` | Super Admin tenant CRUD + activate/deactivate |
| `/api/users` | Tenant Admin user management, permission grants |
| `/api/guests` | guest CRUD, preference sub-resource |
| `/api/trips` | trip lifecycle: create/draft/submit/edit, status transitions, clearance, notes,
  handover, checklist N/A, companions, guest-link management |
| `/api/groups` | trip group CRUD + member assignment |
| `/api/bookings/flights` | flight booking CRUD, confirm, cancel, payment |
| `/api/bookings/hotels` | hotel booking CRUD, confirm, cancel, payment |
| `/api/visas` | visa application CRUD per trip/traveller |
| `/api/transport` | transport leg CRUD, assign, complete, cancel, vendor payment, conflict check |
| `/api/master-data` | hotels, airlines, vehicles, drivers, transport-vendors, packages,
  marketing-agents, currencies, visa-fee-guides (soft activate/deactivate) |
| `/api/expenses` | expense summary generation, retrieval, staleness status |
| `/api/reports` | the 9 reports, each with filters + `?format=csv` |
| `/api/notifications` | list (polling), mark read |
| `/api/audit` | append-only read access (tenant-scoped, Super Admin cross-tenant) |
| `/api/files` | authenticated upload/download/delete by document id |
| `/api/public/trips` | unauthenticated guest itinerary by share-link token |
| `/api/health`, `/api/health/ready` | container health checks |

## Selected endpoint sketches (illustrative — full detail lives in the generated OpenAPI schema)

```
POST   /api/auth/login                 {username, password} -> {user, role, tenant}
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/trips?status=&agent_id=&group_id=&page=
POST   /api/trips                      create DRAFT (marketing) or full trip (system)
PATCH  /api/trips/{id}                 edit (reason required post-submission)
POST   /api/trips/{id}/submit
POST   /api/trips/{id}/status          {to, reason?}
POST   /api/trips/{id}/clearance       {cleared_by, reference} | {..., override:true, override_reason}
POST   /api/trips/{id}/notes           {note_type, text}
POST   /api/trips/{id}/handover        {text}
POST   /api/trips/{id}/handover/ack
POST   /api/trips/{id}/checklist/{item_key}/na     {reason}
DELETE /api/trips/{id}/checklist/{item_key}/na
POST   /api/trips/{id}/guest-link                  generate
DELETE /api/trips/{id}/guest-link                  revoke

POST   /api/bookings/flights           {trip_id|group_id, ...}
POST   /api/bookings/flights/{id}/confirm
POST   /api/bookings/flights/{id}/cancel           {charge, charge_lkr, reason}
POST   /api/bookings/flights/{id}/payment          {status, method?, date?}

POST   /api/transport/legs             {..., override?, override_reason?}  -> 409 on conflict w/o override
POST   /api/transport/legs/{id}/complete
POST   /api/transport/legs/{id}/cancel {reason, charge?}

POST   /api/expenses/trips/{id}/generate  -> new expense_summary version
GET    /api/expenses/trips/{id}           -> current summary + staleness flag

GET    /api/reports/{report_id}?from=&to=&...&format=csv

GET    /api/public/trips/{token}          -> guest-safe itinerary only
```

## Status: implementation coverage

See `docs/implementation-progress.md` for the authoritative, continuously updated table of which
of the above are live, in progress, or planned.
