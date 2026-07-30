"use client";

import { useRouter } from "next/navigation";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { fmtD } from "@/lib/format";
import type { TaskItem } from "@/lib/types";

export default function TasksPage() {
  const router = useRouter();
  const { data, loading } = useApi<{ items: TaskItem[]; total: number }>("/api/tasks");
  const items = data?.items ?? [];

  return (
    <div>
      <PageHead title="Open Tasks" subtitle="Dynamically computed from trip dates and tenant flag windows — never manually maintained" />
      <Panel title={loading ? "Loading…" : `${items.length} open task${items.length === 1 ? "" : "s"}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Urgency</TableHead>
              <TableHead>Trip</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Anchor</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No open tasks
                </TableCell>
              </TableRow>
            )}
            {items.map((t, i) => (
              <TableRow key={`${t.trip_id}-${t.item_key}-${i}`}>
                <TableCell>
                  <Pill tone={t.level === "red" ? "red" : "amber"}>{t.level.toUpperCase()}</Pill>
                </TableCell>
                <TableCell className="font-semibold">{t.trip_no}</TableCell>
                <TableCell>{t.guest_name ?? "—"}</TableCell>
                <TableCell>{t.label}</TableCell>
                <TableCell>{t.department ?? "—"}</TableCell>
                <TableCell>{t.anchor ? fmtD(t.anchor) : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="border-border" onClick={() => router.push(`/trips/${t.trip_id}`)}>
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
