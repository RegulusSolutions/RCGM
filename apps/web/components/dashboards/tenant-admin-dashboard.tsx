"use client";

import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { TripTable } from "@/components/trips/trip-table";
import { useApi } from "@/hooks/use-api";
import type { Page, TripSummary } from "@/lib/types";

export function TenantAdminDashboard() {
  const { data: trips, loading } = useApi<Page<TripSummary>>("/api/trips?page_size=100");
  const items = trips?.items ?? [];
  const by = (s: string) => items.filter((t) => t.status === s).length;

  return (
    <div>
      <PageHead title="Dashboard" subtitle="Tenant-wide overview — master data, users, and trip volume" />
      <StatRow>
        <StatCard value={loading ? "…" : items.length} label="Active Trips" />
        <StatCard value={loading ? "…" : by("SUBMITTED")} label="Awaiting Clearance" />
        <StatCard value={loading ? "…" : by("IN_HOUSE")} label="In-House" />
      </StatRow>
      <Panel title="Recent Trips">
        <TripTable trips={items.slice(0, 10)} columns={["agent", "clearance"]} />
      </Panel>
    </div>
  );
}
