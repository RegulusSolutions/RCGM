"use client";

import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { TripTable } from "@/components/trips/trip-table";
import { useApi } from "@/hooks/use-api";
import type { Page, TripSummary } from "@/lib/types";

export function ReservationsDashboard() {
  const { data: trips, loading } = useApi<Page<TripSummary>>("/api/trips?page_size=100");
  const items = trips?.items ?? [];

  return (
    <div>
      <PageHead title="Reservations Desk" subtitle="Only Cleared-to-Book trips are visible to this desk" />
      <StatRow>
        <StatCard value={loading ? "…" : items.length} label="Cleared Trips Visible" />
      </StatRow>
      <Panel title="Visible Trips">
        <TripTable trips={items} columns={["package"]} emptyMessage="No cleared trips" />
      </Panel>
    </div>
  );
}
