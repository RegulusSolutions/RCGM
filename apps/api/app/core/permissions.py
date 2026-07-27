"""Role/permission constants mirroring docs/roles-and-permissions.md.

This is the single source of truth the backend consults for RBAC checks —
never trust a role value supplied by the frontend/request body.
"""
from app.models.enums import UserRole

# Roles allowed to edit flight/hotel booking lanes.
CAN_EDIT_BOOKING_LANES = {UserRole.COORDINATOR, UserRole.RESERVATIONS}

# Roles allowed to create/edit/complete transport legs.
CAN_EDIT_TRANSPORT_LEGS = {UserRole.COORDINATOR, UserRole.TRANSPORT}

# Roles allowed to see/enter cost fields on a transport leg. TRANSPORT is
# deliberately excluded — the strongest role-segregation rule in the product.
CAN_SEE_TRANSPORT_COST = {UserRole.COORDINATOR, UserRole.TENANT_ADMIN, UserRole.MANAGER}

# Roles that may cancel a transport leg or edit vendor payment.
CAN_CANCEL_TRANSPORT_LEG = {UserRole.COORDINATOR}

# Roles allowed to view uploaded documents (Marketing additionally gated by
# agent ownership at the router layer).
CAN_SEE_DOCS_ROLES = {UserRole.COORDINATOR, UserRole.RESERVATIONS, UserRole.TENANT_ADMIN}

# Roles that may record compliance clearance.
CAN_RECORD_CLEARANCE = {UserRole.COORDINATOR}

# Roles that may mutate the visa lane.
CAN_EDIT_VISA_LANE = {UserRole.COORDINATOR}

# Roles that may set the package qualification flag.
CAN_SET_PACKAGE_FLAG = {UserRole.MANAGER}

# Roles that may generate expense summaries / manage guest links / groups / handovers.
CAN_MANAGE_TRIP_OPS = {UserRole.COORDINATOR}

# Roles that may manage tenant master data.
CAN_MANAGE_MASTER_DATA = {UserRole.TENANT_ADMIN}

# Roles that may manage tenant users.
CAN_MANAGE_USERS = {UserRole.TENANT_ADMIN}

# Roles that may manage tenant settings / flag windows.
CAN_MANAGE_SETTINGS = {UserRole.TENANT_ADMIN}

# Roles considered "view mode" (mostly read + narrow approval actions).
VIEW_MODE_ROLES = {UserRole.FNB_VIEW, UserRole.MANAGER}
