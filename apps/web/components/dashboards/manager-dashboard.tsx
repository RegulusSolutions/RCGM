"use client";

import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { TripTable } from "@/components/trips/trip-table";
import { useApi } from "@/hooks/use-api";
import type { Page, TripSummary } from "@/lib/types";

export function ManagerDashboard() {
  const { data: trips, loading } = useApi<Page<TripSummary>>("/api/trips?page_size=100");
  const items = trips?.items ?? [];
  const by = (s: string) => items.filter((t) => t.status === s).length;

  return (
    <div>
      <PageHead title="Manager View" subtitle="Read-only oversight across all trips (view-mode)" />
      <StatRow>
        <StatCard value={loading ? "…" : items.length} label="Active Trips" />
        <StatCard value={loading ? "…" : by("IN_HOUSE")} label="In-House" />
        <StatCard value={loading ? "…" : by("COMPLETED")} label="Completed" />
        <StatCard value={loading ? "…" : by("CANCELLED") + by("NO_SHOW")} label="Cancelled / No-Show" />
      </StatRow>
      <Panel title="All Trips">
        <TripTable trips={items} columns={["agent", "clearance"]} />
      </Panel>
    </div>
  );
}
