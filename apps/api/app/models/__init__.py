"""Import every model module so Alembic's autogenerate sees the full metadata."""
from app.models import (  # noqa: F401
    audit,
    booking,
    document,
    expense,
    guest,
    guest_link,
    master_data,
    notification,
    tenant,
    transport,
    trip,
    user,
)

__all__ = [
    "tenant",
    "user",
    "guest",
    "trip",
    "booking",
    "transport",
    "master_data",
    "document",
    "expense",
    "guest_link",
    "notification",
    "audit",
]
