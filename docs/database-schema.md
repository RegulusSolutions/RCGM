# RCGM — Database Schema (PostgreSQL, normalized)

Conventions: UUID primary keys (`gen_random_uuid()`), `created_at`/`updated_at`
(`timestamptz`, default `now()`, `updated_at` maintained by SQLAlchemy `onupdate`), soft
deactivation via `is_active` (master data) or a terminal `status` value (trips/bookings/legs) —
**no hard deletes** of business records, matching the prototype's explicit rule. Money columns
are `numeric(14,2)`. All tenant-owned tables have `tenant_id uuid not null references
tenants(id)` with a btree index.

## Core / identity

**tenants** — id, code (unique, 2-6 chars), name, location, is_active, base_currency
(default 'LKR'), guest_link_expiry_days (default 3), seq_trip/seq_group/seq_booking (int,
per-tenant running counters used to generate human numbers), created_at, updated_at.

**tenant_settings** *(1:1 with tenants — flag windows, kept in its own table for clarity)* —
id, tenant_id (unique FK), flight_amber_days, flight_red_hrs, hotel_amber_days, hotel_red_hrs,
visa_amber_days, visa_red_hrs, pickup_amber_hrs, pickup_red_hrs, drop_amber_hrs, drop_red_hrs,
updated_at.

**users** — id, tenant_id (nullable — null only for SUPER_ADMIN), username (unique, global),
password_hash, name, role (enum: SUPER_ADMIN/TENANT_ADMIN/MARKETING/COORDINATOR/RESERVATIONS/
TRANSPORT/FNB_VIEW/MANAGER), is_active, can_mark_paid (bool), agent_id (FK → marketing_agents,
nullable, set when role=MARKETING), created_at, updated_at.
- `CHECK ((role = 'SUPER_ADMIN') = (tenant_id IS NULL))`
- Index on (tenant_id), unique index on username.

**sessions** — id, user_id (FK), token_hash (unique), tenant_id, role (denormalized snapshot at
login for fast checks), ip_address, user_agent, created_at, last_seen_at, expires_at, revoked_at.

**login_attempts** *(rate limiting)* — id, username, ip_address, succeeded, attempted_at.
Indexed on (username, attempted_at) and (ip_address, attempted_at) for sliding-window checks.

**roles / permissions / role_permissions / user_permissions** — the brief's schema sketch lists
these; RCGM's role set is fixed (8 roles) and each role's allowed actions are enforced by code
(`core/permissions.py`) mirroring `docs/roles-and-permissions.md`, plus the one genuinely
data-driven permission the prototype has (`users.can_mark_paid`). We still create the four
tables so future custom-permission work doesn't require a migration:
- **permissions**(id, code unique, description)
- **role_permissions**(role enum, permission_id FK, PK(role, permission_id)) — seeded from the
  matrix in `roles-and-permissions.md`
- **user_permissions**(user_id FK, permission_id FK, granted_by, granted_at, PK(user_id,
  permission_id)) — per-user overrides/grants (`can_mark_paid` is modeled as the seeded
  permission `payments.mark_paid` granted per-user, replacing the ad hoc boolean column
  conceptually while keeping the boolean as a fast-path denormalized flag kept in sync)
- **roles** table is a lookup/reference table (id = enum value, label) purely for FK friendliness
  in `role_permissions`/UI dropdowns; the enum remains the source of truth for `users.role`.

## Guests & travellers

**guests** — id, tenant_id, name, membership_no, nationality, mobile, whatsapp, email,
passport_no, passport_expiry (date), dob (date), visa_status, additional_notes, created_at,
updated_at. Unique (tenant_id, membership_no) where membership_no <> 'NEW'.

**guest_preferences** *(1:1 with guests)* — id, guest_id (unique FK), dietary, beverage, room,
language, vip_level, signboard_name, notes.

**companions** — id, tenant_id, trip_id (FK → trips, cascade), name, relationship, passport_no,
passport_expiry, dob, nationality, visa_status, created_at, updated_at.

**documents** *(attachments)* — id, tenant_id, trip_id (nullable FK), owner_type (enum: guest,
companion, booking, visa, other), owner_id (uuid, polymorphic — enforced at the application
layer, not FK, since owner_type varies), category (enum: passport, visa, invoice, eta_notice,
other), original_filename, storage_key (random, never exposed), mime_type, size_bytes,
uploaded_by (FK users), uploaded_at, replaced_by_id (self-FK, nullable), is_deleted,
deleted_by/deleted_at/deleted_reason.

## Trips & groups

**trip_groups** — id, tenant_id, group_no (unique per tenant), name, date_from, date_to, notes,
created_by, created_at, updated_at.

**trips** — id, tenant_id, trip_no (unique per tenant), guest_id (FK), group_id (nullable FK),
agent_id (nullable FK → marketing_agents), package_id (nullable FK → packages), arrival_date,
departure_date, status (enum: DRAFT/SUBMITTED/CLEARED/BOOKING/TRAVEL_CONFIRMED/IN_HOUSE/
COMPLETED/CLOSED/CANCELLED/NO_SHOW), package_flag (enum: PENDING/QUALIFIED/NOT_QUALIFIED,
default PENDING), notes (free text "trip notes"), cancel_reason, created_by, created_at,
updated_at.
- `CHECK (departure_date >= arrival_date)`
- Index on (tenant_id, status), (tenant_id, agent_id), (tenant_id, group_id).

**trip_clearances** — id, tenant_id, trip_id (FK, one row per clearance event — kept append-only
so re-clearance after an override is auditable), cleared_by_name, reference, cleared_at,
recorded_by (FK users), is_override (bool), override_reason (required if is_override), created_at.
Latest row per trip = current clearance (`SELECT … ORDER BY cleared_at DESC LIMIT 1`), exposed via
a `trips.current_clearance_id` denormalized FK updated by the service layer for O(1) lookups.

**trip_notes** — id, tenant_id, trip_id (FK), note_type (enum: GENERAL, ERROR_CORRECTION,
INCIDENT, GUEST_FEEDBACK), text, created_by (FK users), created_at.

**trip_handovers** — id, tenant_id, trip_id (FK), text, created_by (FK users), created_at,
acknowledged_by (nullable FK users), acknowledged_at (nullable), superseded_at (nullable —
stamped when a new handover is created while this one is unacknowledged, preserving history
instead of overwriting, per the brief's explicit requirement). "Current" handover = latest row
with `superseded_at IS NULL`.

**trip_checklist_items** — id, tenant_id, trip_id (FK), item_key (enum: FLIGHT, HOTEL, VISA,
PICKUP_ASSIGNED, PICKUP_COMPLETED, DROP_ASSIGNED, DROP_COMPLETED, EXPENSE_SUMMARY,
PACKAGE_STATUS), is_not_applicable (bool), na_reason, na_by (FK users), na_at. One row per
(trip_id, item_key), created lazily by the checklist service; the *derived* green/open state is
never stored (always computed live from bookings/legs/visas/expense_summaries), only the N/A
override is persisted, exactly mirroring the prototype's `trip.na{}` map.

## Bookings, visas, transport

**flight_bookings** — id, tenant_id, trip_id (nullable — group-level bookings have trip_id NULL),
group_id (nullable), booking_no (unique per tenant), airline_id (nullable FK, nullable when a
free-text "Other" airline was used), airline_name_override, travel_class, flight_numbers, pnr,
route, ticket_count, arrival_datetime, return_datetime, currency, amount, lkr_equivalent,
payment_status (enum: PENDING/PAID/PARTIALLY_PAID/OUTSTANDING), payment_method, payment_date,
booking_status (enum: DRAFT/CONFIRMED/CANCELLED), cancellation_charge, cancellation_charge_lkr,
cancellation_reason, created_by, created_at, updated_at.
- `CHECK ((trip_id IS NOT NULL) OR (group_id IS NOT NULL))`
- `CHECK (booking_status <> 'CONFIRMED' OR pnr IS NOT NULL)`

**hotel_bookings** — id, tenant_id, trip_id (nullable), group_id (nullable), booking_no (unique
per tenant), hotel_id (nullable FK), hotel_name_override, room_type, room_count, night_count,
check_in (date), check_out (date), confirmation_no, meal_plan, rate_per_night, currency, amount,
lkr_equivalent, payment_status, payment_method, payment_date, booking_status, cancellation_charge,
cancellation_charge_lkr, cancellation_reason, created_by, created_at, updated_at.
- `CHECK (check_out > check_in)`
- `CHECK (booking_status <> 'CONFIRMED' OR confirmation_no IS NOT NULL)`

**visa_applications** — id, tenant_id, trip_id (FK), traveller_type (enum: GUEST, COMPANION),
traveller_ref_id (uuid — guest_id or companion_id), traveller_name (denormalized snapshot),
passport_no, dob, nationality, status (enum: NOT_REQUIRED/TO_APPLY/APPLIED/GRANTED/REJECTED/
ON_ARRIVAL), eta_reference, application_date, fee_usd, lkr_equivalent, payment_status, reason,
updated_by, created_at, updated_at. Unique (trip_id, traveller_ref_id).

**transport_legs** — id, tenant_id, trip_id (nullable), group_id (nullable), leg_type (enum:
ARRIVAL_PICKUP, HOTEL_CASINO_TRANSFER, DEPARTURE_DROP, OTHER), scheduled_at (timestamptz),
source (enum: INHOUSE, VENDOR), vehicle_id (nullable FK → vehicles), vendor_id (nullable FK →
transport_vendors), vendor_vehicle_type, usage_type (enum: AIRPORT, CITY, OUT_OF_CITY,
MULTI_DAY), rate_basis (enum: PER_TRIP, PER_DAY, PER_KM), amount, currency, lkr_equivalent,
payment_status, payment_method, payment_date, destination_notes, is_assigned, completed_by,
completed_at, is_cancelled, cancel_reason, cancel_charge, created_by, created_at, updated_at.
- `CHECK ((trip_id IS NOT NULL) OR (group_id IS NOT NULL))`
- `CHECK ((source = 'INHOUSE' AND vehicle_id IS NOT NULL AND vendor_id IS NULL) OR (source =
  'VENDOR' AND vendor_id IS NOT NULL AND vehicle_id IS NULL))`
- Partial index `(vehicle_id, scheduled_at) WHERE is_cancelled = false` used by the vehicle
  conflict-detection service (new requirement vs. the prototype — see feature-inventory §9).
  Conflict window = leg's `scheduled_at` ± an estimated duration (configurable default, e.g. 3h)
  compared against other non-cancelled legs on the same vehicle; overlap ⇒ warning returned to
  the client, and the write is only allowed with `override=true` + `override_reason`, which is
  audit-logged (`LEG_VEHICLE_CONFLICT_OVERRIDE`).

## Master data

**hotels** — id, tenant_id, name, location, room_types (text[]), is_active.
**airlines** — id, tenant_id, name, travel_classes (text[]), is_active.
**vehicles** *(in-house fleet)* — id, tenant_id, vehicle_no, vehicle_type, capacity, driver_id
(nullable FK → drivers, see below), is_active.
**drivers** — id, tenant_id, name, mobile, is_active. *(Promoted to a first-class table vs. the
prototype's inline driver fields on `fleet`, satisfying the brief's explicit `drivers` table
requirement while keeping `vehicles.driver_id` as the common case of "this van has this driver";
a driver can be reassigned to a different vehicle without editing history rows.)*
**transport_vendors** — id, tenant_id, name, contact, vehicle_types_offered, is_active.
**packages** — id, tenant_id, code (unique per tenant), label, is_active.
**marketing_agents** — id, tenant_id, name, market, mobile, email, is_active.
**currencies** — id, tenant_id, code, name, is_active, is_base (exactly one true per tenant,
enforced by a partial unique index `WHERE is_base`).
**visa_fee_guides** — id, tenant_id, nationality_group, fee_usd, notes, is_active.

## Expenses

**expense_summaries** — id, tenant_id, trip_id (FK), version (int, sequential per trip starting
at 1), generated_by (FK users), generated_at, is_current (bool — only the latest version per
trip is `true`), flight_total_lkr, hotel_total_lkr, transport_total_lkr, visa_total_lkr,
grand_total_lkr, outstanding_total_lkr. Unique (trip_id, version).

**expense_summary_items** — id, expense_summary_id (FK), category (enum: FLIGHT, HOTEL,
TRANSPORT, VISA), description, currency, amount, lkr_equivalent, payment_status, is_shared_group
(bool), source_type (enum: flight_booking/hotel_booking/transport_leg/visa_application),
source_id (uuid).

**package_qualification_flags** — id, tenant_id, trip_id (FK, one *current* row via `is_current`,
history kept via prior rows with `is_current=false` for a full audit trail of flag changes),
status (enum PENDING/QUALIFIED/NOT_QUALIFIED), set_by (FK users, must have role MANAGER), note,
set_at.

## Sharing & communication

**guest_share_links** — id, tenant_id, trip_id (FK), token_hash (unique — the raw token is
shown once and never stored in plaintext), created_by, created_at, expires_at, revoked_at,
last_accessed_at, access_count.
**guest_link_access_log** *(optional access logging, brief §"Attachments"/"Guest trip link")* —
id, link_id (FK), accessed_at, ip_address, user_agent.

**notifications** — id, tenant_id, recipient_role (nullable enum), recipient_user_id (nullable
FK — either role-broadcast or a specific user, matching + extending the prototype), trip_id
(nullable), message, is_read, created_at, read_at.

## Audit

**audit_events** — id, tenant_id (nullable for platform-level events), user_id (nullable FK,
null only for system/seed events), username, role, action (text, matches the prototype's action
vocabulary: LOGIN, LOGOUT, LOGIN_FAILED, TRIP_CREATED, TRIP_SUBMITTED, STATUS_CHANGE,
CLEARED_TO_BOOK, BOOKING_ADDED, BOOKING_EDIT, BOOKING_CONFIRMED, BOOKING_CANCELLED,
PAYMENT_STATUS, VISA_UPDATE, LEG_ADDED, LEG_EDIT, LEG_COMPLETED, LEG_CANCELLED,
LEG_VEHICLE_CONFLICT_OVERRIDE, GROUP_CREATED, GROUP_ASSIGNED, CHECKLIST_NA,
CHECKLIST_NA_CLEARED, EXPENSE_GENERATED, FLAG_SET, GUESTLINK_GENERATED, GUESTLINK_REVOKED,
GUESTLINK_SHARED, DOC_UPLOADED, DOC_REPLACED, DOC_DELETED, MASTER_ADD, MASTER_EDIT,
MASTER_DEACTIVATE, SETTINGS_CHANGE, USER_CREATED, USER_DEACTIVATED, PERMISSION_CHANGE,
TENANT_CREATED, TENANT_DEACTIVATED, REPORT_EXPORTED, …), entity_type, entity_id, trip_id
(nullable), description, old_value, new_value, reason, note_type, ip_address, created_at.
No UPDATE/DELETE grants exist on this table at the application-role DB level (enforced by a
Postgres role with `INSERT`/`SELECT` only for the application connection user used for this
table, or at minimum no ORM code path ever issues UPDATE/DELETE against it).

## Entity-relationship summary (textual)

```
tenants 1───* users
tenants 1───1 tenant_settings
tenants 1───* guests 1───* trips
tenants 1───* trip_groups 1───* trips
trips   1───* companions
trips   1───* trip_clearances (latest = current)
trips   1───* trip_notes
trips   1───* trip_handovers (latest non-superseded = current)
trips   1───* trip_checklist_items (N/A overrides only)
trips  (0/1)─* flight_bookings   (or trip_groups 0/1─* flight_bookings, mutually exclusive)
trips  (0/1)─* hotel_bookings    (or trip_groups …)
trips   1───* visa_applications (one per traveller)
trips  (0/1)─* transport_legs   (or trip_groups …)
trips   1───* expense_summaries 1───* expense_summary_items
trips   1───* package_qualification_flags (latest = current)
trips   1───* guest_share_links 1───* guest_link_access_log
trips   1───* documents (also companion/booking/visa-owned via owner_type/owner_id)
tenants 1───* {hotels, airlines, vehicles, drivers, transport_vendors, packages,
               marketing_agents, currencies, visa_fee_guides}
tenants 1───* notifications
(tenant, null) 1───* audit_events
```

## Migration strategy

Alembic migrations are generated incrementally per implementation phase (Foundation → Core →
Operational → Closure), matching the workflow in `implementation-plan.md`, so each phase leaves
the schema in a runnable, seedable state instead of one giant initial migration. Migration
filenames are prefixed `0001_..` … in strict dependency order; `alembic upgrade head` is run
automatically by the `api` container's entrypoint before Uvicorn starts.
