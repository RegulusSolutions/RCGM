"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";

interface Tenant {
  id: string;
  code: string;
  name: string;
  location: string | null;
  is_active: boolean;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiFetch<Tenant[]>("/api/tenants")
      .then(setTenants)
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = tenants.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || (t.location ?? "").toLowerCase().includes(q);
  });

  async function createTenant() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/tenants", {
        method: "POST",
        json: { code: form.code.trim(), name: form.name.trim(), location: form.location.trim() || null },
      });
      toast.success(`Tenant ${form.code.trim().toUpperCase()} created`);
      setAddOpen(false);
      setForm({ code: "", name: "", location: "" });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create tenant.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: Tenant) {
    setTogglingId(t.id);
    try {
      await apiFetch(`/api/tenants/${t.id}/toggle-active`, { method: "POST" });
      toast.success(t.is_active ? `${t.name} deactivated` : `${t.name} reactivated`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update tenant.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div>
      <PageHead title="Tenants" subtitle="Super Admin tenant management" actions={<Button onClick={() => setAddOpen(true)}>+ New tenant</Button>} />

      <Panel
        title="Tenants"
        actions={
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
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
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No tenants found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.code}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.location ?? "—"}</TableCell>
                <TableCell>{t.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="red">Inactive</Pill>}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-border"
                    disabled={togglingId === t.id}
                    onClick={() => toggleActive(t)}
                  >
                    {t.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input
                placeholder="e.g. RCGM"
                value={form.code}
                onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={createTenant}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
