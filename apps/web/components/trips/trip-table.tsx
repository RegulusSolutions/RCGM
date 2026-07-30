"use client";

import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pill, StatusPill } from "@/components/status-pill";
import { fmtD } from "@/lib/format";
import type { TripSummary } from "@/lib/types";

export function TripTable({
  trips,
  columns,
  emptyMessage = "No trips",
}: {
  trips: TripSummary[];
  columns: Array<"agent" | "package" | "clearance">;
  emptyMessage?: string;
}) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Trip</TableHead>
          <TableHead>Guest</TableHead>
          {columns.includes("agent") && <TableHead>Agent</TableHead>}
          {columns.includes("package") && <TableHead>Package</TableHead>}
          <TableHead>Dates</TableHead>
          {columns.includes("clearance") && <TableHead>Clearance</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="text-right"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trips.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
        {trips.map((t) => (
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
            {columns.includes("agent") && <TableCell>{t.agent_name ?? "—"}</TableCell>}
            {columns.includes("package") && <TableCell>{t.package_code ?? "—"}</TableCell>}
            <TableCell>
              {fmtD(t.arrival_date)} → {fmtD(t.departure_date)}
            </TableCell>
            {columns.includes("clearance") && (
              <TableCell>
                {t.is_cleared ? <Pill tone="green">✓ Cleared</Pill> : <Pill tone="amber">Pending</Pill>}
              </TableCell>
            )}
            <TableCell>
              <StatusPill status={t.status} />
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" className="border-border" onClick={() => router.push(`/trips/${t.id}`)}>
                Open
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
