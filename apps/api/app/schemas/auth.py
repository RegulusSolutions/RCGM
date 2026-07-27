import uuid

from pydantic import BaseModel

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class MeResponse(BaseModel):
    id: uuid.UUID
    username: str
    name: str
    role: UserRole
    tenant_id: uuid.UUID | None
    tenant_name: str | None = None
    tenant_code: str | None = None
    view_mode: bool
    can_mark_paid: bool
