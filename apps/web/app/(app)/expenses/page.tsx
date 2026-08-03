"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { TripSummary, Page as ApiPage } from "@/lib/types";

interface ExpenseItem {
  category: string;
  description: string | null;
  currency: string;
  amount: number | null;
  lkr_equivalent: number;
  payment_status: string | null;
  is_shared_group: boolean;
}

interface ExpenseSummary {
  id: string;
  trip_id: string;
  version: number;
  is_current: boolean;
  is_stale: boolean;
  generated_at: string;
  flight_total_lkr: number;
  hotel_total_lkr: number;
  transport_total_lkr: number;
  visa_total_lkr: number;
  grand_total_lkr: number;
  outstanding_total_lkr: number;
  items: ExpenseItem[];
}

interface HistoryEntry {
  id: string;
  version: number;
  is_current: boolean;
  generated_at: string;
  grand_total_lkr: number;
}

function fmtLkr(v: number) {
  return `LKR ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ExpensesPage() {
  const { user } = useSession();
  const canManage = user?.role === "COORDINATOR";

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setTripsLoading(true);
    apiFetch<ApiPage<TripSummary>>("/api/trips?page_size=100")
      .then((res) => setTrips(res.items))
      .catch(() => setTrips([]))
      .finally(() => setTripsLoading(false));
  }, []);

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => t.trip_no.toLowerCase().includes(q) || (t.guest_name ?? "").toLowerCase().includes(q));
  }, [trips, search]);

  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? null;

  function loadSummary(tripId: string) {
    setSummaryLoading(true);
    Promise.all([
      apiFetch<ExpenseSummary | null>(`/api/expenses/trips/${tripId}`),
      apiFetch<HistoryEntry[]>(`/api/expenses/trips/${tripId}/history`),
    ])
      .then(([s, h]) => {
        setSummary(s);
        setHistory(h);
      })
      .catch(() => {
        setSummary(null);
        setHistory([]);
      })
      .finally(() => setSummaryLoading(false));
  }

  useEffect(() => {
    if (selectedTripId) loadSummary(selectedTripId);
    else {
      setSummary(null);
      setHistory([]);
    }
  }, [selectedTripId]);

  async function generate() {
    if (!selectedTripId) return;
    setGenerating(true);
    try {
      await apiFetch(`/api/expenses/trips/${selectedTripId}/generate`, { method: "POST" });
      toast.success("Expense summary generated");
      loadSummary(selectedTripId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate expense summary.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <PageHead title="Expense Summaries" subtitle="Versioned per-trip expense summaries with staleness detection" />

      <Panel
        title="Select trip"
        actions={
          <Input placeholder="Search by trip no or guest…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip No</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tripsLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!tripsLoading && filteredTrips.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No trips found.
                </TableCell>
              </TableRow>
            )}
            {filteredTrips.map((t) => (
              <TableRow key={t.id} className={t.id === selectedTripId ? "bg-muted/40" : undefined} onClick={() => setSelectedTripId(t.id)}>
                <TableCell className="cursor-pointer font-semibold">{t.trip_no}</TableCell>
                <TableCell className="cursor-pointer">{t.guest_name ?? "—"}</TableCell>
                <TableCell className="cursor-pointer text-muted-foreground">{t.status}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="border-border" onClick={() => setSelectedTripId(t.id)}>
                    {t.id === selectedTripId ? "Selected" : "Select"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        title={selectedTrip ? `Expense Summary — ${selectedTrip.trip_no}` : "Expense Summary"}
        actions={
          canManage && selectedTripId ? (
            <Button size="sm" onClick={generate} disabled={generating}>
              <RefreshCw className="size-3.5" /> {generating ? "Generating…" : summary ? "Regenerate" : "Generate summary"}
            </Button>
          ) : undefined
        }
      >
        {!selectedTripId && <p className="text-center text-[13px] text-muted-foreground">Select a trip above to view its expense summary.</p>}

        {selectedTripId && summaryLoading && <p className="text-center text-[13px] text-muted-foreground">Loading…</p>}

        {selectedTripId && !summaryLoading && !summary && (
          <p className="text-center text-[13px] text-muted-foreground">
            {canManage ? "No expense summary yet — generate one above." : "No expense summary has been generated for this trip."}
          </p>
        )}

        {selectedTripId && !summaryLoading && summary && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <Pill tone="gold">v{summary.version}</Pill>
              {summary.is_current && <Pill tone="green">Current</Pill>}
              {summary.is_stale && <Pill tone="red">Stale — bookings changed since generation</Pill>}
              <span className="text-[12.5px] text-muted-foreground">Generated {fmtDT(summary.generated_at)}</span>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Flight", value: summary.flight_total_lkr },
                { label: "Hotel", value: summary.hotel_total_lkr },
                { label: "Transport", value: summary.transport_total_lkr },
                { label: "Visa", value: summary.visa_total_lkr },
                { label: "Grand total", value: summary.grand_total_lkr },
                { label: "Outstanding", value: summary.outstanding_total_lkr },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-border bg-[var(--rcgm-navy3)] px-3 py-2.5">
                  <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{c.label}</div>
                  <div className="mt-0.5 text-[13px] font-semibold">{fmtLkr(c.value)}</div>
                </div>
              ))}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>LKR equivalent</TableHead>
                  <TableHead>Payment status</TableHead>
                  <TableHead>Shared</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No expense line items.
                    </TableCell>
                  </TableRow>
                )}
                {summary.items.map((i, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{i.category.replace(/_/g, " ")}</TableCell>
                    <TableCell>{i.description ?? "—"}</TableCell>
                    <TableCell>{i.amount != null ? `${i.currency} ${i.amount.toLocaleString()}` : "—"}</TableCell>
                    <TableCell>{fmtLkr(i.lkr_equivalent)}</TableCell>
                    <TableCell>{i.payment_status ?? "—"}</TableCell>
                    <TableCell>{i.is_shared_group ? <Pill tone="blue">Group — shared</Pill> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Panel>

      {selectedTripId && history.length > 0 && (
        <Panel title="Version history">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Grand total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-semibold">v{h.version}</TableCell>
                  <TableCell>{fmtDT(h.generated_at)}</TableCell>
                  <TableCell>{fmtLkr(h.grand_total_lkr)}</TableCell>
                  <TableCell>{h.is_current ? <Pill tone="green">Current</Pill> : <Pill tone="grey">Superseded</Pill>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
