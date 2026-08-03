"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Ban } from "lucide-react";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import { STATUS_META } from "@/lib/types";
import type { TripSummary, Page as ApiPage } from "@/lib/types";
import { useSession } from "@/lib/session";

interface GuestLink {
  id: string;
  trip_id: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  is_active: boolean;
  url?: string;
  token?: string;
}

function linkStatus(link: GuestLink): { label: string; tone: "green" | "red" | "grey" } {
  if (link.revoked_at) return { label: "Revoked", tone: "grey" };
  if (!link.is_active) return { label: "Expired", tone: "red" };
  return { label: "Active", tone: "green" };
}

export default function GuestLinksPage() {
  const { user } = useSession();
  const canManage = user?.role === "COORDINATOR";

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const [links, setLinks] = useState<GuestLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [justGeneratedUrl, setJustGeneratedUrl] = useState<string | null>(null);

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
    return trips.filter(
      (t) =>
        t.trip_no.toLowerCase().includes(q) ||
        (t.guest_name ?? "").toLowerCase().includes(q) ||
        (t.guest_membership_no ?? "").toLowerCase().includes(q)
    );
  }, [trips, search]);

  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? null;

  function loadLinks(tripId: string) {
    setLinksLoading(true);
    apiFetch<GuestLink[]>(`/api/guest-links/trips/${tripId}`)
      .then(setLinks)
      .catch(() => setLinks([]))
      .finally(() => setLinksLoading(false));
  }

  useEffect(() => {
    setJustGeneratedUrl(null);
    if (selectedTripId) loadLinks(selectedTripId);
    else setLinks([]);
  }, [selectedTripId]);

  async function generate() {
    if (!selectedTripId) return;
    setGenerating(true);
    try {
      const link = await apiFetch<GuestLink>(`/api/guest-links/trips/${selectedTripId}`, { method: "POST" });
      toast.success("Guest link generated");
      if (link.url) {
        const fullUrl = `${window.location.origin}${link.url}`;
        setJustGeneratedUrl(fullUrl);
        try {
          await navigator.clipboard.writeText(fullUrl);
        } catch {
          // clipboard access denied — the link is still shown below
        }
      }
      loadLinks(selectedTripId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate link.");
    } finally {
      setGenerating(false);
    }
  }

  async function revoke(linkId: string) {
    if (!selectedTripId) return;
    setRevokingId(linkId);
    try {
      await apiFetch(`/api/guest-links/${linkId}/revoke`, { method: "POST" });
      toast.success("Guest link revoked");
      loadLinks(selectedTripId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke link.");
    } finally {
      setRevokingId(null);
    }
  }

  async function copyUrl(url: string) {
    const fullUrl = `${window.location.origin}${url}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't access the clipboard — copy the link manually.");
    }
  }

  return (
    <div>
      <PageHead
        title="Guest Trip Links"
        subtitle={
          canManage
            ? "Generate and revoke shareable, time-limited itinerary links for guests"
            : "Shareable itinerary link status for your guests' trips"
        }
      />

      <Panel
        title="Select trip"
        actions={
          <Input
            placeholder="Search by trip no, guest name or membership no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip No</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tripsLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!tripsLoading && filteredTrips.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No trips found.
                </TableCell>
              </TableRow>
            )}
            {filteredTrips.map((t) => (
              <TableRow
                key={t.id}
                className={t.id === selectedTripId ? "bg-muted/40" : undefined}
                onClick={() => setSelectedTripId(t.id)}
              >
                <TableCell className="cursor-pointer font-semibold">{t.trip_no}</TableCell>
                <TableCell className="cursor-pointer">{t.guest_name ?? "—"}</TableCell>
                <TableCell className="cursor-pointer">
                  <Pill tone={STATUS_META[t.status]?.pill ?? "grey"}>{STATUS_META[t.status]?.label ?? t.status}</Pill>
                </TableCell>
                <TableCell className="cursor-pointer">{fmtDT(t.arrival_date)}</TableCell>
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
        title={selectedTrip ? `Guest link — ${selectedTrip.trip_no}` : "Guest link"}
        actions={
          canManage && selectedTripId ? (
            <Button size="sm" onClick={generate} disabled={generating}>
              <KeyRound className="size-3.5" /> {generating ? "Generating…" : "Generate new link"}
            </Button>
          ) : undefined
        }
      >
        {!selectedTripId && <p className="text-center text-[13px] text-muted-foreground">Select a trip above to view its guest link.</p>}

        {justGeneratedUrl && (
          <div className="mb-3.5 flex items-center justify-between gap-3 rounded-[10px] border border-[var(--rcgm-gold-soft)]/40 bg-[var(--rcgm-gold-soft)]/10 px-3.5 py-2.5 text-[13px]">
            <span className="truncate">
              New link — copied to clipboard: <span className="font-mono text-[12px]">{justGeneratedUrl}</span>
            </span>
            <Button size="sm" variant="outline" className="shrink-0 border-border" onClick={() => copyUrl(new URL(justGeneratedUrl).pathname)}>
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>
        )}

        {selectedTripId && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last accessed</TableHead>
                <TableHead>Accesses</TableHead>
                {canManage && <TableHead className="text-right"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linksLoading && (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!linksLoading && links.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                    {canManage ? "No guest link yet — generate one above." : "No guest link has been generated for this trip."}
                  </TableCell>
                </TableRow>
              )}
              {links.map((l) => {
                const status = linkStatus(l);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </TableCell>
                    <TableCell>{fmtDT(l.created_at)}</TableCell>
                    <TableCell>{fmtDT(l.expires_at)}</TableCell>
                    <TableCell>{fmtDT(l.last_accessed_at)}</TableCell>
                    <TableCell>{l.access_count}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {l.url && (
                            <Button size="sm" variant="outline" className="border-border" onClick={() => copyUrl(l.url!)}>
                              <Copy className="size-3.5" /> Copy
                            </Button>
                          )}
                          {status.label === "Active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border"
                              disabled={revokingId === l.id}
                              onClick={() => revoke(l.id)}
                            >
                              <Ban className="size-3.5" /> Revoke
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
