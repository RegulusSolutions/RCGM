"use client";

import { useRouter } from "next/navigation";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { TripTable } from "@/components/trips/trip-table";
import { useApi } from "@/hooks/use-api";
import type { Page, TaskItem, TripSummary } from "@/lib/types";

export function CoordinatorDashboard() {
  const router = useRouter();
  const { data: trips, loading } = useApi<Page<TripSummary>>("/api/trips?page_size=100");
  const { data: tasks } = useApi<{ items: TaskItem[]; total: number }>("/api/tasks");

  const items = trips?.items ?? [];
  const by = (s: string) => items.filter((t) => t.status === s).length;
  const hasRed = (tasks?.items ?? []).some((t) => t.level === "red");

  return (
    <div>
      <PageHead title="Control Desk" subtitle="All trips, all departments — one record of truth" />
      <StatRow>
        <StatCard value={loading ? "…" : items.length} label="Active Trips" />
        <StatCard value={loading ? "…" : by("SUBMITTED")} label="Awaiting Clearance" />
        <StatCard value={loading ? "…" : by("BOOKING")} label="Booking in Progress" />
        <StatCard value={loading ? "…" : by("IN_HOUSE")} label="In-House" />
        <StatCard
          value={tasks?.total ?? "…"}
          label="Open Tasks ⚑"
          danger={hasRed}
          onClick={() => router.push("/tasks")}
        />
      </StatRow>
      <Panel title="Trips">
        <TripTable trips={items} columns={["agent", "clearance"]} />
      </Panel>
    </div>
  );
}
