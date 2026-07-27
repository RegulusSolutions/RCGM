"""Versioned expense summary generation + staleness detection.

Unlike the prototype (which overwrote a single `trip.expenseGen` stamp), every
"Generate" call here inserts a new, immutable `ExpenseSummary` row with an
incrementing `version` and flips `is_current`, per the task brief's explicit
requirement to keep revision history.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.booking import BookingStatus, FlightBooking, HotelBooking, VisaApplication
from app.models.enums import BookingLevel, ExpenseCategory
from app.models.expense import ExpenseSummary, ExpenseSummaryItem
from app.models.trip import Trip
from app.models.transport import TransportLeg
from app.security import now_utc

COST_ACTIONS = {
    "BOOKING_ADDED",
    "BOOKING_EDIT",
    "BOOKING_CONFIRMED",
    "BOOKING_CANCELLED",
    "LEG_ADDED",
    "LEG_EDIT",
    "LEG_CANCELLED",
    "VISA_UPDATE",
}


def count_changes_since(db: Session, trip_id: uuid.UUID, since: datetime) -> int:
    from app.models.audit import AuditEvent

    return (
        db.query(AuditEvent)
        .filter(AuditEvent.trip_id == trip_id, AuditEvent.created_at > since, AuditEvent.action.in_(COST_ACTIONS))
        .count()
    )


def _owner_filter(model, trip: Trip):
    return or_(model.trip_id == trip.id, model.group_id == trip.group_id if trip.group_id else False)


def build_expense_items(db: Session, trip: Trip) -> list[dict]:
    items: list[dict] = []
    group_no = trip.group.group_no if trip.group_id and trip.group else ""

    for b in db.query(FlightBooking).filter(_owner_filter(FlightBooking, trip)).all():
        shared = b.level == BookingLevel.GROUP
        desc = f"{b.booking_no} — {b.airline_name} {b.flight_numbers}"
        if b.booking_status != BookingStatus.CANCELLED:
            items.append(dict(category=ExpenseCategory.FLIGHT, description=desc + (f" [Group cost — shared · {group_no}]" if shared else ""), currency=b.currency, amount=b.amount, lkr=b.lkr_equivalent or 0, pay=b.payment_status.value, shared=shared, source_type="flight_booking", source_id=b.id))
        elif b.cancellation_charge and b.cancellation_charge > 0:
            items.append(dict(category=ExpenseCategory.FLIGHT, description=desc + f" — CANCELLATION CHARGE ({b.cancellation_reason or ''})", currency=b.currency, amount=b.cancellation_charge, lkr=b.cancellation_charge_lkr or 0, pay=b.payment_status.value, shared=shared, source_type="flight_booking", source_id=b.id))

    for b in db.query(HotelBooking).filter(_owner_filter(HotelBooking, trip)).all():
        shared = b.level == BookingLevel.GROUP
        desc = f"{b.booking_no} — {b.hotel_name} {b.room_type} ×{b.night_count}nt"
        if b.booking_status != BookingStatus.CANCELLED:
            items.append(dict(category=ExpenseCategory.HOTEL, description=desc + (f" [Group cost — shared · {group_no}]" if shared else ""), currency=b.currency, amount=b.amount, lkr=b.lkr_equivalent or 0, pay=b.payment_status.value, shared=shared, source_type="hotel_booking", source_id=b.id))
        elif b.cancellation_charge and b.cancellation_charge > 0:
            items.append(dict(category=ExpenseCategory.HOTEL, description=desc + f" — CANCELLATION CHARGE ({b.cancellation_reason or ''})", currency=b.currency, amount=b.cancellation_charge, lkr=b.cancellation_charge_lkr or 0, pay=b.payment_status.value, shared=shared, source_type="hotel_booking", source_id=b.id))

    for l in db.query(TransportLeg).filter(_owner_filter(TransportLeg, trip)).all():
        shared = l.level == BookingLevel.GROUP
        who = l.vehicle_id and "in-house vehicle" or (l.vendor_id and "vendor" or "—")
        desc = f"{l.leg_type.value} — {who}"
        if not l.is_cancelled and l.amount is not None:
            items.append(dict(category=ExpenseCategory.TRANSPORT, description=desc + (f" [Group cost — shared · {group_no}]" if shared else ""), currency=l.currency, amount=l.amount, lkr=l.lkr_equivalent or 0, pay=(l.payment_status.value if l.vendor_id else "—"), shared=shared, source_type="transport_leg", source_id=l.id))
        elif l.is_cancelled and l.cancel_charge and l.cancel_charge > 0:
            items.append(dict(category=ExpenseCategory.TRANSPORT, description=desc + f" — CANCELLATION CHARGE ({l.cancel_reason or ''})", currency="LKR", amount=l.cancel_charge, lkr=l.cancel_charge, pay="—", shared=shared, source_type="transport_leg", source_id=l.id))

    for v in db.query(VisaApplication).filter(VisaApplication.trip_id == trip.id).all():
        if v.fee_usd and v.fee_usd > 0:
            items.append(dict(category=ExpenseCategory.VISA, description=f"ETA — {v.traveller_name}" + (f" ({v.eta_reference})" if v.eta_reference else ""), currency="USD", amount=v.fee_usd, lkr=v.lkr_equivalent or 0, pay=v.payment_status.value, shared=False, source_type="visa_application", source_id=v.id))

    return items


def generate_summary(db: Session, trip: Trip, generated_by: uuid.UUID) -> ExpenseSummary:
    items = build_expense_items(db, trip)
    totals = {c: 0.0 for c in ExpenseCategory}
    outstanding = 0.0
    for i in items:
        totals[i["category"]] += float(i["lkr"] or 0)
        if i["pay"] in ("Pending", "Outstanding", "Partially Paid"):
            outstanding += float(i["lkr"] or 0)

    # supersede prior current version
    db.query(ExpenseSummary).filter(ExpenseSummary.trip_id == trip.id, ExpenseSummary.is_current.is_(True)).update(
        {"is_current": False}
    )
    prior_max = db.query(ExpenseSummary).filter(ExpenseSummary.trip_id == trip.id).count()

    summary = ExpenseSummary(
        tenant_id=trip.tenant_id,
        trip_id=trip.id,
        version=prior_max + 1,
        generated_by=generated_by,
        generated_at=now_utc(),
        is_current=True,
        flight_total_lkr=totals[ExpenseCategory.FLIGHT],
        hotel_total_lkr=totals[ExpenseCategory.HOTEL],
        transport_total_lkr=totals[ExpenseCategory.TRANSPORT],
        visa_total_lkr=totals[ExpenseCategory.VISA],
        grand_total_lkr=sum(totals.values()),
        outstanding_total_lkr=outstanding,
    )
    db.add(summary)
    db.flush()

    for i in items:
        db.add(
            ExpenseSummaryItem(
                expense_summary_id=summary.id,
                category=i["category"],
                description=i["description"],
                currency=i["currency"],
                amount=i["amount"],
                lkr_equivalent=i["lkr"] or 0,
                payment_status=i["pay"],
                is_shared_group=i["shared"],
                source_type=i["source_type"],
                source_id=i["source_id"],
            )
        )
    db.commit()
    db.refresh(summary)
    return summary
