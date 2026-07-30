"use client";

import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { TripTable } from "@/components/trips/trip-table";
import { useApi } from "@/hooks/use-api";
import type { Page, TripSummary } from "@/lib/types";

export function TransportDashboard() {
  const { data: trips, loading } = useApi<Page<TripSummary>>("/api/trips?page_size=100");
  const items = trips?.items ?? [];

  return (
    <div>
      <PageHead title="Dispatch Desk" subtitle="Movement data only — no costs, no documents" />
      <StatRow>
        <StatCard value={loading ? "…" : items.length} label="Cleared Trips Visible" />
      </StatRow>
      <Panel title="Trips Requiring Transport">
        <TripTable trips={items} columns={[]} emptyMessage="No cleared trips" />
      </Panel>
      <div className="rounded-[10px] border border-dashed border-border p-6 text-center text-muted-foreground">
        <div className="mb-1.5 text-[15px] text-[var(--rcgm-gold-soft)]">Coming next</div>
        Per-leg dispatch board (pickup/drop, vehicle assignment, complete) — /api/transport/legs is already live.
      </div>
    </div>
  );
}
