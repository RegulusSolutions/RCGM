"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import type { TripSummary, Page as ApiPage } from "@/lib/types";

interface TransportLeg {
  id: string;
  leg_type: string;
  scheduled_at: string;
  source: string;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_mobile: string | null;
  vendor_name: string | null;
  vendor_vehicle_type: string | null;
  is_assigned: boolean;
  completed_at: string | null;
  is_cancelled: boolean;
}

interface RunSheetRow {
  key: string;
  legType: "Arrival Pickup" | "Departure Drop";
  tripNo: string;
  guestName: string | null;
  scheduledAt: string | null;
  who: string;
  status: "Not yet assigned" | "Assigned" | "Completed" | "Cancelled";
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const INACTIVE_STATUSES = new Set(["DRAFT", "CANCELLED", "NO_SHOW"]);

function runSheetRow(trip: TripSummary, legType: "Arrival Pickup" | "Departure Drop", leg: TransportLeg | undefined): RunSheetRow {
  let who = "—";
  let status: RunSheetRow["status"] = "Not yet assigned";
  if (leg) {
    who = leg.source === "inhouse" ? [leg.vehicle_no, leg.driver_name].filter(Boolean).join(" — ") || "—" : leg.vendor_name ?? "—";
    status = leg.is_cancelled ? "Cancelled" : leg.completed_at ? "Completed" : leg.is_assigned ? "Assigned" : "Not yet assigned";
  }
  return {
    key: `${trip.id}-${legType}`,
    legType,
    tripNo: trip.trip_no,
    guestName: trip.guest_name,
    scheduledAt: leg?.scheduled_at ?? null,
    who,
    status,
  };
}

export default function BoardPage() {
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RunSheetRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiFetch<ApiPage<TripSummary>>("/api/trips?page_size=100")
      .then(async (res) => {
        const candidates = res.items.filter(
          (t) => !INACTIVE_STATUSES.has(t.status) && (t.arrival_date === date || t.departure_date === date)
        );

        const built: RunSheetRow[] = [];
        for (const trip of candidates) {
          let legs: TransportLeg[] = [];
          try {
            legs = await apiFetch<TransportLeg[]>(`/api/transport/legs?trip_id=${trip.id}`);
          } catch {
            legs = [];
          }

          if (trip.arrival_date === date) {
            built.push(runSheetRow(trip, "Arrival Pickup", legs.find((l) => l.leg_type === "Arrival Pickup")));
          }
          if (trip.departure_date === date) {
            built.push(runSheetRow(trip, "Departure Drop", legs.find((l) => l.leg_type === "Departure Drop")));
          }
        }

        built.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
        if (!cancelled) setRows(built);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  const statusTone = useMemo(
    () => ({
      "Not yet assigned": "amber" as const,
      Assigned: "blue" as const,
      Completed: "green" as const,
      Cancelled: "red" as const,
    }),
    []
  );

  return (
    <div>
      <PageHead title="Run Sheet / Board" subtitle="Live arrival pickups and departure drops for the selected day" />

      <Panel title="Date">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <Button size="sm" variant="outline" className="border-border" onClick={() => setDate(todayStr())}>
            Today
          </Button>
        </div>
      </Panel>

      <Panel title={`Run sheet${rows.length ? ` (${rows.length})` : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Movement</TableHead>
              <TableHead>Trip No</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Vehicle / Vendor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No arrivals or departures on this date.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="whitespace-nowrap">{r.scheduledAt ? fmtDT(r.scheduledAt) : "—"}</TableCell>
                <TableCell>{r.legType}</TableCell>
                <TableCell className="font-semibold">{r.tripNo}</TableCell>
                <TableCell>{r.guestName ?? "—"}</TableCell>
                <TableCell>{r.who}</TableCell>
                <TableCell>
                  <Pill tone={statusTone[r.status]}>{r.status}</Pill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
