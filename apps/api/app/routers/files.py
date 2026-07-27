"""Document attachments — metadata in Postgres, bytes on disk under a random
storage key (never exposed to clients), authorization enforced on every
download per the security brief's explicit requirement.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.errors import bad_request, forbidden, not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_tenant_user
from app.models.enums import DocumentCategory, DocumentOwnerType, UserRole
from app.models.document import Document
from app.models.guest import Guest
from app.models.trip import Companion, Trip
from app.services.audit import record_event
from app.services.storage import get_storage_backend, validate_upload
from app.security import now_utc

router = APIRouter(prefix="/api/files", tags=["files"])

# Roles that may view/download documents at all (Marketing further scoped to
# their own trips at the row level below).
CAN_SEE_DOCS = {UserRole.COORDINATOR, UserRole.RESERVATIONS, UserRole.TENANT_ADMIN, UserRole.MARKETING}
CAN_DELETE_DOCS = {UserRole.COORDINATOR, UserRole.TENANT_ADMIN}


def _owner_trip_id(db: Session, owner_type: DocumentOwnerType, owner_id: uuid.UUID) -> uuid.UUID | None:
    if owner_type == DocumentOwnerType.COMPANION:
        c = db.query(Companion).filter(Companion.id == owner_id).first()
        return c.trip_id if c else None
    return None


def _authorize(db: Session, current_user: CurrentUser, doc: Document) -> None:
    if current_user.role not in CAN_SEE_DOCS:
        raise forbidden("You do not have access to documents.")
    if current_user.role == UserRole.MARKETING:
        trip_id = doc.trip_id or _owner_trip_id(db, doc.owner_type, doc.owner_id)
        trip = db.query(Trip).filter(Trip.id == trip_id).first() if trip_id else None
        if not trip or trip.agent_id != current_user.agent_id:
            raise forbidden("You may only access documents on your own trips.")


def _out(d: Document) -> dict:
    return {
        "id": str(d.id), "trip_id": str(d.trip_id) if d.trip_id else None, "owner_type": d.owner_type.value,
        "owner_id": str(d.owner_id), "category": d.category.value, "original_filename": d.original_filename,
        "mime_type": d.mime_type, "size_bytes": d.size_bytes,
        "uploaded_by": str(d.uploaded_by) if d.uploaded_by else None, "uploaded_at": d.uploaded_at.isoformat(),
    }


@router.get("")
def list_documents(
    trip_id: uuid.UUID | None = None,
    owner_type: DocumentOwnerType | None = None,
    owner_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_tenant_user),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    q = db.query(Document).filter(Document.tenant_id == tenant_id, Document.is_deleted.is_(False))
    if trip_id:
        q = q.filter(Document.trip_id == trip_id)
    if owner_type:
        q = q.filter(Document.owner_type == owner_type)
    if owner_id:
        q = q.filter(Document.owner_id == owner_id)
    docs = q.order_by(Document.uploaded_at.desc()).all()
    visible = []
    for d in docs:
        try:
            _authorize(db, current_user, d)
            visible.append(d)
        except Exception:
            continue
    return [_out(d) for d in visible]


@router.post("")
async def upload_document(
    file: UploadFile,
    owner_type: DocumentOwnerType = Form(...),
    owner_id: uuid.UUID = Form(...),
    category: DocumentCategory = Form(...),
    trip_id: uuid.UUID | None = Form(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_tenant_user),
    tenant_id: uuid.UUID = Depends(get_tenant_scope),
):
    if current_user.role not in CAN_SEE_DOCS:
        raise forbidden("You do not have permission to upload documents.")
    data = await file.read()
    error = validate_upload(file.content_type or "application/octet-stream", len(data))
    if error:
        raise bad_request(error)

    if current_user.role == UserRole.MARKETING:
        effective_trip_id = trip_id or _owner_trip_id(db, owner_type, owner_id)
        trip = db.query(Trip).filter(Trip.id == effective_trip_id).first() if effective_trip_id else None
        if not trip or trip.agent_id != current_user.agent_id:
            raise forbidden("You may only upload documents to your own trips.")

    backend = get_storage_backend()
    stored = backend.save(str(tenant_id), file.filename or "upload", file.content_type or "application/octet-stream", data)

    doc = Document(
        tenant_id=tenant_id, trip_id=trip_id, owner_type=owner_type, owner_id=owner_id, category=category,
        original_filename=file.filename or "upload", storage_key=stored.storage_key,
        mime_type=file.content_type or "application/octet-stream", size_bytes=stored.size_bytes,
        uploaded_by=current_user.id, uploaded_at=now_utc(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip_id, action="FILE_UPLOADED", description=f"{category.value} document uploaded: {doc.original_filename}",
        entity_type="document", entity_id=str(doc.id),
    )
    return _out(doc)


@router.get("/{document_id}/download")
def download_document(document_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_tenant_user), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    doc = db.query(Document).filter(Document.id == document_id, Document.tenant_id == tenant_id, Document.is_deleted.is_(False)).first()
    if not doc:
        raise not_found("Document not found.")
    _authorize(db, current_user, doc)
    backend = get_storage_backend()
    stream = backend.open_stream(doc.storage_key)
    return StreamingResponse(
        stream, media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.original_filename}"'},
    )


@router.delete("/{document_id}")
def delete_document(document_id: uuid.UUID, reason: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_tenant_user), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    if current_user.role not in CAN_DELETE_DOCS:
        raise forbidden("You do not have permission to delete documents.")
    doc = db.query(Document).filter(Document.id == document_id, Document.tenant_id == tenant_id, Document.is_deleted.is_(False)).first()
    if not doc:
        raise not_found("Document not found.")
    if not reason.strip():
        raise bad_request("A reason is required to delete a document.")
    doc.is_deleted = True
    doc.deleted_by = current_user.id
    doc.deleted_at = now_utc()
    doc.deleted_reason = reason
    db.commit()
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=doc.trip_id, action="FILE_DELETED", description=f"Document deleted: {doc.original_filename}",
        entity_type="document", entity_id=str(doc.id), reason=reason,
    )
    return {"ok": True}
