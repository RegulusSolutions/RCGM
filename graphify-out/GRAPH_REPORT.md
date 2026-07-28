# Graph Report - .  (2026-07-28)

## Corpus Check
- Corpus is ~49,001 words - fits in a single context window. You may not need a graph.

## Summary
- 623 nodes · 2227 edges · 49 communities (35 shown, 14 thin omitted)
- Extraction: 58% EXTRACTED · 42% INFERRED · 0% AMBIGUOUS · INFERRED: 936 edges (avg confidence: 0.63)
- Token cost: 177,833 input · 0 output

## Community Hubs (Navigation)
- Core Domain Models
- Trip Status & Expense Services
- Transport & Visa Management
- Document Storage & Files API
- Reporting & CSV Export
- Tenant & User Administration
- Booking Workflow (Prototype)
- Trip Lifecycle & Audit
- Database Core & Guest Records
- Flight & Hotel Bookings
- Trip Grouping & Numbering
- Authentication & Session Security
- Notification System
- Project Documentation
- App Configuration & Bootstrap
- Clearance & Notification Flow
- Package Flag Management
- Planned Service Architecture
- Access Control Dependencies
- Health Checks & Host Arrivals
- Guest Link Sharing
- Master Data Catalog
- Deployment & Login Design
- Roles & Permissions
- Public Itinerary Access
- Expense Summary Rationale
- Auth Request/Response Schemas
- Storage & Deployment Notes
- Permissions Module
- Models Package Init
- Docker Entrypoint Script
- CSRF Defense Design
- Multi-Tenancy Design
- Tenant Scope Dependency
- Coordinator Role
- F&B View Role
- Manager Role
- Marketing Role
- Reservations Role
- Super Admin Role
- Tenant Admin Role
- Transport Role

## God Nodes (most connected - your core abstractions)
1. `CurrentUser` - 130 edges
2. `Trip` - 92 edges
3. `RCGM Feature & Page Inventory` - 58 edges
4. `record_event()` - 48 edges
5. `UserRole` - 42 edges
6. `not_found()` - 41 edges
7. `Base` - 41 edges
8. `UUIDPrimaryKeyMixin` - 39 edges
9. `Guest` - 34 edges
10. `TenantScopedMixin` - 32 edges

## Surprising Connections (you probably didn't know these)
- `Backend runtime dependencies (FastAPI, SQLAlchemy, Alembic, Argon2, ...)` --shares_data_with--> `RCGM Database Schema (PostgreSQL)`  [INFERRED]
  apps/api/requirements.txt → docs/database-schema.md
- `RCGM Feature & Page Inventory` --references--> `anchorFor()`  [EXTRACTED]
  docs/feature-inventory.md → RCGM — Regulus Casino Guest Manager.html
- `RCGM Feature & Page Inventory` --references--> `canEditLanes()`  [EXTRACTED]
  docs/feature-inventory.md → RCGM — Regulus Casino Guest Manager.html
- `RCGM Feature & Page Inventory` --references--> `canEditLegs()`  [EXTRACTED]
  docs/feature-inventory.md → RCGM — Regulus Casino Guest Manager.html
- `RCGM Feature & Page Inventory` --references--> `canSeeDocs()`  [EXTRACTED]
  docs/feature-inventory.md → RCGM — Regulus Casino Guest Manager.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Four documented prototype-gap enhancements added in the rebuild** — docs_feature_inventory_vehicle_conflict_gap, docs_feature_inventory_expense_history_gap, docs_feature_inventory_handover_history_gap, docs_feature_inventory_guest_link_logging_gap [EXTRACTED 1.00]
- **Eight RCGM roles participating in the RBAC permission matrix** — docs_roles_and_permissions_super_admin, docs_roles_and_permissions_tenant_admin, docs_roles_and_permissions_marketing, docs_roles_and_permissions_coordinator, docs_roles_and_permissions_reservations, docs_roles_and_permissions_transport, docs_roles_and_permissions_fnb_view, docs_roles_and_permissions_manager [EXTRACTED 1.00]
- **Backend services implementing the 'business rules live in services/' architecture pattern** — docs_architecture_tripstatusservice, docs_architecture_checklistservice, docs_architecture_expenseservice, docs_architecture_flagwindowservice, docs_architecture_auditservice, docs_architecture_storagebackend [EXTRACTED 1.00]

## Communities (49 total, 14 thin omitted)

### Community 0 - "Core Domain Models"
Cohesion: 0.15
Nodes (61): Base, Shared declarative base for all ORM models., ChecklistItemKey, NoteType, NotificationRole, PackageFlagStatus, TripStatus, UserRole (+53 more)

### Community 1 - "Trip Status & Expense Services"
Cohesion: 0.09
Nodes (45): ExpenseSummary, ExpenseSummaryItem, Versioned, append-only snapshot. Regenerating NEVER overwrites a prior row —, Trip, get_current_summary(), get_history(), Session, UUID (+37 more)

### Community 2 - "Transport & Visa Management"
Cohesion: 0.12
Nodes (45): conflict(), not_found(), VisaApplication, BookingLevel, BookingStatus, DocumentCategory, ExpenseCategory, PaymentStatus (+37 more)

### Community 3 - "Document Storage & Files API"
Cohesion: 0.09
Nodes (30): AppError, forbidden(), Consistent error envelope + global exception handlers.  Guarantees the API nev, register_exception_handlers(), Any authenticated tenant-scoped user (excludes SUPER_ADMIN, who has no tenant)., require_tenant_user(), Document, Metadata only — the actual bytes live on disk (or later S3/R2/MinIO) under a (+22 more)

### Community 4 - "Reporting & CSV Export"
Cohesion: 0.19
Nodes (39): CurrentUser, active_trips(), active_trips_csv(), _active_trips_rows(), _agent_name(), agent_performance(), agent_performance_csv(), _agent_performance_rows() (+31 more)

### Community 5 - "Tenant & User Administration"
Cohesion: 0.13
Nodes (32): Tenant, TenantSettings, User, Config, create_tenant(), list_tenants(), platform_stats(), BaseModel (+24 more)

### Community 6 - "Booking Workflow (Prototype)"
Cohesion: 0.07
Nodes (13): trips table (status enum, ALLOWED_NEXT lifecycle), RCGM Feature & Page Inventory, "RCGM records payment status only — it is not accounts payable", Visa fee guide is "A GUIDE, never a rule", ALLOWED_NEXT status transition map, feeGuide(), genGuestLink(), guestLinkAlive() (+5 more)

### Community 7 - "Trip Lifecycle & Audit"
Cohesion: 0.26
Nodes (25): bad_request(), ack_handover(), add_note(), change_status(), clear_na(), create_handover(), create_trip(), edit_trip() (+17 more)

### Community 8 - "Database Core & Guest Records"
Cohesion: 0.11
Nodes (19): get_db(), Session, SQLAlchemy engine/session setup., AuditEvent, Append-only. No router/service in this codebase issues UPDATE or DELETE     aga, list_audit(), _out(), platform_audit() (+11 more)

### Community 9 - "Flight & Hotel Bookings"
Cohesion: 0.27
Nodes (25): FlightBooking, HotelBooking, cancel_flight(), cancel_hotel(), CancelIn, _check_paid(), confirm_flight(), confirm_hotel() (+17 more)

### Community 10 - "Trip Grouping & Numbering"
Cohesion: 0.25
Nodes (17): TripGroup, assign_trip(), create_group(), get_group(), GroupCreate, list_groups(), BaseModel, Session (+9 more)

### Community 11 - "Authentication & Session Security"
Cohesion: 0.23
Nodes (17): login(), logout(), me(), Request, Session, generate_session_token(), hash_token(), is_rate_limited() (+9 more)

### Community 12 - "Notification System"
Cohesion: 0.27
Nodes (13): Notification, list_notifications(), mark_all_read(), mark_read(), _out(), Session, UUID, _visible_query() (+5 more)

### Community 13 - "Project Documentation"
Cohesion: 0.18
Nodes (16): RCGM docker-compose stack definition, RCGM API Reference, RCGM Architecture (Local Development), RCGM Database Schema (PostgreSQL), guest_link_access_log table, transport_legs table + vehicle-conflict partial index, trip_handovers table (append-only, supersede not overwrite), Prototype gap: no access logging on guest links (+8 more)

### Community 14 - "App Configuration & Bootstrap"
Cohesion: 0.15
Nodes (5): get_settings(), Centralised, environment-driven application settings (Pydantic Settings).  Not, Settings, RCGM API entry point.  Wires together CORS, global exception handling (app/cor, BaseSettings

### Community 15 - "Clearance & Notification Flow"
Cohesion: 0.15
Nodes (15): Notification service (services/notifications.py, polling), audit_events table (append-only, no UPDATE/DELETE), "RCGM records that clearance was given" — KYC/AML decision made outside the system, "Flag only — RCGM performs no qualification computation", completeLeg(), dlCSV(), doStatus(), logEvent() (+7 more)

### Community 16 - "Package Flag Management"
Cohesion: 0.36
Nodes (11): PackageQualificationFlag, History-preserving: prior decisions kept with is_current=false rather than, FlagIn, get_flag(), get_flag_history(), _out(), BaseModel, Session (+3 more)

### Community 17 - "Planned Service Architecture"
Cohesion: 0.20
Nodes (12): ChecklistService, ExpenseService, FlagWindowService, TripStatusService, anchorFor(), expenseItems(), flagLevel(), gateCheck() (+4 more)

### Community 18 - "Access Control Dependencies"
Cohesion: 0.24
Nodes (10): get_client_ip(), get_current_user(), get_tenant_scope(), Request, Session, UUID, Shared FastAPI dependencies: current user, RBAC, tenant scope, CSRF., Returns the tenant_id every tenant-scoped query MUST filter by. The     fronten (+2 more)

### Community 19 - "Health Checks & Host Arrivals"
Cohesion: 0.20
Nodes (8): Session, readiness(), host_arrivals(), date, Session, UUID, F&B / Host — a strictly read-only view. This module must never surface costs, p, FastAPI

### Community 20 - "Guest Link Sharing"
Cohesion: 0.42
Nodes (8): GuestShareLink, create_link(), list_links(), _out(), Session, UUID, Guest itinerary share-link management (Coordinator side). The public, unauthent, revoke_link()

### Community 21 - "Master Data Catalog"
Cohesion: 0.53
Nodes (8): create_catalog_item(), list_catalog(), Session, UUID, Generic CRUD for the 8 tenant master-data catalogues (hotels, airlines, vehicle, _serialize(), toggle_catalog_item(), update_catalog_item()

### Community 22 - "Deployment & Login Design"
Cohesion: 0.25
Nodes (8): Backend dev/test dependencies (pytest, httpx), Backend runtime dependencies (FastAPI, SQLAlchemy, Alembic, Argon2, ...), api service (FastAPI backend container), postgres service (Postgres 16 Alpine), web service (Next.js frontend container, not yet buildable), AuditService (services/audit.py, cross-cutting), Server-side opaque session token auth (not JWT), doLogin()

### Community 23 - "Roles & Permissions"
Cohesion: 0.25
Nodes (8): RBAC dependency (deps.require_role), users table (role enum, can_mark_paid), RCGM Role & Permission Matrix, canEditLanes(), canEditLegs(), canPay(), canSeeDocs(), costVisible()

### Community 24 - "Public Itinerary Access"
Cohesion: 0.40
Nodes (4): get_public_itinerary(), Request, Session, Unauthenticated guest itinerary page. Only ever exposes the explicit allow- lis

### Community 25 - "Expense Summary Rationale"
Cohesion: 0.40
Nodes (5): expense_summaries / expense_summary_items tables (versioned), Prototype gap: expense summary overwritten in place, no revision history, RCGM performs no allocation; apportionment is for Accounts, No hard delete anywhere — soft deactivate/cancel only, full history retained, toggleMaster()

### Community 26 - "Auth Request/Response Schemas"
Cohesion: 0.67
Nodes (3): LoginRequest, MeResponse, BaseModel

### Community 28 - "Storage & Deployment Notes"
Cohesion: 0.67
Nodes (3): StorageBackend abstraction (LocalDiskBackend, later S3/R2/MinIO), RCGM Deployment Notes, viewDoc()

## Knowledge Gaps
- **19 isolated node(s):** `docker-entrypoint.sh script`, `Backend dev/test dependencies (pytest, httpx)`, `RCGM single-file HTML prototype (schema v7, Phase 8 RC)`, `postgres service (Postgres 16 Alpine)`, `web service (Next.js frontend container, not yet buildable)` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CurrentUser` connect `Reporting & CSV Export` to `Core Domain Models`, `Trip Status & Expense Services`, `Transport & Visa Management`, `Document Storage & Files API`, `Tenant & User Administration`, `Trip Lifecycle & Audit`, `Database Core & Guest Records`, `Flight & Hotel Bookings`, `Trip Grouping & Numbering`, `Authentication & Session Security`, `Notification System`, `Package Flag Management`, `Access Control Dependencies`, `Health Checks & Host Arrivals`, `Guest Link Sharing`, `Master Data Catalog`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Why does `Trip` connect `Trip Status & Expense Services` to `Core Domain Models`, `Transport & Visa Management`, `Document Storage & Files API`, `Reporting & CSV Export`, `Trip Lifecycle & Audit`, `Database Core & Guest Records`, `Flight & Hotel Bookings`, `Trip Grouping & Numbering`, `Package Flag Management`, `Health Checks & Host Arrivals`, `Guest Link Sharing`, `Public Itinerary Access`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `upload_document()` connect `Document Storage & Files API` to `Trip Status & Expense Services`, `Transport & Visa Management`, `Reporting & CSV Export`, `Trip Lifecycle & Audit`, `Authentication & Session Security`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 32 inferred relationships involving `CurrentUser` (e.g. with `UserRole` and `User`) actually correct?**
  _`CurrentUser` has 32 INFERRED edges - model-reasoned connections that need verification._
- **Are the 68 inferred relationships involving `Trip` (e.g. with `Base` and `ChecklistItemKey`) actually correct?**
  _`Trip` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 44 inferred relationships involving `record_event()` (e.g. with `login()` and `logout()`) actually correct?**
  _`record_event()` has 44 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `UserRole` (e.g. with `CurrentUser` and `AuditEvent`) actually correct?**
  _`UserRole` has 39 INFERRED edges - model-reasoned connections that need verification._