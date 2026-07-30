"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

type FieldType = "text" | "number" | "checkbox" | "driver-select" | "list";

interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
}

interface CatalogDef {
  key: string;
  label: string;
  addLabel: string;
  fields: FieldDef[];
  columns: { key: string; label: string }[];
}

const CATALOGS: CatalogDef[] = [
  {
    key: "hotels",
    label: "Hotels",
    addLabel: "Add hotel",
    fields: [
      { name: "name", label: "Hotel name", type: "text", required: true },
      { name: "location", label: "Location", type: "text" },
      { name: "room_types", label: "Room types (comma-separated)", type: "list" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "location", label: "Location" },
      { key: "room_types", label: "Room types" },
    ],
  },
  {
    key: "airlines",
    label: "Airlines",
    addLabel: "Add airline",
    fields: [
      { name: "name", label: "Airline name", type: "text", required: true },
      { name: "travel_classes", label: "Travel classes (comma-separated)", type: "list" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "travel_classes", label: "Travel classes" },
    ],
  },
  {
    key: "drivers",
    label: "Drivers",
    addLabel: "Add driver",
    fields: [
      { name: "name", label: "Driver name", type: "text", required: true },
      { name: "mobile", label: "Mobile", type: "text" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "mobile", label: "Mobile" },
    ],
  },
  {
    key: "vehicles",
    label: "In-house Fleet",
    addLabel: "Add vehicle",
    fields: [
      { name: "vehicle_no", label: "Vehicle no.", type: "text", required: true },
      { name: "vehicle_type", label: "Vehicle type", type: "text", required: true, placeholder: "Sedan / Van / SUV" },
      { name: "capacity", label: "Capacity (pax)", type: "number" },
      { name: "driver_id", label: "Assigned driver", type: "driver-select" },
    ],
    columns: [
      { key: "vehicle_no", label: "Vehicle no." },
      { key: "vehicle_type", label: "Type" },
      { key: "capacity", label: "Capacity" },
      { key: "driver_id", label: "Driver" },
    ],
  },
  {
    key: "vendors",
    label: "Transport Vendors",
    addLabel: "Add vendor",
    fields: [
      { name: "name", label: "Vendor name", type: "text", required: true },
      { name: "contact", label: "Contact", type: "text" },
      { name: "vehicle_types_offered", label: "Vehicle types offered", type: "text" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "contact", label: "Contact" },
      { key: "vehicle_types_offered", label: "Vehicle types" },
    ],
  },
  {
    key: "packages",
    label: "Package Codes",
    addLabel: "Add package",
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "label", label: "Label", type: "text", required: true },
    ],
    columns: [
      { key: "code", label: "Code" },
      { key: "label", label: "Label" },
    ],
  },
  {
    key: "agents",
    label: "Marketing Agents",
    addLabel: "Add agent",
    fields: [
      { name: "name", label: "Agent name", type: "text", required: true },
      { name: "market", label: "Market", type: "text" },
      { name: "mobile", label: "Mobile", type: "text" },
      { name: "email", label: "Email", type: "text" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "market", label: "Market" },
      { key: "mobile", label: "Mobile" },
      { key: "email", label: "Email" },
    ],
  },
  {
    key: "currencies",
    label: "Currencies",
    addLabel: "Add currency",
    fields: [
      { name: "code", label: "Currency code", type: "text", required: true, placeholder: "USD" },
      { name: "name", label: "Currency name", type: "text" },
      { name: "is_base", label: "Base currency", type: "checkbox" },
    ],
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "is_base", label: "Base" },
    ],
  },
  {
    key: "visa-fees",
    label: "Visa Fee Guide",
    addLabel: "Add fee entry",
    fields: [
      { name: "nationality_group", label: "Nationality group", type: "text", required: true },
      { name: "fee_usd", label: "Fee (USD)", type: "number", required: true },
      { name: "notes", label: "Notes", type: "text" },
    ],
    columns: [
      { key: "nationality_group", label: "Nationality group" },
      { key: "fee_usd", label: "Fee (USD)" },
      { key: "notes", label: "Notes" },
    ],
  },
];

type CatalogRow = Record<string, unknown> & { id: string; is_active: boolean };

export default function MasterDataPage() {
  const { user } = useSession();
  const canWrite = user?.role === "TENANT_ADMIN";
  const isMarketing = user?.role === "MARKETING";
  const visibleCatalogs = isMarketing ? CATALOGS.filter((c) => c.key === "packages") : CATALOGS;

  const [active, setActive] = useState(visibleCatalogs[0].key);
  const catalog = useMemo(() => visibleCatalogs.find((c) => c.key === active)!, [active, visibleCatalogs]);

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [drivers, setDrivers] = useState<CatalogRow[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<CatalogRow[]>(`/api/master-data/${catalog.key}`);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.key]);

  useEffect(() => {
    if (catalog.key !== "vehicles") return;
    apiFetch<CatalogRow[]>("/api/master-data/drivers")
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, [catalog.key]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return catalog.columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q));
  });

  function openAdd() {
    const blank: Record<string, string | boolean> = {};
    for (const f of catalog.fields) blank[f.name] = f.type === "checkbox" ? false : "";
    setForm(blank);
    setAddOpen(true);
  }

  async function submitAdd() {
    const missing = catalog.fields.filter((f) => f.required && !String(form[f.name] ?? "").trim());
    if (missing.length) {
      toast.error(`Required: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of catalog.fields) {
        const v = form[f.name];
        if (f.type === "number") payload[f.name] = v === "" ? undefined : Number(v);
        else if (f.type === "checkbox") payload[f.name] = !!v;
        else if (f.type === "list")
          payload[f.name] = String(v ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        else payload[f.name] = v === "" ? undefined : v;
      }
      await apiFetch(`/api/master-data/${catalog.key}`, { method: "POST", json: payload });
      toast.success(`${catalog.addLabel} — saved`);
      setAddOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save entry.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: CatalogRow) {
    try {
      await apiFetch(`/api/master-data/${catalog.key}/${row.id}/toggle-active`, { method: "POST" });
      toast.success(row.is_active ? "Deactivated" : "Reactivated");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update entry.");
    }
  }

  function driverName(id: unknown) {
    if (!id) return "—";
    return drivers.find((d) => d.id === id)?.name as string | undefined ?? "—";
  }

  return (
    <div>
      <PageHead
        title="Master Data"
        subtitle="Hotels, airlines, fleet, vendors, packages, agents, currencies, visa fee guide"
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {visibleCatalogs.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={
              "rounded-lg border px-2.5 py-1 text-[12.5px] font-medium transition-colors " +
              (c.key === active
                ? "border-[var(--rcgm-gold-soft)] bg-[var(--rcgm-gold-soft)]/10 text-[var(--rcgm-gold-soft)]"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <Panel
        title={catalog.label}
        actions={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48"
            />
            {canWrite && (
              <Button size="sm" onClick={openAdd}>
                + {catalog.addLabel}
              </Button>
            )}
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              {catalog.columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              {canWrite && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={catalog.columns.length + 2} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={catalog.columns.length + 2} className="text-center text-muted-foreground">
                  No entries found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow key={row.id}>
                {catalog.columns.map((c) => (
                  <TableCell key={c.key}>
                    {c.key === "driver_id"
                      ? driverName(row[c.key])
                      : c.key === "is_base"
                        ? row[c.key]
                          ? "Yes"
                          : "No"
                        : Array.isArray(row[c.key])
                          ? (row[c.key] as unknown[]).join(", ") || "—"
                          : String(row[c.key] ?? "—") || "—"}
                  </TableCell>
                ))}
                <TableCell>
                  <Badge variant={row.is_active ? "secondary" : "outline"}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-border"
                      disabled={catalog.key === "currencies" && !!row.is_base}
                      onClick={() => toggleActive(row)}
                    >
                      {row.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{catalog.addLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {catalog.fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label>
                  {f.label} {f.required && "*"}
                </Label>
                {f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={!!form[f.name]}
                      onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.checked }))}
                    />
                    Yes
                  </label>
                ) : f.type === "driver-select" ? (
                  <Select
                    value={String(form[f.name] ?? "")}
                    onValueChange={(v) => v && setForm((s) => ({ ...s, [f.name]: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="— unassigned —" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {String(d.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    placeholder={f.placeholder}
                    value={String(form[f.name] ?? "")}
                    onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={submitAdd}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
