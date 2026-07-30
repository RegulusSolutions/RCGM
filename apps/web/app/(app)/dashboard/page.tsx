"use client";

import { useSession } from "@/lib/session";
import { CoordinatorDashboard } from "@/components/dashboards/coordinator-dashboard";
import { MarketingDashboard } from "@/components/dashboards/marketing-dashboard";
import { ReservationsDashboard } from "@/components/dashboards/reservations-dashboard";
import { TransportDashboard } from "@/components/dashboards/transport-dashboard";
import { FnbDashboard } from "@/components/dashboards/fnb-dashboard";
import { ManagerDashboard } from "@/components/dashboards/manager-dashboard";
import { TenantAdminDashboard } from "@/components/dashboards/tenant-admin-dashboard";
import { SuperAdminDashboard } from "@/components/dashboards/super-admin-dashboard";

export default function DashboardPage() {
  const { user } = useSession();
  if (!user) return null;

  switch (user.role) {
    case "SUPER_ADMIN":
      return <SuperAdminDashboard />;
    case "TENANT_ADMIN":
      return <TenantAdminDashboard />;
    case "MARKETING":
      return <MarketingDashboard />;
    case "COORDINATOR":
      return <CoordinatorDashboard />;
    case "RESERVATIONS":
      return <ReservationsDashboard />;
    case "TRANSPORT":
      return <TransportDashboard />;
    case "FNB_VIEW":
      return <FnbDashboard />;
    case "MANAGER":
      return <ManagerDashboard />;
    default:
      return null;
  }
}
