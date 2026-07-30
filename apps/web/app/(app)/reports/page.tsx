"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { TripStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/types";

type FilterKey = "date_from" | "date_to" | "status" | "payment_status" | "agent_id" | "group_id";

interface ReportDef {
  key: string;
  label: string;
  filters: FilterKey[];
}

const REPORTS: ReportDef[] = [
  { key: "arrivals-departures", label: "Arrivals & Departures", filters: ["date_from", "date_to", "status", "agent_id", "group_id"] },
  { key: "guests-visited", label: "Guests Visited", filters: ["date_from", "date_to"] },
  { key: "trip-expenses", label: "Trip Expenses", filters: ["date_from", "date_to"] },
  { key: "payment-status", label: "Payment Status", filters: ["payment_status"] },
  { key: "agent-performance", label: "Marketing-Agent Performance", filters: ["date_from", "date_to"] },
  { key: "cancellations", label: "Cancellations", filters: ["date_from", "date_to"] },
  { key: "no-shows", label: "No-Shows", filters: ["date_from", "date_to"] },
  { key: "audit", label: "Audit Report", filters: ["date_from", "date_to"] },
  { key: "active-trips", label: "Active Trips", filters: [] },
  { key: "open-tasks", label: "Open Tasks", filters: [] },
];

const TRIP_STATUSES = Object.keys(STATUS_META) as TripStatus[];
const PAYMENT_STATUSES = ["Pending", "Paid", "Partially Paid", "Outstanding"];

const FILTER_LABELS: Record<FilterKey, string> = {
  date_from: "From date",
  date_to: "To date",
  status: "Trip status",
  payment_status: "Payment status",
  agent_id: "Marketing agent",
  group_id: "Trip group",
};

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatCell(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function ReportsPage() {
  const [reportKey, setReportKey] = useState(REPORTS[0].key);
  const report = useMemo(() => REPORTS.find((r) => r.key === reportKey)!, [reportKey]);

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; group_no: string; name: string }[]>([]);

  useEffect(() => {
    apiFetch<{ id: string; name: string }[]>("/api/master-data/agents").then(setAgents).catch(() => setAgents([]));
    apiFetch<{ id: string; group_no: string; name: string }[]>("/api/groups").then(setGroups).catch(() => setGroups([]));
  }, []);

  function buildParams() {
    const params = new URLSearchParams();
    for (const f of report.filters) {
      const v = filters[f];
      if (v) params.set(f, v);
    }
    return params;
  }

  function run() {
    setLoading(true);
    const params = buildParams();
    apiFetch<Record<string, unknown>[]>(`/api/reports/${report.key}${params.toString() ? `?${params}` : ""}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setFilters({});
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const csvHref = `/api/reports/${report.key}/csv${buildParams().toString() ? `?${buildParams()}` : ""}`;

  return (
    <div>
      <PageHead title="Reports" subtitle="Live database records only — arrivals/departures, expenses, payment status, agent performance, and more" />

      <Panel title="Report">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Report</Label>
            <Select value={reportKey} onValueChange={(v) => v && setReportKey(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {report.filters.includes("date_from") && (
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">From date</Label>
              <Input type="date" value={filters.date_from ?? ""} onChange={(e) => setFilters((s) => ({ ...s, date_from: e.target.value }))} />
            </div>
          )}
          {report.filters.includes("date_to") && (
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">To date</Label>
              <Input type="date" value={filters.date_to ?? ""} onChange={(e) => setFilters((s) => ({ ...s, date_to: e.target.value }))} />
            </div>
          )}
          {report.filters.includes("status") && (
            <div className="w-44 space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">{FILTER_LABELS.status}</Label>
              <Select value={filters.status ?? ""} onValueChange={(v) => setFilters((s) => ({ ...s, status: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— any —" />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {report.filters.includes("payment_status") && (
            <div className="w-44 space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">{FILTER_LABELS.payment_status}</Label>
              <Select value={filters.payment_status ?? ""} onValueChange={(v) => setFilters((s) => ({ ...s, payment_status: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— any —" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {report.filters.includes("agent_id") && (
            <div className="w-48 space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">{FILTER_LABELS.agent_id}</Label>
              <Select value={filters.agent_id ?? ""} onValueChange={(v) => setFilters((s) => ({ ...s, agent_id: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— any —" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {report.filters.includes("group_id") && (
            <div className="w-48 space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">{FILTER_LABELS.group_id}</Label>
              <Select value={filters.group_id ?? ""} onValueChange={(v) => setFilters((s) => ({ ...s, group_id: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— any —" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.group_no} — {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? "Running…" : "Run report"}
          </Button>
          {rows.length === 0 ? (
            <Button size="sm" variant="outline" className="border-border" disabled>
              <Download className="size-3.5" /> Export CSV
            </Button>
          ) : (
            <a href={csvHref} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "border-border")}>
              <Download className="size-3.5" /> Export CSV
            </a>
          )}
          <Button size="sm" variant="outline" className="border-border" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </Panel>

      <Panel title={`${report.label}${rows.length ? ` — ${rows.length} row${rows.length === 1 ? "" : "s"}` : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c}>{humanize(c)}</TableHead>
              ))}
              {columns.length === 0 && <TableHead>Result</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={Math.max(columns.length, 1)} className="text-center text-muted-foreground">
                  Running report…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(columns.length, 1)} className="text-center text-muted-foreground">
                  No records for the selected filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c}>{formatCell(row[c])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
