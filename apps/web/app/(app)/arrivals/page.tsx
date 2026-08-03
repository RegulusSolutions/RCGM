"use client";

import { useEffect, useState } from "react";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { fmtD } from "@/lib/format";

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

export default function ArrivalsPage() {
  const [rows, setRows] = useState<HostArrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    apiFetch<HostArrival[]>(`/api/host/arrivals${params.toString() ? `?${params}` : ""}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHead title="Arrivals Preferences" subtitle="Guest preferences ahead of arrival — travel-confirmed and in-house guests only" />

      <Panel title="Filters">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">From date</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">To date</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button size="sm" onClick={load}>
            Apply
          </Button>
          {(dateFrom || dateTo) && (
            <Button
              size="sm"
              variant="outline"
              className="border-border"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setTimeout(load, 0);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Panel>

      <Panel title={`Guests${rows.length ? ` (${rows.length})` : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead>Hotel</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Dietary</TableHead>
              <TableHead>Beverage</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>VIP level</TableHead>
              <TableHead>Signboard name</TableHead>
              <TableHead>Hosting notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  No travel-confirmed or in-house guests for the selected range.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.trip_id}>
                <TableCell className="font-semibold">{r.guest_name}</TableCell>
                <TableCell>{fmtD(r.arrival_date)}</TableCell>
                <TableCell>{fmtD(r.departure_date)}</TableCell>
                <TableCell>{r.hotel_name ?? "—"}</TableCell>
                <TableCell>{r.room ?? "—"}</TableCell>
                <TableCell>{r.dietary ?? "—"}</TableCell>
                <TableCell>{r.beverage ?? "—"}</TableCell>
                <TableCell>{r.language ?? "—"}</TableCell>
                <TableCell>{r.vip_level ?? "—"}</TableCell>
                <TableCell>{r.signboard_name ?? "—"}</TableCell>
                <TableCell className="max-w-[280px] whitespace-normal">{r.hosting_notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
