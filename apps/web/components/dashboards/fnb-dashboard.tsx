"use client";

import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtD } from "@/lib/format";
import { useApi } from "@/hooks/use-api";

interface HostArrival {
  trip_id: string;
  guest_name: string;
  arrival_date: string;
  departure_date: string;
  hotel_name: string | null;
  dietary: string | null;
  beverage: string | null;
  room: string | null;
  language: string | null;
  vip_level: string | null;
  signboard_name: string | null;
  hosting_notes: string | null;
}

export function FnbDashboard() {
  const { data: arrivals, loading } = useApi<HostArrival[]>("/api/host/arrivals");
  const items = arrivals ?? [];

  return (
    <div>
      <PageHead title="Host Desk" subtitle="Arrival preferences only — no costs, no compliance data" />
      <StatRow>
        <StatCard value={loading ? "…" : items.length} label="Guests In-House / Confirmed" />
      </StatRow>
      <Panel title="Arrivals">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Hotel</TableHead>
              <TableHead>Dietary</TableHead>
              <TableHead>Beverage</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Signboard</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No arrivals
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a.trip_id}>
                <TableCell className="font-semibold">{a.guest_name}</TableCell>
                <TableCell>
                  {fmtD(a.arrival_date)} → {fmtD(a.departure_date)}
                </TableCell>
                <TableCell>{a.hotel_name ?? "—"}</TableCell>
                <TableCell>{a.dietary ?? "—"}</TableCell>
                <TableCell>{a.beverage ?? "—"}</TableCell>
                <TableCell>{a.room ?? "—"}</TableCell>
                <TableCell>{a.signboard_name ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
