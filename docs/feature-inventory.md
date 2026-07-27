# RCGM — Feature & Page Inventory (from prototype inspection)

Source inspected: `RCGM — Regulus Casino Guest Manager.html` (2,940 lines, single-file prototype,
schema version 7, "Phase 8 — Release Candidate"). This document is the result of Step 1
(Inspect) of the implementation workflow. Every item below was found directly in the HTML/JS —
nothing here is invented.

## 1. Storage model used by the prototype (to be replaced)

- `localStorage['rcgm_v1']` — one JSON blob holding the entire "database": `meta, tenants, users,
  master.*, guests, groups, trips, bookings, legs, attachments, notifications, events`.
- IndexedDB `rcgm_files` — object store `files` keyed by id, storing the actual uploaded `Blob`s
  (passport scans, invoices, ETA notices). Metadata for these lives in `DB.attachments`.
- Schema migration functions `migrateDB()` … `migrateDB7()` show the prototype's evolution phases
  1→7 (currencies/visa fee guide → attachments/notifications → checklist N/A + handover object →
  visa lane → transport legs → closure/expense/guest-link/reports).
- Auth is 100% client-side: plaintext passwords compared in `doLogin()`, session kept in a JS
  variable `SESSION` with no server verification. **This pattern is explicitly forbidden in the
  rebuild** (see PRD §10 security requirements) and is replaced by server-side sessions.

## 2. Pages / navigation per role (from `NAV` object)

| Role | Sidebar pages |
|---|---|
| SUPER_ADMIN | Platform Dashboard, Tenants, Audit Log, (locked: Reports P7) |
| TENANT_ADMIN | Dashboard, Master Data, Settings & Flag Windows, Users & Permissions, Audit Log, Diagnostics, Reports |
| MARKETING | My Guests, New Guest Arrival, Guest Trip Links |
| COORDINATOR | Control Desk, Trip Groups, Master Data (view), Audit Log, Open Tasks, Arrivals Board, Expense Summaries, Reports |
| RESERVATIONS | Reservations Desk, Run Sheet / Board |
| TRANSPORT | Dispatch Desk, Run Sheet / Board |
| FNB_VIEW | Host Desk, Arrivals Preferences |
| MANAGER | Manager View, Reports, Audit Log |

`ROLES` marks `FNB_VIEW` and `MANAGER` as `viewMode:true` (badge "· view-mode" next to role name).

## 3. Entities found in the seeded store

- **tenants**: id, code, name, location, active, createdAt, settings{currencies, baseCurrency,
  guestLinkExpiryDays, flagWindows{10 numeric windows}, seq{trip, group, booking}}
- **users**: id, tenantId (null for Super Admin), username, pass (plaintext — to be replaced),
  name, role, active, canMarkPaid (a grantable permission), agentId (link to marketing agent)
- **master.hotels**: id, tenantId, name, location, roomTypes[], active
- **master.airlines**: id, tenantId, name, classes[], active
- **master.fleet**: id, tenantId, vehicleNo, type, capacity, driver, driverMobile, active
- **master.vendors**: id, tenantId, name, contact, vehicleTypes, active
- **master.packages**: id, tenantId, code, label, active (label only — "packages carry no logic")
- **master.agents**: id, tenantId, name, market, mobile, email, active
- **master.currencies**: id, tenantId, code, name, active, base (LKR flagged `base:true`, cannot
  be deactivated)
- **master.visaFees**: id, tenantId, nationality, feeUSD, notes, active (a *guide*, not a rule)
- **guests**: id, tenantId, name, membershipNo, nationality, mobile, whatsapp, email, passportNo,
  passportExpiry, dob, visaStatus, prefs{dietary, beverage, room, language, vipLevel, signboard,
  notes}
- **groups** (trip groups): id, tenantId, groupNo, name, dateFrom, dateTo, notes, createdAt
- **trips**: id, tenantId, tripNo, guestId, groupId, agentId, packageId, arrival, departure,
  status, packageFlag, cleared{by, at, ref}, companions[], na{}, handover{text, by, at, ackBy,
  ackAt}, notes, visas[] (lazily created), expenseGen{at, by}, guestLink{token, createdAt, by,
  revoked, expiresAt}, createdAt
  - **companions** (embedded in trip): id, name, relationship, passportNo, passportExpiry, dob,
    visaStatus
- **bookings**: id, tenantId, tripId/groupId, level(guest|group), type(flight|hotel), bkNo,
  (flight: airline, fclass, flightNos, pnr, tickets, route, arriveDT, returnDT) /
  (hotel: hotel, roomType, rooms, nights, checkin, checkout, confirmationNo, mealPlan, rate),
  currency, amount, lkrEquiv, payStatus, payMethod, payDate, status(Draft|Confirmed|Cancelled),
  cancelCharge, cancelChargeLkr, cancelReason, createdBy, createdAt
- **legs** (transport): id, tenantId, tripId/groupId, level, legType(Arrival Pickup/Hotel–Casino
  Transfer/Departure Drop/Other), dt, source(inhouse|vendor), vehicleId/vehicleNo/driver/
  driverMobile OR vendorId/vendorName/vehicleType, usage, rateBasis, amount, currency, lkrEquiv,
  payStatus, payMethod, payDate, destNotes, assigned, completed{by, at}, cancelled, cancelReason,
  cancelCharge, createdBy, createdAt
- **attachments**: id, tenantId, tripId, ownerType(guest|companion|booking|<visa traveller
  type>), ownerId, docType(passport|visa|invoice|eta), filename, mime, size, uploadedBy,
  uploadedAt, replaced
- **notifications**: id, tenantId, role, msg, tripId, read, ts
- **events** (audit log, append-only): id, tenantId, tripId, user, username, role, action, detail,
  oldVal, newVal, reason, noteType, ts

## 4. Guest arrival request workflow (Marketing)

- `blankForm()` / `FORM` working object; `captureForm()` reads all inputs before any save.
- Required fields (from `validateRequest`): guest name, membership number ("NEW" allowed to spawn
  a new guest record), nationality, mobile, passport number, passport expiry, DOB, arrival date,
  departure date, package code, passport-copy upload; visa copy upload required only if
  `visaStatus === 'Granted'`.
- Companion required fields: name, relationship, passport number, passport expiry, DOB, passport
  copy upload. Companions can be added/removed dynamically.
- **Hard rule**: departure date cannot be before arrival date.
- **Soft warning** (does not block submit): passport expiring within 182 days of arrival, for
  guest and each companion.
- "Recurring guest" detection: typing an existing membership number shows a panel with the
  guest's last visit + preferences, with a "Pre-fill from record" button.
- Save-as-draft vs Submit: draft skips validation of "forSubmit" hard errors; submit runs them.
- On first submit, `TRIP_CREATED`/`TRIP_SUBMITTED` audit events are logged and a `COORDINATOR`
  notification is created.
- File constraints: JPG/PNG/PDF only; files >2 MB accepted but flagged with a warning toast.
- Draft can be edited (`editDraft`) or cancelled (`cancelDraft`, requires confirmation modal,
  never physically deleted — becomes `CANCELLED`).

## 5. Trip status lifecycle

```
DRAFT → SUBMITTED → CLEARED → BOOKING → TRAVEL_CONFIRMED → IN_HOUSE → COMPLETED → CLOSED
                                    ↘ CANCELLED / NO_SHOW (from BOOKING or TRAVEL_CONFIRMED)
DRAFT / SUBMITTED / CLEARED → CANCELLED
```//
`ALLOWED_NEXT` map in the prototype is authoritative:
- DRAFT → [SUBMITTED, CANCELLED]
- SUBMITTED → [CLEARED, CANCELLED]
- CLEARED → [BOOKING, CANCELLED]
- BOOKING → [TRAVEL_CONFIRMED, CANCELLED, NO_SHOW]
- TRAVEL_CONFIRMED → [IN_HOUSE, CANCELLED, NO_SHOW]
- IN_HOUSE → [COMPLETED]
- COMPLETED → [CLOSED]
- CLOSED / CANCELLED / NO_SHOW → [] (terminal)

Guard rules found in `tryStatus()`:
- Cannot move to CLEARED without a recorded `cleared` object (clearance must exist first).
- Cannot move to COMPLETED unless the Departure Drop checklist lamp is green or N/A.
- Cannot move to CLOSED unless `gateCheck()` returns no blockers (see §9 completion checklist).
- CANCELLED / NO_SHOW require a typed reason (modal), logged with `oldVal/newVal`.
- All status changes are logged as `STATUS_CHANGE` audit events with old/new value.

## 6. Compliance clearance (`clearanceForm` / `recordClearance`)

- Explicitly documented in the prototype copy: *"RCGM records that clearance was given — the
  KYC/AML decision itself is made outside the system."* This is directly consistent with the
  product brief §1.3/§10 in the task.
- Fields captured: cleared-by name, reference note, timestamp (`nowISO()`), user is implicit
  (`SESSION`).
- Until `trip.cleared` is set, Reservations and Transport panels are **hidden entirely**
  (`lanesPanels()` / `transportLanePanel()` return a locked notice, and `re_dash`/`tr_dash`
  dashboards filter trips by status which functionally requires CLEARED+).
- Recording clearance auto-transitions SUBMITTED → CLEARED and fires notifications to
  RESERVATIONS and TRANSPORT roles.

## 7. Flight & hotel booking lanes (Reservations/Coordinator)

- Only visible/editable once `trip.cleared` exists ("Booking Lanes … Locked").
- `canEditLanes()` → COORDINATOR or RESERVATIONS only.
- Level: "This guest only" or (if trip has a group) "Group — shared" → stored as `groupId`
  booking with `tripId:null`, or vice versa.
- Flight: airline (catalog + "Other" free text with an audit `CATALOG_OVERRIDE` event), class,
  flight numbers, PNR (required to Confirm), tickets, route, arrival/return datetime.
- Hotel: hotel (catalog + Other), room type (auto list from hotel record + Other), rooms, nights,
  check-in/out (`checkout` must be after `checkin`), confirmation number (required to Confirm),
  meal plan, rate/night → amount auto = rate × nights × rooms (read-only amount field).
- Every booking carries currency + amount + a **manually entered** LKR equivalent (auto-copied
  when currency is LKR). No FX conversion logic anywhere.
- Booking states: Draft → Confirmed (requires PNR/confirmation no.) → Cancelled (requires
  cancellation charge + reason; charge amount and currency survive into the expense summary).
- Editing a saved booking requires a reason (`bf_reason`), diffed field-by-field into audit
  events.
- Payment sub-form: status (Pending/Paid/Partially Paid/Outstanding), method, date. Marking
  Paid/Partially Paid requires the `canMarkPaid` permission flag on the user (`canPay()`).
  Paid requires method+date.
- Optional invoice upload (JPG/PNG/PDF) attached to the booking (`ownerType:'booking'`).
- FlightRadar24 external link auto-built from the first flight number token.

## 8. Visa lane (Coordinator-owned)

- One row per traveller: the guest plus each companion (`ensureVisas()` lazily creates them from
  guest/companion `visaStatus` on first view).
- Statuses: Not Required, To Apply, Applied, Granted, Rejected, On Arrival.
- Visa Fee Guide (`feeGuide(nationality)`) pre-fills the USD fee for the traveller's nationality
  group but **remains editable per application** — explicitly documented as "A GUIDE, never a
  rule." 0 = currently free is a valid value.
- Validation: ETA reference required for Applied/Granted; application date required for Applied;
  reason required for Not Required/On Arrival; fee is always required (0 allowed); LKR
  equivalent required when fee > 0.
- Optional "ETA approval notice" document upload per traveller (`docType:'eta'`).
- Only the COORDINATOR role can open/save the visa form (`visaForm` checks `SESSION.role`).

## 9. Transport legs (Coordinator assigns / Transport executes)

- Leg types: Arrival Pickup, Hotel–Casino Transfer, Departure Drop, Other.
- Source: in-house fleet (vehicle+driver picked from Master Data, driver mobile carried through)
  or external vendor (vendor picked, free-text vehicle type).
- Usage: Airport / City use / Out-of-city / Multi-day. Rate basis: Per trip / Per day / Per km.
- **Cost fields are hidden from the TRANSPORT role** — `costVisible()` only allows
  COORDINATOR/TENANT_ADMIN/MANAGER to see or enter amount/currency/LKR equivalent. This is the
  strongest role-segregation rule in the whole prototype and must be enforced server-side.
- `canEditLegs()` → COORDINATOR or TRANSPORT (both may create/edit/complete legs; only
  COORDINATOR may cancel a leg or edit vendor payment when `costVisible()`).
- Assignment vs completion are separate booleans/objects: `assigned` (set true on creation) and
  `completed{by, at}` (set explicitly via "Complete" button). Completing a Departure Drop
  notifies the Coordinator that the trip is ready to close.
- Cancelling a leg requires a reason; a cancellation charge (LKR) is optional and flows into the
  expense summary as a "Transport — CANCELLATION CHARGE" line.
- `waLink()` builds a `wa.me` deep link with a pre-filled dispatch message (guest/group name,
  flight no., datetime, vehicle, signboard, destination notes) for the assigned driver/vendor
  contact — a UX affordance, not a hard requirement, but worth preserving as an external link
  helper in the rebuild.
- **Vehicle conflict detection is NOT implemented in the prototype** (no code checks for
  overlapping bookings of the same `vehicleId`). This is a **PRD-required enhancement** (task
  §6 "Transport") that the prototype lacks — we must add it in the rebuild as new, justified
  business logic (not removing anything, only adding safety the brief explicitly asks for).

## 10. Trip groups

- `groupForm/createGroup`: name, date range, notes; sequential `GRP-<CODE>-<year>-<seq>` numbers
  exactly like trips (`TRIP-<CODE>-<year>-<seq>`) and bookings (`BK-<CODE>-<seq>`).
- Group detail page lists member trips, allows adding an eligible ungrouped trip
  (`assignToGroup`), and removing a trip from the group.
- Bookings/legs may be created "at group level" (`level:'group'`) instead of per-guest; these
  appear on every member trip's checklist/expense summary tagged "GROUP — SHARED", with the
  **full** shared amount shown on each member (explicitly: *"RCGM performs no allocation;
  apportionment is for Accounts"*) — i.e., **do not silently divide** shared costs, exactly as
  instructed in the task brief.

## 11. Master data catalogues (`CATALOGS` object, Tenant Admin CRUD, Coordinator read-only)

Eight catalogues, each with typed fields and table columns: Hotels, Airlines, In-house Fleet,
Transport Vendors, Package Codes, Marketing Agents, Currencies, Visa Fee Guide.
- No hard delete anywhere — `toggleMaster()` only flips `active` (soft deactivate/reactivate).
- Base currency (`base:true`) can never be deactivated.
- Deactivated entries disappear from new-record dropdowns but remain intact on historical
  records (dropdown builders filter `.active` while historical renders read the raw joined
  value).

## 12. Tenant settings — flag windows

`FLAG_FIELDS`: flightAmberDays/flightRedHrs, hotelAmberDays/hotelRedHrs, visaAmberDays/
visaRedHrs, pickupAmberHrs/pickupRedHrs, dropAmberHrs/dropRedHrs — 10 tenant-configurable numeric
thresholds, plus `guestLinkExpiryDays`. Saving diffs old vs new and logs a `SETTINGS_CHANGE`
audit event per changed field (batched into one event with a combined detail string).

## 13. Open tasks / dynamic flags (`flagLevel`, `openTasks`)

- Computed, not stored. For each active (non-draft/terminal) trip, for each of 5 monitored items
  (flight booking, hotel booking, visa application, arrival pickup assignment, departure drop
  assignment): if the checklist lamp for that item is still "open" (not done, not N/A), compute
  an anchor datetime (confirmed flight time if available, else trip arrival/departure date) and
  compare `hoursUntil = anchor - now` against the tenant's amber/red window for that item.
- Sorted red-first, then soonest anchor.
- Rendered as the "Open Tasks" list (Coordinator) with urgency pill + trip + guest + item +
  anchor + trip status + "Open" action, and included in the platform's report set (`r9`).
- **No filter UI beyond the trip/date range filters already in Reports** — the brief additionally
  asks for filters by urgency/trip/guest/task type/date range/assigned department, which the
  prototype's simple task list does not fully provide → to be added.

## 14. Notifications (`notify`, `myNotifs`, bell dropdown)

- Server-less "push": `notify(role, msg, tripId)` pushes into `DB.notifications` filtered by
  tenant + target role (not per-user). Read status flips to `true` the moment the bell dropdown
  is opened (`toggleBell`).
- Trigger points found: new request submitted → COORDINATOR; clearance recorded →
  RESERVATIONS + TRANSPORT; booking confirmed → COORDINATOR; leg assigned → TRANSPORT; departure
  drop completed → COORDINATOR (ready to close); package flag set → COORDINATOR.
  (Handover created/acknowledged and guest-link created/revoked are logged to the audit trail
  but do **not** currently fire a notification in the prototype — the task brief asks for these
  as notification triggers too, so we add them as new, justified functionality.)

## 15. Notes, handover, timeline

- `NOTE_TYPES`: General, Error & Correction, Incident, Guest Feedback — free-text note attached
  to the trip's audit timeline (not a separate notes table; implemented as an audit event with
  `noteType` populated). We will promote this into a first-class `trip_notes` table server-side
  while keeping the same UX (typed notes shown inline in the timeline).
- Handover: single object per trip `{text, by, at, ackBy, ackAt}`. Setting a **new** handover
  while the previous is unacknowledged **overwrites it in the prototype with no history kept** —
  the task brief explicitly requires "Do not allow an unacknowledged handover to be overwritten
  without recording the previous value," so the rebuild adds a `trip_handovers` history table
  (append, do not overwrite) — a required enhancement, not an invented feature.
- Timeline = the full list of audit events for a trip, newest first, rendered with old→new value
  and reason where present.

## 16. Documents / attachments

- Types seen: `passport` (guest + each companion), `visa` (guest, only if status Granted),
  `invoice` (booking), `eta` (visa lane approval notice).
- `existingDoc(ownerId, docType)` finds the current non-replaced doc; replacing marks the old one
  `replaced:true` (kept, not deleted) and logs `DOC_REPLACED`.
- Viewer (`viewDoc`) fetches the Blob from IndexedDB and opens an `<img>` or a new-tab link for
  PDFs via `URL.createObjectURL` — **this exposes a raw blob URL client-side**; the rebuild
  instead streams authorized downloads through an authenticated backend endpoint.
- Visibility gate: `canSeeDocs(trip)` → COORDINATOR/RESERVATIONS/TENANT_ADMIN always; MARKETING
  only for their own agent's trip. Transport, F&B and Manager never see documents.
- Size warning at 2 MB (not a hard block); hard block on MIME type outside JPG/PNG/PDF.

## 17. Completion checklist (`CHK_ITEMS`, `lampState`, `markNA`, `gateCheck`)

Eight items, each derived (not manually ticked) from underlying records:
1. Flight booked — confirmed flight booking with a PNR exists
2. Hotel booked — confirmed hotel booking with a confirmation number exists
3. Visa confirmed — every traveller's visa status is Granted/On Arrival/Not Required
4. Arrival pickup assigned — an Arrival Pickup leg exists and is assigned
5. Arrival pickup completed — an Arrival Pickup leg is completed
6. Departure drop assigned — a Departure Drop leg exists and is assigned
7. Departure drop completed — a Departure Drop leg is completed
8. Expense Summary generated — `expenseGen` stamped and not stale (`postGenChanges === 0`)
9. Package Status set — `packageFlag !== 'PENDING'`

- Items 1–7 support "Mark N/A" with a **required reason**, audit-logged
  (`CHECKLIST_NA`/`CHECKLIST_NA_CLEARED`); items 8–9 cannot be marked N/A.
- `gateCheck(trip)` is the CLOSED-transition gate: every item must be green or N/A, else the
  status button opens a modal listing every blocking item by name (including "Expense Summary
  stale — N change(s) since generation" as a distinct blocker from "not generated").

## 18. Package qualification flag (Manager-only)

- `flagForm/saveFlag`: status PENDING (default) / QUALIFIED / NOT_QUALIFIED with an optional
  note. Explicitly documented as *"Flag only — RCGM performs no qualification computation.
  Gaming informs; the Manager records."* Logged as `FLAG_SET` with old/new value, notifies
  Coordinator.

## 19. Expense summaries (Coordinator-generated, versioned by timestamp)

- `expenseItems(trip)` aggregates: every non-cancelled flight/hotel booking (amount + LKR
  equivalent), every cancelled booking with a cancellation charge > 0, every non-cancelled
  transport leg with a cost, every cancelled leg with a cancellation charge, every visa fee > 0.
  Group-level (shared) items are tagged and show the **full** amount, not divided.
- `generateExpense()` stamps `trip.expenseGen = {at, by}` — this is the "version"; the prototype
  does **not** keep prior snapshots (`t.expenseGen` is simply overwritten on regenerate). The task
  brief requires "keep revision history" — a required enhancement: the rebuild uses an
  `expense_summaries` table with an incrementing version number and `expense_summary_items` per
  generation, never overwriting a prior row.
- Staleness: `postGenChanges(trip)` counts audit events on the trip with an action in
  `COST_ACTIONS` (`BOOKING_ADDED/EDIT/CONFIRMED/CANCELLED, LEG_ADDED/EDIT/CANCELLED,
  VISA_UPDATE`) with a timestamp after `expenseGen.at`. Any such event ⇒ the summary is "Stale"
  and must be regenerated before the trip can close (also the item-8 checklist blocker).
- Totals by category (Flight/Hotel/Transport/Visa) + grand total (LKR) + "Not Yet Paid" total.
  Print-friendly (`window.print()`), no server-side PDF generation in the prototype.

## 20. Guest trip link (public itinerary, "Stage A" per its own label)

- `genGuestLink`: random token (`Math.random` — **not cryptographically secure**, to be replaced
  with a proper CSPRNG token server-side), `createdAt`, `by`, `revoked`, `expiresAt` (departure +
  tenant's `guestLinkExpiryDays`, default 3).
- `guestLinkAlive(trip)`: not revoked and not past expiry.
- `guest_view` page renders (no login) flight (airline/flightNos/class/PNR/route/times), hotel
  (hotel/roomType/confirmationNo/checkin/checkout/mealPlan), per-traveller visa status pill +
  ETA ref, transport legs (driver+mobile+vehicle or vendor+vehicle type), and the assigned
  agent's name + tel: link — **never** costs, payment status, passport numbers, DOB, internal
  notes, compliance/clearance info, or audit history. This exact exclusion list matches the task
  brief's guest-page restrictions precisely.
- `shareGuestLink`: builds `wa.me`/`sms:`/`mailto:` links from the guest's contact fields; logs a
  `GUESTLINK_SHARED` audit event.
- Revoke sets `revoked:true` (kept, not deleted); "Regenerate" issues a brand-new token when
  expired. Access logging / last-accessed timestamp is **not implemented** in the prototype —
  required-but-optional in the brief ("Optional access logging") — added as an enhancement.
- Marketing role sees a read-only "Guest Trip Links" status list for their own trips
  (`ma_links`), cannot generate/revoke (Coordinator-only).

## 21. Reports (`REPORT_DEFS`, `rptRows`, CSV export)

Nine reports, each computed live from the in-memory store, with a shared from/to date range +
agent filter and report-specific extra filters:
1. Arrivals & Departures (date, type ARR/DEP, trip, guest, agent, status)
2. Guests Visited (trip, guest, membership, nationality, package, agent, dates, pax, status;
   filter: status)
3. Trip/Expense Report (trip, category, item, currency, amount, LKR, payment; filter: category;
   totals per category + grand total appended as rows)
4. Payment Status (trip, category, item, LKR, payment status; filters: category + payment status)
5. Marketing-Agent Performance (agent, distinct guests, trip count, total logistics cost LKR)
6. Cancellations & No-Shows (trips with CANCELLED/NO_SHOW status + cancelled bookings/legs with a
   charge > 0, unified into one list with cost)
7. Audit Report (full event log for the tenant; filters: user, note type, date range)
8. Active Trips Board (trip, guest, status, flag, checklist glyph summary, dates)
9. Open Tasks / Overdue (urgency, trip, guest, open item, anchor datetime)

Every report supports CSV export (`dlCSV`, logs a `REPORT_EXPORTED` audit event) and browser
print. **All figures are computed from real seeded records — no fabricated numbers** — this
must remain true against the real database in the rebuild.

## 22. Audit log (`logEvent`, `audit` page)

- Every mutating action in the prototype funnels through `logEvent()`, which stamps tenantId,
  tripId, user/username/role (from `SESSION`, or `'system'` for migrations/seed), action, detail,
  oldVal/newVal, reason, noteType, timestamp, and pushes into an append-only `events` array
  (never edited or spliced anywhere in the code).
- Super Admin sees all tenants' events; every other role sees only their own tenant's events.
- IP address is **not** captured in the prototype (no server) — added server-side in the rebuild
  since the brief requires it "where available."

## 23. Diagnostics page (Tenant Admin)

- Shows localStorage size, schema version, event count, and a live IndexedDB round-trip
  read/write/delete self-test. Includes a destructive "Reset demo data" button that wipes
  localStorage + IndexedDB and re-seeds. This entire page is prototype-specific to validate the
  browser storage layer; in the rebuild its purpose (environment/storage health) is served by a
  `/api/health` endpoint plus a documented `make seed-reset` command — no direct equivalent page
  is required, but we keep a lightweight admin "System Health" panel that checks DB connectivity,
  migration version, and file storage reachability, since it is a reasonable server-side
  analogue and the brief calls for a health-check endpoint anyway.

## 24. Explicit design statements embedded in the prototype's own copy (business rules to keep)

- "RCGM performs no allocation; apportionment is for Accounts" (shared costs).
- "A GUIDE, never a rule" (visa fee guide).
- "Packages carry no logic in RCGM" (package codes are labels only).
- "Flag only — RCGM performs no qualification computation" (package qualification).
- "RCGM records that clearance was given — the KYC/AML decision itself is made outside the
  system" (compliance clearance is a record, not a screening engine).
- "RCGM records payment status only — it is not accounts payable" (payment status ≠ payment
  processing).
- Hard delete is never permitted anywhere — soft deactivate/cancel only, full history retained.

## 25. Known prototype limitations (do not silently fix without noting — task §16 requires we
document assumptions/limitations explicitly)

1. No server; all "security" is cosmetic (hidden buttons/role checks in JS only).
2. Plaintext passwords compared client-side.
3. Guest link token generated with `Math.random()` (not cryptographically secure).
4. No vehicle double-booking conflict detection despite assigning vehicles to timed legs.
5. Expense summary is overwritten in place — no revision history.
6. Handover object is overwritten in place — no history of prior unacknowledged handovers.
7. Notifications are role-broadcast, not per-user, and have no delivery beyond the in-app bell.
8. No pagination anywhere — all tables render the full in-memory array.
9. Open Tasks page has no filters beyond what Reports already offers.
10. No access logging on guest links.
11. Single hard-coded demo tenant; multi-tenant switch UI does not exist for staff users (only
    Super Admin sees a tenant list).
12. Diagnostics page tests browser storage, not a real backend — replaced by `/health` in the
    rebuild.

These limitations are the explicit gaps the backend/database rebuild is expected to close per the
task brief, while every workflow, field, and business rule above is preserved.
