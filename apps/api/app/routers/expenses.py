import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.database import get_db
from app.deps import CurrentUser, get_tenant_scope, require_role
from app.models.enums import UserRole
from app.models.expense import ExpenseSummary, ExpenseSummaryItem
from app.models.trip import Trip
from app.services.audit import record_event
from app.services.checklist import is_expense_stale
from app.services.expense_service import generate_summary

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

READ_ROLES = (UserRole.COORDINATOR, UserRole.TENANT_ADMIN, UserRole.MANAGER)


def _summary_out(s: ExpenseSummary, items: list[ExpenseSummaryItem], stale: bool) -> dict:
    return {
        "id": str(s.id), "trip_id": str(s.trip_id), "version": s.version, "is_current": s.is_current,
        "is_stale": stale, "generated_by": str(s.generated_by) if s.generated_by else None,
        "generated_at": s.generated_at.isoformat(),
        "flight_total_lkr": float(s.flight_total_lkr), "hotel_total_lkr": float(s.hotel_total_lkr),
        "transport_total_lkr": float(s.transport_total_lkr), "visa_total_lkr": float(s.visa_total_lkr),
        "grand_total_lkr": float(s.grand_total_lkr), "outstanding_total_lkr": float(s.outstanding_total_lkr),
        "items": [
            {
                "category": i.category.value, "description": i.description, "currency": i.currency,
                "amount": float(i.amount) if i.amount is not None else None, "lkr_equivalent": float(i.lkr_equivalent),
                "payment_status": i.payment_status, "is_shared_group": i.is_shared_group,
            }
            for i in items
        ],
    }


@router.get("/trips/{trip_id}")
def get_current_summary(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    current = db.query(ExpenseSummary).filter(ExpenseSummary.trip_id == trip.id, ExpenseSummary.is_current.is_(True)).first()
    if not current:
        return None
    items = db.query(ExpenseSummaryItem).filter(ExpenseSummaryItem.expense_summary_id == current.id).all()
    return _summary_out(current, items, is_expense_stale(db, trip))


@router.get("/trips/{trip_id}/history")
def get_history(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(*READ_ROLES)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    rows = db.query(ExpenseSummary).filter(ExpenseSummary.trip_id == trip.id).order_by(ExpenseSummary.version.desc()).all()
    return [
        {"id": str(s.id), "version": s.version, "is_current": s.is_current, "generated_at": s.generated_at.isoformat(), "grand_total_lkr": float(s.grand_total_lkr)}
        for s in rows
    ]


@router.post("/trips/{trip_id}/generate")
def regenerate(trip_id: uuid.UUID, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_role(UserRole.COORDINATOR)), tenant_id: uuid.UUID = Depends(get_tenant_scope)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.tenant_id == tenant_id).first()
    if not trip:
        raise not_found("Trip not found.")
    summary = generate_summary(db, trip, current_user.id)
    record_event(
        db, tenant_id=tenant_id, user_id=current_user.id, username=current_user.username, role=current_user.role.value,
        trip_id=trip.id, action="EXPENSE_GENERATED", description=f"Expense summary v{summary.version} generated — LKR {summary.grand_total_lkr:,.2f}",
    )
    items = db.query(ExpenseSummaryItem).filter(ExpenseSummaryItem.expense_summary_id == summary.id).all()
    return _summary_out(summary, items, False)
