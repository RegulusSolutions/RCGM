"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtD } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { TripSummary, Page as ApiPage } from "@/lib/types";

interface TripGroup {
  id: string;
  group_no: string;
  name: string;
  date_from: string | null;
  date_to: string | null;
  notes: string | null;
  member_count: number;
}

interface GroupMember {
  id: string;
  trip_no: string;
  guest_name: string | null;
  status: TripSummary["status"];
  arrival_date: string;
  departure_date: string;
}

interface GroupDetail extends TripGroup {
  members: GroupMember[];
}

export default function GroupsPage() {
  const { user } = useSession();
  const canManage = user?.role === "COORDINATOR";

  const [groups, setGroups] = useState<TripGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", date_from: "", date_to: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const [ungrouped, setUngrouped] = useState<TripSummary[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState<string | null>(null);

  function loadGroups() {
    setLoading(true);
    apiFetch<TripGroup[]>("/api/groups")
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }

  useEffect(loadGroups, []);

  function loadDetail(id: string) {
    setDetailLoading(true);
    apiFetch<GroupDetail>(`/api/groups/${id}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  useEffect(() => {
    if (!canManage || !selectedId) return;
    apiFetch<ApiPage<TripSummary>>("/api/trips?page_size=100")
      .then((res) => setUngrouped(res.items.filter((t) => !t.group_id)))
      .catch(() => setUngrouped([]));
  }, [canManage, selectedId, detail]);

  const filteredUngrouped = ungrouped.filter((t) => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return true;
    return t.trip_no.toLowerCase().includes(q) || (t.guest_name ?? "").toLowerCase().includes(q);
  });

  async function createGroup() {
    if (!form.name.trim()) {
      toast.error("Group name is required.");
      return;
    }
    setSaving(true);
    try {
      const group = await apiFetch<TripGroup>("/api/groups", {
        method: "POST",
        json: {
          name: form.name.trim(),
          date_from: form.date_from || null,
          date_to: form.date_to || null,
          notes: form.notes || null,
        },
      });
      toast.success(`Group ${group.group_no} created`);
      setCreateOpen(false);
      setForm({ name: "", date_from: "", date_to: "", notes: "" });
      loadGroups();
      setSelectedId(group.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create group.");
    } finally {
      setSaving(false);
    }
  }

  async function assignTrip(tripId: string) {
    if (!selectedId) return;
    setAssigning(tripId);
    try {
      await apiFetch(`/api/groups/${selectedId}/assign/${tripId}`, { method: "POST" });
      toast.success("Trip assigned to group");
      loadDetail(selectedId);
      loadGroups();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to assign trip.");
    } finally {
      setAssigning(null);
    }
  }

  async function unassignTrip(tripId: string) {
    setUnassigning(tripId);
    try {
      await apiFetch(`/api/groups/unassign/${tripId}`, { method: "POST" });
      toast.success("Trip removed from group");
      if (selectedId) loadDetail(selectedId);
      loadGroups();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove trip.");
    } finally {
      setUnassigning(null);
    }
  }

  return (
    <div>
      <PageHead
        title="Trip Groups"
        subtitle="Batch guests travelling together for shared costs and transport"
        actions={canManage ? <Button onClick={() => setCreateOpen(true)}>+ New group</Button> : undefined}
      />

      <Panel title="Groups">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Date range</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No trip groups yet.
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <TableRow key={g.id} className={g.id === selectedId ? "bg-muted/40" : undefined} onClick={() => setSelectedId(g.id)}>
                <TableCell className="cursor-pointer font-semibold">{g.group_no}</TableCell>
                <TableCell className="cursor-pointer">{g.name}</TableCell>
                <TableCell className="cursor-pointer">
                  {g.date_from ? fmtD(g.date_from) : "—"} — {g.date_to ? fmtD(g.date_to) : "—"}
                </TableCell>
                <TableCell className="cursor-pointer">{g.member_count}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="border-border" onClick={() => setSelectedId(g.id)}>
                    {g.id === selectedId ? "Selected" : "View"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      {selectedId && (
        <Panel title={detail ? `${detail.group_no} — ${detail.name}` : "Group"}>
          {detailLoading && <p className="text-center text-[13px] text-muted-foreground">Loading…</p>}
          {!detailLoading && detail && (
            <>
              {detail.notes && <p className="mb-3.5 text-[13px] text-muted-foreground">{detail.notes}</p>}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trip No</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Arrival</TableHead>
                    <TableHead>Departure</TableHead>
                    {canManage && <TableHead className="text-right"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                        No trips assigned to this group yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {detail.members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-semibold">{m.trip_no}</TableCell>
                      <TableCell>{m.guest_name ?? "—"}</TableCell>
                      <TableCell>
                        <StatusPill status={m.status} />
                      </TableCell>
                      <TableCell>{fmtD(m.arrival_date)}</TableCell>
                      <TableCell>{fmtD(m.departure_date)}</TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-border"
                            disabled={unassigning === m.id}
                            onClick={() => unassignTrip(m.id)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {canManage && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-xs font-normal text-muted-foreground">Assign an ungrouped trip</Label>
                    <Input
                      placeholder="Search trip no or guest…"
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      className="w-64"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                    <Table>
                      <TableBody>
                        {filteredUngrouped.length === 0 && (
                          <TableRow>
                            <TableCell className="text-center text-muted-foreground">No eligible ungrouped trips.</TableCell>
                          </TableRow>
                        )}
                        {filteredUngrouped.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-semibold">{t.trip_no}</TableCell>
                            <TableCell>{t.guest_name ?? "—"}</TableCell>
                            <TableCell>{fmtD(t.arrival_date)}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" disabled={assigning === t.id} onClick={() => assignTrip(t.id)}>
                                {assigning === t.id ? "Assigning…" : "Assign"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New trip group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Group name *</Label>
              <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date from</Label>
                <Input type="date" value={form.date_from} onChange={(e) => setForm((s) => ({ ...s, date_from: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Date to</Label>
                <Input type="date" value={form.date_to} onChange={(e) => setForm((s) => ({ ...s, date_to: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={createGroup}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
