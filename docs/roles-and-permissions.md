# RCGM — Role & Permission Matrix

Derived from the prototype's `ROLES`, `NAV`, `canEditLanes/canEditLegs/costVisible/canPay/
canSeeDocs` guard functions, and the task brief §5. All checks below must be enforced **in the
FastAPI backend** (dependency-injected permission checks), never trusted from the frontend.

## Roles

| Role code | Label | Tenant-scoped? | View-mode only? |
|---|---|---|---|
| `SUPER_ADMIN` | Regulus Platform Admin | No (cross-tenant, admin scope only) | No |
| `TENANT_ADMIN` | Tenant Admin | Yes | No |
| `MARKETING` | Marketing Agent | Yes (own agent's trips only) | No |
| `COORDINATOR` | Coordinator | Yes | No |
| `RESERVATIONS` | Reservations | Yes | No |
| `TRANSPORT` | Transport | Yes | No |
| `FNB_VIEW` | F&B / Host | Yes | Yes — read-only |
| `MANAGER` | Manager | Yes | Yes — read/approve only |

## Permission matrix (module × role)

Legend: **F** full CRUD, **W** write/limited-write, **R** read, **A** approve/record only,
**–** no access.

| Module | SUPER_ADMIN | TENANT_ADMIN | MARKETING | COORDINATOR | RESERVATIONS | TRANSPORT | FNB_VIEW | MANAGER |
|---|---|---|---|---|---|---|---|---|
| Platform tenants | F | – | – | – | – | – | – | – |
| Platform-level audit | R | – | – | – | – | – | – | – |
| Tenant dashboard | – | R | – | – | – | – | – | – |
| Users & permissions | – | F | – | – | – | – | – | – |
| Master data (hotels/airlines/fleet/vendors/packages/agents/currencies/visa fees) | – | F | – | R | – | – | – | – |
| Tenant settings / flag windows | – | F | – | – | – | – | – | – |
| Guests | – | R | W (own) | R | R | – | R (limited fields) | R |
| Guest arrival request | – | – | F (own drafts) | R | – | – | – | – |
| Companions | – | – | F (own drafts) | R | – | – | – | – |
| Documents | – | R | W (own trips) | R | R | – | – | – |
| Compliance clearance | – | R | – | A | R | – | – | – |
| Trip status workflow | – | R | R (own) | F (guarded) | R | R | – | R |
| Flight bookings | – | R | – | F | F | – | – | R |
| Hotel bookings | – | R | – | F | F | – | – | R |
| Payment status (mark paid) | – | – | – | if `canMarkPaid` | if `canMarkPaid` | – | – | – |
| Visa lane | – | R | – | F | R | – | – | R |
| Transport legs — assignment/completion | – | R | – | F | – | F | – | R |
| Transport legs — cost fields | – | R | – | F | – | **hidden** | – | R |
| Transport legs — cancel | – | – | – | F | – | – | – | – |
| Trip groups | – | R | – | F | – | – | – | R |
| Open tasks | – | – | – | F | – | – | – | R |
| Notifications (own) | R | R | R | R | R | R | R | R |
| Notes / handover | – | – | – | F | – | – | – | – |
| Expense summaries | – | R | – | F (generate) | R | – | – | R |
| Package qualification flag | – | R | – | R | – | – | – | F |
| Completion checklist / closure | – | R | – | F | – | – | – | R |
| Guest trip link | – | R | R (own, status only) | F | – | – | – | R |
| Reports | R (platform) | F | – | F | – | – | – | F |
| Audit log (tenant) | – | R | – | R | – | – | – | R |
| Arrivals/Departures board | – | – | – | R | R | R | – | – |
| Host/F&B arrival preferences | – | – | – | – | – | – | R | – |

Notes carried over verbatim from the prototype's own enforcement functions:

- `canEditLanes()` (flight/hotel booking edit rights): `COORDINATOR`, `RESERVATIONS` only.
- `canEditLegs()` (transport leg create/edit/complete rights): `COORDINATOR`, `TRANSPORT` only.
- `costVisible()` (who may see/enter monetary fields on a transport leg): `COORDINATOR`,
  `TENANT_ADMIN`, `MANAGER` only — **TRANSPORT never sees cost**, enforced by omitting the field
  from the API response payload for that role, not just hiding it in the UI.
- `canPay()`: derived from a per-user boolean permission `canMarkPaid`, grantable by Tenant Admin
  per user — independent of role. Required to set a payment status of Paid/Partially Paid on a
  booking or a vendor transport leg.
- `canSeeDocs(trip)`: `COORDINATOR`, `RESERVATIONS`, `TENANT_ADMIN` always; `MARKETING` only when
  the trip belongs to their own `agentId`. Transport/F&B/Manager never see documents.
- Visa lane mutation is Coordinator-only even though Reservations can see the trip.
- Manager and F&B/Host are enforced server-side as read-mostly: Manager's only write action is
  the package qualification flag; F&B/Host has no write actions at all.

## Tenant isolation rule

Every tenant-scoped table carries a `tenant_id` foreign key. The backend resolves the current
user's `tenant_id` from the authenticated session and injects it into every query filter —
requests can never supply a different `tenant_id` and read/write another tenant's rows, checked
in a shared FastAPI dependency (`get_current_tenant_scope`) used by every tenant-scoped router,
plus a defence-in-depth ownership check on every single-object fetch (`resource.tenant_id ==
current_user.tenant_id` or 404).

Super Admin is the only role allowed to operate without a `tenant_id` filter, and only against
the specific cross-tenant endpoints listed in §5 of the product brief (tenant CRUD, platform
stats, platform audit) — Super Admin has no route into any tenant's operational data (guests,
trips, bookings, etc.), matching the prototype's `NAV.SUPER_ADMIN` which never exposes those
pages.
