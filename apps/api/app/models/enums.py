import enum


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    TENANT_ADMIN = "TENANT_ADMIN"
    MARKETING = "MARKETING"
    COORDINATOR = "COORDINATOR"
    RESERVATIONS = "RESERVATIONS"
    TRANSPORT = "TRANSPORT"
    FNB_VIEW = "FNB_VIEW"
    MANAGER = "MANAGER"


VIEW_MODE_ROLES = {UserRole.FNB_VIEW, UserRole.MANAGER}


class TripStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    CLEARED = "CLEARED"
    BOOKING = "BOOKING"
    TRAVEL_CONFIRMED = "TRAVEL_CONFIRMED"
    IN_HOUSE = "IN_HOUSE"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


ALLOWED_STATUS_TRANSITIONS: dict[TripStatus, list[TripStatus]] = {
    TripStatus.DRAFT: [TripStatus.SUBMITTED, TripStatus.CANCELLED],
    TripStatus.SUBMITTED: [TripStatus.CLEARED, TripStatus.CANCELLED],
    TripStatus.CLEARED: [TripStatus.BOOKING, TripStatus.CANCELLED],
    TripStatus.BOOKING: [TripStatus.TRAVEL_CONFIRMED, TripStatus.CANCELLED, TripStatus.NO_SHOW],
    TripStatus.TRAVEL_CONFIRMED: [TripStatus.IN_HOUSE, TripStatus.CANCELLED, TripStatus.NO_SHOW],
    TripStatus.IN_HOUSE: [TripStatus.COMPLETED],
    TripStatus.COMPLETED: [TripStatus.CLOSED],
    TripStatus.CLOSED: [],
    TripStatus.CANCELLED: [],
    TripStatus.NO_SHOW: [],
}

REASON_REQUIRED_STATUSES = {TripStatus.CANCELLED, TripStatus.NO_SHOW}


class PackageFlagStatus(str, enum.Enum):
    PENDING = "PENDING"
    QUALIFIED = "QUALIFIED"
    NOT_QUALIFIED = "NOT_QUALIFIED"


class NoteType(str, enum.Enum):
    GENERAL = "General"
    ERROR_CORRECTION = "Error & Correction"
    INCIDENT = "Incident"
    GUEST_FEEDBACK = "Guest Feedback"


class ChecklistItemKey(str, enum.Enum):
    FLIGHT = "flight"
    HOTEL = "hotel"
    VISA = "visa"
    PICKUP_ASSIGNED = "pickupA"
    PICKUP_COMPLETED = "pickupC"
    DROP_ASSIGNED = "dropA"
    DROP_COMPLETED = "dropC"
    EXPENSE = "expense"
    FLAG = "flag"


NA_ELIGIBLE_CHECKLIST_ITEMS = {
    ChecklistItemKey.FLIGHT,
    ChecklistItemKey.HOTEL,
    ChecklistItemKey.VISA,
    ChecklistItemKey.PICKUP_ASSIGNED,
    ChecklistItemKey.PICKUP_COMPLETED,
    ChecklistItemKey.DROP_ASSIGNED,
    ChecklistItemKey.DROP_COMPLETED,
}


class BookingLevel(str, enum.Enum):
    GUEST = "guest"
    GROUP = "group"


class BookingStatus(str, enum.Enum):
    DRAFT = "Draft"
    CONFIRMED = "Confirmed"
    CANCELLED = "Cancelled"


class PaymentStatus(str, enum.Enum):
    PENDING = "Pending"
    PAID = "Paid"
    PARTIALLY_PAID = "Partially Paid"
    OUTSTANDING = "Outstanding"


class VisaTravellerType(str, enum.Enum):
    GUEST = "guest"
    COMPANION = "companion"


class VisaStatus(str, enum.Enum):
    NOT_REQUIRED = "Not Required"
    TO_APPLY = "To Apply"
    APPLIED = "Applied"
    GRANTED = "Granted"
    REJECTED = "Rejected"
    ON_ARRIVAL = "On Arrival"


class TransportLegType(str, enum.Enum):
    ARRIVAL_PICKUP = "Arrival Pickup"
    HOTEL_CASINO_TRANSFER = "Hotel–Casino Transfer"
    DEPARTURE_DROP = "Departure Drop"
    OTHER = "Other"


class TransportSource(str, enum.Enum):
    INHOUSE = "inhouse"
    VENDOR = "vendor"


class UsageType(str, enum.Enum):
    AIRPORT = "Airport"
    CITY = "City use"
    OUT_OF_CITY = "Out-of-city"
    MULTI_DAY = "Multi-day"


class RateBasis(str, enum.Enum):
    PER_TRIP = "Per trip"
    PER_DAY = "Per day"
    PER_KM = "Per km"


class DocumentOwnerType(str, enum.Enum):
    GUEST = "guest"
    COMPANION = "companion"
    BOOKING = "booking"
    VISA = "visa"
    OTHER = "other"


class DocumentCategory(str, enum.Enum):
    PASSPORT = "passport"
    VISA = "visa"
    INVOICE = "invoice"
    ETA_NOTICE = "eta"
    OTHER = "other"


class ExpenseCategory(str, enum.Enum):
    FLIGHT = "Flight"
    HOTEL = "Hotel"
    TRANSPORT = "Transport"
    VISA = "Visa"


class NotificationRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    TENANT_ADMIN = "TENANT_ADMIN"
    MARKETING = "MARKETING"
    COORDINATOR = "COORDINATOR"
    RESERVATIONS = "RESERVATIONS"
    TRANSPORT = "TRANSPORT"
    FNB_VIEW = "FNB_VIEW"
    MANAGER = "MANAGER"
