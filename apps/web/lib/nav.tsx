import type { UserRole } from "@/lib/types";
import {
  LayoutDashboard,
  Building2,
  ScrollText,
  Settings,
  Users,
  Stethoscope,
  BarChart3,
  UserPlus,
  Link2,
  UsersRound,
  Database,
  Flag,
  CalendarClock,
  Sigma,
  type LucideIcon,
} from "lucide-react";

export interface NavLeaf {
  kind: "link";
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  locked?: string;
}
export interface NavSection {
  kind: "section";
  label: string;
}
export type NavEntry = NavLeaf | NavSection;

const link = (id: string, label: string, href: string, icon: LucideIcon): NavLeaf => ({
  kind: "link",
  id,
  label,
  href,
  icon,
});

export const NAV: Record<UserRole, NavEntry[]> = {
  SUPER_ADMIN: [
    link("sa_dash", "Platform Dashboard", "/dashboard", LayoutDashboard),
    link("sa_tenants", "Tenants", "/tenants", Building2),
    link("audit", "Audit Log", "/audit", ScrollText),
  ],
  TENANT_ADMIN: [
    link("ta_dash", "Dashboard", "/dashboard", LayoutDashboard),
    link("ta_master", "Master Data", "/master-data", Database),
    link("ta_settings", "Settings & Flag Windows", "/settings", Settings),
    link("ta_users", "Users & Permissions", "/users", Users),
    link("audit", "Audit Log", "/audit", ScrollText),
    link("ta_diag", "Diagnostics", "/diagnostics", Stethoscope),
    link("reports", "Reports", "/reports", BarChart3),
  ],
  MARKETING: [
    link("ma_dash", "My Guests", "/dashboard", LayoutDashboard),
    link("ma_new", "New Guest Arrival", "/guests/new", UserPlus),
    link("ma_links", "Guest Trip Links", "/guest-links", Link2),
  ],
  COORDINATOR: [
    link("co_dash", "Control Desk", "/dashboard", LayoutDashboard),
    link("co_groups", "Trip Groups", "/groups", UsersRound),
    link("co_master", "Master Data (view)", "/master-data", Database),
    link("audit", "Audit Log", "/audit", ScrollText),
    link("co_tasks", "Open Tasks", "/tasks", Flag),
    link("board", "Arrivals Board", "/board", CalendarClock),
    link("co_expenses", "Expense Summaries", "/expenses", Sigma),
    link("reports", "Reports", "/reports", BarChart3),
  ],
  RESERVATIONS: [
    link("re_dash", "Reservations Desk", "/dashboard", LayoutDashboard),
    link("board", "Run Sheet / Board", "/board", CalendarClock),
  ],
  TRANSPORT: [
    link("tr_dash", "Dispatch Desk", "/dashboard", LayoutDashboard),
    link("board", "Run Sheet / Board", "/board", CalendarClock),
  ],
  FNB_VIEW: [
    link("fb_dash", "Host Desk", "/dashboard", LayoutDashboard),
    link("fb_arrivals", "Arrivals Preferences", "/arrivals", CalendarClock),
  ],
  MANAGER: [
    link("mg_dash", "Manager View", "/dashboard", LayoutDashboard),
    link("reports", "Reports", "/reports", BarChart3),
    link("audit", "Audit Log", "/audit", ScrollText),
  ],
};
