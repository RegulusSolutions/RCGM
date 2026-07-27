"""*** DEVELOPMENT-ONLY SEED DATA ***

Populates one demo tenant ("Jims Diamond Lounge") with sample users for every
role, master data catalogs, guests, trips across the lifecycle, bookings,
transport legs and a handful of audit events — mirroring the original HTML
prototype's seed data (docs/feature-inventory.md).

Every entity is looked up by a natural unique key before insert, so this
script is safe to run on every container start (see docker-entrypoint.sh).
NEVER point this script at a production database.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.config import get_settings
from app.database import SessionLocal
from app.models.booking import BookingStatus, FlightBooking, HotelBooking, PaymentStatus, VisaApplication
from app.models.enums import (
    NotificationRole,
    PackageFlagStatus,
    TransportLegType,
    TransportSource,
    TripStatus,
    UsageType,
    UserRole,
    VisaStatus,
    VisaTravellerType,
)
from app.models.guest import Guest, GuestPreference
from app.models.master_data import (
    Airline,
    Currency,
    Driver,
    Hotel,
    MarketingAgent,
    Package,
    TransportVendor,
    Vehicle,
    VisaFeeGuide,
)
from app.models.tenant import Tenant, TenantSettings
from app.models.transport import TransportLeg
from app.models.trip import Companion, Trip, TripClearance
from app.models.user import User
from app.security import hash_password, now_utc
from app.services.audit import record_event
from app.services.expense_service import generate_summary
from app.services.trip_numbering import next_booking_no, next_trip_no

settings = get_settings()


def get_or_create(db, model, defaults=None, **lookup):
    instance = db.query(model).filter_by(**lookup).first()
    if instance:
        return instance, False
    instance = model(**{**lookup, **(defaults or {})})
    db.add(instance)
    db.flush()
    return instance, True


# --------------------------------------------------------------------------- tenant
def seed_tenant(db) -> Tenant:
    tenant, created = get_or_create(
        db, Tenant, code=settings.seed_tenant_code,
        defaults=dict(name=settings.seed_tenant_name, location="Colombo, Sri Lanka", base_currency="LKR", guest_link_expiry_days=3),
    )
    get_or_create(db, TenantSettings, tenant_id=tenant.id)
    db.commit()
    if created:
        print(f"[seed] tenant created: {tenant.name} ({tenant.code})")
    return tenant


# --------------------------------------------------------------------------- users
def seed_users(db, tenant: Tenant, agent: MarketingAgent) -> dict[str, User]:
    suffix = settings.seed_demo_password_suffix
    roster = [
        (None, "superadmin", "Regulus Super Admin", UserRole.SUPER_ADMIN, False),
        (tenant.id, "admin", "Priya Admin", UserRole.TENANT_ADMIN, False),
        (tenant.id, "marketing", "Malik Marketing", UserRole.MARKETING, False),
        (tenant.id, "coordinator", "Chamari Coordinator", UserRole.COORDINATOR, True),
        (tenant.id, "reservations", "Ruwan Reservations", UserRole.RESERVATIONS, True),
        (tenant.id, "transport", "Tharindu Transport", UserRole.TRANSPORT, False),
        (tenant.id, "host", "Fatima Host", UserRole.FNB_VIEW, False),
        (tenant.id, "manager", "Manoj Manager", UserRole.MANAGER, False),
    ]
    users: dict[str, User] = {}
    for tenant_id, username, name, role, can_mark_paid in roster:
        password = f"{username}{suffix}"
        agent_id = agent.id if role == UserRole.MARKETING else None
        user, created = get_or_create(
            db, User, username=username,
            defaults=dict(
                tenant_id=tenant_id, password_hash=hash_password(password), name=name, role=role,
                is_active=True, can_mark_paid=can_mark_paid, agent_id=agent_id,
            ),
        )
        if created:
            print(f"[seed]   user '{username}' / '{password}'  ({role.value})")
        users[username] = user
    db.commit()
    return users


# --------------------------------------------------------------------------- master data
def seed_master_data(db, tenant: Tenant) -> dict:
    hotels = [
        get_or_create(db, Hotel, tenant_id=tenant.id, name=n, defaults=dict(location=loc, room_types=rt))[0]
        for n, loc, rt in [
            ("Cinnamon Grand Colombo", "Colombo 03", ["Deluxe", "Executive Suite", "Presidential Suite"]),
            ("Shangri-La Colombo", "Colombo 01", ["Deluxe", "Horizon Club", "Suite"]),
            ("Galle Face Hotel", "Colombo 03", ["Classic", "Sea View", "Regency Suite"]),
        ]
    ]
    airlines = [
        get_or_create(db, Airline, tenant_id=tenant.id, name=n, defaults=dict(travel_classes=tc))[0]
        for n, tc in [
            ("SriLankan Airlines", ["Economy", "Business", "First"]),
            ("Singapore Airlines", ["Economy", "Premium Economy", "Business"]),
            ("Emirates", ["Economy", "Business", "First"]),
        ]
    ]
    drivers = [
        get_or_create(db, Driver, tenant_id=tenant.id, name=n, defaults=dict(mobile=m))[0]
        for n, m in [("Sunil Perera", "+94 77 123 4567"), ("Kamal Silva", "+94 77 234 5678")]
    ]
    vehicles = [
        get_or_create(db, Vehicle, tenant_id=tenant.id, vehicle_no=vn, defaults=dict(vehicle_type=vt, capacity=cap, driver_id=drv.id))[0]
        for vn, vt, cap, drv in [
            ("WP CAB-1234", "Luxury Sedan", 3, drivers[0]),
            ("WP KV-5678", "Van (Alphard)", 6, drivers[1]),
        ]
    ]
    vendors = [
        get_or_create(db, TransportVendor, tenant_id=tenant.id, name=n, defaults=dict(contact=c, vehicle_types_offered=vt))[0]
        for n, c, vt in [("Ceylon VIP Transport", "+94 11 222 3333", "Sedan, Van, SUV")]
    ]
    packages = [
        get_or_create(db, Package, tenant_id=tenant.id, code=c, defaults=dict(label=l))[0]
        for c, l in [("DIAMOND-VIP", "Diamond VIP Package"), ("PLATINUM", "Platinum Package"), ("GOLD-STD", "Gold Standard Package")]
    ]
    agents = [
        get_or_create(db, MarketingAgent, tenant_id=tenant.id, name=n, defaults=dict(market=m, mobile=mo, email=e))[0]
        for n, m, mo, e in [
            ("Malik Marketing", "China", "+94 77 555 1111", "malik@jdl.example"),
            ("Anjali Fernando", "India", "+94 77 555 2222", "anjali@jdl.example"),
        ]
    ]
    currencies = [
        get_or_create(db, Currency, tenant_id=tenant.id, code=c, defaults=dict(name=n, is_base=base))[0]
        for c, n, base in [("LKR", "Sri Lankan Rupee", True), ("USD", "US Dollar", False), ("CNY", "Chinese Yuan", False), ("INR", "Indian Rupee", False)]
    ]
    fee_guides = [
        get_or_create(db, VisaFeeGuide, tenant_id=tenant.id, nationality_group=g, defaults=dict(fee_usd=fee, notes=note))[0]
        for g, fee, note in [
            ("China", 40, "Sri Lanka ETA — standard tourist"),
            ("India", 0, "Visa-free / ETA free for short stay"),
            ("Other nationalities", 50, "Standard ETA fee guide — verify against current government rate"),
        ]
    ]
    db.commit()
    return {"hotels": hotels, "airlines": airlines, "drivers": drivers, "vehicles": vehicles, "vendors": vendors, "packages": packages, "agents": agents, "currencies": currencies, "fee_guides": fee_guides}


# --------------------------------------------------------------------------- guests + trips
def _make_guest(db, tenant, name, membership_no, nationality, passport_no, dob_years_ago, prefs):
    guest, created = get_or_create(
        db, Guest, tenant_id=tenant.id, membership_no=membership_no,
        defaults=dict(
            name=name, nationality=nationality, mobile="+94 77 000 0000", whatsapp="+94 77 000 0000",
            email=f"{membership_no.lower()}@example.com", passport_no=passport_no,
            passport_expiry=date.today() + timedelta(days=900), dob=date.today() - timedelta(days=365 * dob_years_ago),
            visa_status="To Apply",
        ),
    )
    if created:
        db.flush()
        db.add(GuestPreference(guest_id=guest.id, **prefs))
        db.commit()
    return guest


def seed_guests_and_trips(db, tenant: Tenant, md: dict, users: dict[str, User]):
    today = date.today()
    agent = md["agents"][0]
    package = md["packages"][0]

    g1 = _make_guest(db, tenant, "Ananya Sharma", "MB-10001", "India", "N1234567", 34, dict(dietary="Vegetarian", beverage="Sparkling water", room="High floor, away from elevator", language="Hindi/English", vip_level="Diamond", signboard_name="Mrs. A. Sharma"))
    g2 = _make_guest(db, tenant, "Chen Wei", "MB-10002", "China", "E9988776", 41, dict(dietary="No shellfish", beverage="Green tea", room="King bed", language="Mandarin", vip_level="Platinum", signboard_name="Mr. Chen Wei"))
    g3 = _make_guest(db, tenant, "Rajesh Kumar", "MB-10003", "India", "P5544332", 52, dict(dietary="Jain vegetarian", beverage="Still water", room="Non-smoking", language="Hindi", vip_level="Gold", signboard_name="Mr. R. Kumar"))
    g4 = _make_guest(db, tenant, "Li Na", "MB-10004", "China", "E1122334", 29, dict(dietary="No pork", beverage="Oolong tea", room="Away from noise", language="Mandarin/English", vip_level="Diamond", signboard_name="Ms. Li Na"))

    def _make_trip(guest, arrival_in_days, departure_in_days, status, agent=agent, package=package):
        trip = db.query(Trip).filter(Trip.tenant_id == tenant.id, Trip.guest_id == guest.id).first()
        if trip:
            return trip, False
        trip = Trip(
            tenant_id=tenant.id, trip_no=next_trip_no(db, tenant.id), guest_id=guest.id, agent_id=agent.id,
            package_id=package.id, arrival_date=today + timedelta(days=arrival_in_days),
            departure_date=today + timedelta(days=departure_in_days), status=TripStatus.DRAFT,
            created_by=users["marketing"].id,
        )
        db.add(trip)
        db.flush()
        return trip, True

    # Trip A — still a draft
    trip_a, created_a = _make_trip(g3, 20, 25, TripStatus.DRAFT)

    # Trip B — submitted, awaiting clearance
    trip_b, created_b = _make_trip(g1, 10, 15, TripStatus.SUBMITTED)
    if created_b:
        trip_b.status = TripStatus.SUBMITTED
        db.add(Companion(tenant_id=tenant.id, trip_id=trip_b.id, name="Rohan Sharma", relationship_="Spouse", passport_no="N7654321", passport_expiry=today + timedelta(days=900), dob=today - timedelta(days=365 * 32), nationality="India", visa_status="To Apply"))

    # Trip C — cleared, flight + hotel confirmed, pickup assigned
    trip_c, created_c = _make_trip(g2, 5, 9, TripStatus.CLEARED)
    if created_c:
        trip_c.status = TripStatus.CLEARED
        db.add(TripClearance(tenant_id=tenant.id, trip_id=trip_c.id, cleared_by_name="External Compliance Desk", reference="EXT-CLR-20441", cleared_at=now_utc(), recorded_by=users["coordinator"].id, created_at=now_utc()))
        db.flush()
        fb = FlightBooking(
            tenant_id=tenant.id, booking_no=next_booking_no(db, tenant.id), trip_id=trip_c.id,
            airline_name=md["airlines"][0].name, travel_class="Business", flight_numbers="UL304/UL305", pnr="ABCDEF",
            route="PEK-CMB-PEK", ticket_count=1,
            arrival_datetime=datetime.combine(trip_c.arrival_date, datetime.min.time()) + timedelta(hours=14),
            return_datetime=datetime.combine(trip_c.departure_date, datetime.min.time()) + timedelta(hours=22),
            currency="USD", amount=1200, lkr_equivalent=392000, payment_status=PaymentStatus.PAID,
            payment_method="Bank transfer", payment_date=today, booking_status=BookingStatus.CONFIRMED,
            created_by=users["reservations"].id,
        )
        hb = HotelBooking(
            tenant_id=tenant.id, booking_no=next_booking_no(db, tenant.id), trip_id=trip_c.id,
            hotel_name=md["hotels"][0].name, room_type="Executive Suite", room_count=1, night_count=4,
            check_in=trip_c.arrival_date, check_out=trip_c.departure_date, confirmation_no="CG-CONF-8842",
            meal_plan="B&B", rate_per_night=250, currency="USD", amount=1000, lkr_equivalent=327000,
            payment_status=PaymentStatus.PENDING, booking_status=BookingStatus.CONFIRMED, created_by=users["reservations"].id,
        )
        db.add_all([fb, hb])
        db.add(TransportLeg(
            tenant_id=tenant.id, trip_id=trip_c.id, leg_type=TransportLegType.ARRIVAL_PICKUP,
            scheduled_at=fb.arrival_datetime, source=TransportSource.INHOUSE, vehicle_id=md["vehicles"][0].id,
            usage_type=UsageType.AIRPORT, currency="LKR", amount=8500, lkr_equivalent=8500,
            payment_status=PaymentStatus.PENDING, is_assigned=True, created_by=users["transport"].id,
        ))
        db.add(VisaApplication(
            tenant_id=tenant.id, trip_id=trip_c.id, traveller_type=VisaTravellerType.GUEST, traveller_ref_id=g2.id,
            traveller_name=g2.name, passport_no=g2.passport_no, dob=g2.dob, nationality="China",
            status=VisaStatus.GRANTED, eta_reference="ETA-CN-88213", application_date=today - timedelta(days=10),
            fee_usd=40, lkr_equivalent=13100, payment_status=PaymentStatus.PAID,
        ))

    # Trip D — in-house, pickup completed, hotel/flight confirmed, expense summary generated
    trip_d, created_d = _make_trip(g4, -1, 3, TripStatus.IN_HOUSE)
    if created_d:
        trip_d.status = TripStatus.IN_HOUSE
        trip_d.package_flag = PackageFlagStatus.QUALIFIED
        db.add(TripClearance(tenant_id=tenant.id, trip_id=trip_d.id, cleared_by_name="External Compliance Desk", reference="EXT-CLR-20309", cleared_at=now_utc() - timedelta(days=3), recorded_by=users["coordinator"].id, created_at=now_utc() - timedelta(days=3)))
        db.flush()
        fb2 = FlightBooking(
            tenant_id=tenant.id, booking_no=next_booking_no(db, tenant.id), trip_id=trip_d.id,
            airline_name=md["airlines"][1].name, travel_class="First", flight_numbers="SQ468/SQ469", pnr="ZYXWVU",
            route="SIN-CMB-SIN", ticket_count=1,
            arrival_datetime=datetime.combine(trip_d.arrival_date, datetime.min.time()) + timedelta(hours=9),
            return_datetime=datetime.combine(trip_d.departure_date, datetime.min.time()) + timedelta(hours=20),
            currency="USD", amount=2400, lkr_equivalent=784000, payment_status=PaymentStatus.PAID,
            payment_method="Credit card", payment_date=today - timedelta(days=2), booking_status=BookingStatus.CONFIRMED,
            created_by=users["reservations"].id,
        )
        hb2 = HotelBooking(
            tenant_id=tenant.id, booking_no=next_booking_no(db, tenant.id), trip_id=trip_d.id,
            hotel_name=md["hotels"][1].name, room_type="Horizon Club", room_count=1, night_count=4,
            check_in=trip_d.arrival_date, check_out=trip_d.departure_date, confirmation_no="SG-CONF-2201",
            meal_plan="Full Board", rate_per_night=320, currency="USD", amount=1280, lkr_equivalent=418500,
            payment_status=PaymentStatus.PAID, payment_method="Bank transfer", payment_date=today - timedelta(days=1),
            booking_status=BookingStatus.CONFIRMED, created_by=users["reservations"].id,
        )
        db.add_all([fb2, hb2])
        db.add(TransportLeg(
            tenant_id=tenant.id, trip_id=trip_d.id, leg_type=TransportLegType.ARRIVAL_PICKUP,
            scheduled_at=fb2.arrival_datetime, source=TransportSource.INHOUSE, vehicle_id=md["vehicles"][1].id,
            usage_type=UsageType.AIRPORT, currency="LKR", amount=9500, lkr_equivalent=9500,
            payment_status=PaymentStatus.PENDING, is_assigned=True, completed_by=users["transport"].id,
            completed_at=now_utc() - timedelta(hours=20), created_by=users["transport"].id,
        ))
        db.add(VisaApplication(
            tenant_id=tenant.id, trip_id=trip_d.id, traveller_type=VisaTravellerType.GUEST, traveller_ref_id=g4.id,
            traveller_name=g4.name, passport_no=g4.passport_no, dob=g4.dob, nationality="China",
            status=VisaStatus.GRANTED, eta_reference="ETA-CN-77410", application_date=today - timedelta(days=12),
            fee_usd=40, lkr_equivalent=13100, payment_status=PaymentStatus.PAID,
        ))
        db.commit()
        generate_summary(db, trip_d, users["coordinator"].id)

    db.commit()
    return {"trip_a": trip_a, "trip_b": trip_b, "trip_c": trip_c, "trip_d": trip_d, "created": {"a": created_a, "b": created_b, "c": created_c, "d": created_d}}


def seed_audit_examples(db, tenant: Tenant, users: dict, trips: dict) -> None:
    if not trips["created"]["c"]:
        return  # already seeded on a prior run — skip to avoid duplicate audit noise
    record_event(db, tenant_id=tenant.id, user_id=users["admin"].id, username=users["admin"].username, role=UserRole.TENANT_ADMIN.value, action="SEED", description="Development seed data loaded for Jims Diamond Lounge")
    record_event(db, tenant_id=tenant.id, user_id=users["coordinator"].id, username=users["coordinator"].username, role=UserRole.COORDINATOR.value, action="CLEARED_TO_BOOK", description=f"Cleared by External Compliance Desk (EXT-CLR-20441)", trip_id=trips["trip_c"].id, new_value=TripStatus.CLEARED.value)
    record_event(db, tenant_id=tenant.id, user_id=users["transport"].id, username=users["transport"].username, role=UserRole.TRANSPORT.value, action="LEG_COMPLETED", description="Arrival Pickup completed", trip_id=trips["trip_d"].id)


def main() -> None:
    db = SessionLocal()
    try:
        tenant = seed_tenant(db)
        md = seed_master_data(db, tenant)
        users = seed_users(db, tenant, md["agents"][0])
        trips = seed_guests_and_trips(db, tenant, md, users)
        seed_audit_examples(db, tenant, users, trips)
        print("[seed] complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
