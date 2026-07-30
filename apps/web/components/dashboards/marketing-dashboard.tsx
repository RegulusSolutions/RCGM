"use client";

import { useRouter } from "next/navigation";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/status-pill";
import { fmtD } from "@/lib/format";
import { useApi } from "@/hooks/use-api";
import type { Page, TripSummary } from "@/lib/types";

export function MarketingDashboard() {
  const router = useRouter();
  const { data: trips, loading } = useApi<Page<TripSummary>>("/api/trips?page_size=100");
  const items = trips?.items ?? [];
  const inProcess = ["SUBMITTED", "CLEARED", "BOOKING"];

  return (
    <div>
      <PageHead title="My Guests" subtitle="Trips originated by you" />
      <StatRow>
        <StatCard value={loading ? "…" : items.length} label="My Trips" />
        <StatCard value={loading ? "…" : items.filter((t) => t.status === "DRAFT").length} label="Drafts" />
        <StatCard value={loading ? "…" : items.filter((t) => t.status === "IN_HOUSE").length} label="In-House Now" />
        <StatCard
          value={loading ? "…" : items.filter((t) => inProcess.includes(t.status)).length}
          label="In Process"
        />
      </StatRow>
      <Panel
        title="My Trips"
        actions={
          <Button
            size="sm"
            className="font-bold text-[#15203A]"
            style={{ background: "linear-gradient(135deg,var(--rcgm-gold),var(--rcgm-gold2))" }}
            onClick={() => router.push("/guests/new")}
          >
            + New Guest Arrival
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No trips yet — create your first request
                </TableCell>
              </TableRow>
            )}
            {items.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.trip_no}</TableCell>
                <TableCell>
                  <div className="font-semibold">
                    {t.guest_name ?? "—"}
                    {t.companion_count > 0 && (
                      <span className="ml-1.5 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        +{t.companion_count}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{t.guest_membership_no}</div>
                </TableCell>
                <TableCell>{t.package_code ?? "—"}</TableCell>
                <TableCell>
                  {fmtD(t.arrival_date)} → {fmtD(t.departure_date)}
                </TableCell>
                <TableCell>
                  <StatusPill status={t.status} />
                </TableCell>
                <TableCell className="space-x-1.5 text-right whitespace-nowrap">
                  <Button size="sm" variant="outline" className="border-border" onClick={() => router.push(`/trips/${t.id}`)}>
                    Open
                  </Button>
                  {t.status === "DRAFT" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      onClick={() => router.push(`/guests/new?tripId=${t.id}`)}
                    >
                      Edit
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
