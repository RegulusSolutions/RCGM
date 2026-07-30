export type UserRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "MARKETING"
  | "COORDINATOR"
  | "RESERVATIONS"
  | "TRANSPORT"
  | "FNB_VIEW"
  | "MANAGER";

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin (Regulus)",
  TENANT_ADMIN: "Tenant Admin",
  MARKETING: "Marketing Agent",
  COORDINATOR: "Coordinator",
  RESERVATIONS: "Reservations",
  TRANSPORT: "Transport",
  FNB_VIEW: "F&B / Host",
  MANAGER: "Manager",
};

export interface Me {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_code: string | null;
  view_mode: boolean;
  can_mark_paid: boolean;
}

export type TripStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "CLEARED"
  | "BOOKING"
  | "TRAVEL_CONFIRMED"
  | "IN_HOUSE"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "NO_SHOW";

export const STATUS_META: Record<TripStatus, { label: string; pill: PillTone }> = {
  DRAFT: { label: "Draft", pill: "grey" },
  SUBMITTED: { label: "Submitted", pill: "blue" },
  CLEARED: { label: "Cleared to Book", pill: "gold" },
  BOOKING: { label: "Booking in Progress", pill: "amber" },
  TRAVEL_CONFIRMED: { label: "Travel Confirmed", pill: "blue" },
  IN_HOUSE: { label: "In-House", pill: "green" },
  COMPLETED: { label: "Completed", pill: "green" },
  CLOSED: { label: "Closed", pill: "grey" },
  CANCELLED: { label: "Cancelled", pill: "red" },
  NO_SHOW: { label: "No-Show", pill: "red" },
};

export type PillTone = "green" | "amber" | "blue" | "grey" | "red" | "gold";

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface TripSummary {
  id: string;
  trip_no: string;
  status: TripStatus;
  package_flag: "PENDING" | "QUALIFIED" | "NOT_QUALIFIED";
  arrival_date: string;
  departure_date: string;
  guest_name: string | null;
  guest_membership_no: string | null;
  agent_name: string | null;
  package_code: string | null;
  group_id: string | null;
  companion_count: number;
  is_cleared: boolean;
}

export interface Preferences {
  dietary?: string | null;
  beverage?: string | null;
  room?: string | null;
  language?: string | null;
  vip_level?: string | null;
  signboard_name?: string | null;
  notes?: string | null;
}

export interface Guest {
  id: string;
  name: string;
  membership_no: string;
  nationality: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  passport_no: string | null;
  passport_expiry: string | null;
  dob: string | null;
  visa_status: string | null;
  preferences?: Preferences | null;
}

export interface Companion {
  id: string;
  name: string;
  relationship: string | null;
  passport_no: string | null;
  passport_expiry: string | null;
  dob: string | null;
  nationality: string | null;
  visa_status: string | null;
}

export interface TripDetail {
  id: string;
  trip_no: string;
  status: TripStatus;
  package_flag: "PENDING" | "QUALIFIED" | "NOT_QUALIFIED";
  arrival_date: string;
  departure_date: string;
  notes: string | null;
  group_id: string | null;
  guest: Guest | null;
  companions: Companion[];
  agent: { id: string; name: string } | null;
  package: { id: string; code: string; label: string } | null;
  clearance: {
    cleared_by_name: string;
    reference: string;
    cleared_at: string;
    is_override: boolean;
  } | null;
  notes_log: { id: string; note_type: string; text: string; created_at: string }[];
  handover: {
    id: string;
    text: string;
    created_at: string;
    acknowledged_by: string | null;
    acknowledged_at: string | null;
  } | null;
  checklist: ChecklistEntry[];
  allowed_next_statuses: TripStatus[];
}

export interface ChecklistEntry {
  item_key: string;
  label: string;
  state: "green" | "open" | "na";
  na_reason?: string | null;
  na_by?: string | null;
  na_at?: string | null;
}

export interface TaskItem {
  trip_id: string;
  trip_no: string;
  guest_id: string;
  guest_name: string | null;
  item_key: string;
  label: string;
  level: "red" | "amber";
  anchor: string | null;
  trip_status: TripStatus;
  department: string | null;
}

export interface NotificationItem {
  id: string;
  message: string;
  trip_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface Package {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
}
