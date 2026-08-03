"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { TripDetail } from "@/lib/types";

const LEG_TYPES = ["Arrival Pickup", "Hotel–Casino Transfer", "Departure Drop", "Other"];
const USAGE_TYPES = ["Airport", "City use", "Out-of-city", "Multi-day"];
const RATE_BASES = ["Per trip", "Per day", "Per km"];
const PAY_STATUSES = ["Pending", "Paid", "Partially Paid", "Outstanding"];

interface TransportLeg {
  id: string;
  leg_type: string;
  scheduled_at: string;
  level: string;
  source: "inhouse" | "vendor";
  vehicle_id: string | null;
  vehicle_no: string | null;
  vehicle_type: string | null;
  driver_name: string | null;
  driver_mobile: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_vehicle_type: string | null;
  usage_type: string | null;
  destination_notes: string | null;
  is_assigned: boolean;
  completed_at: string | null;
  is_cancelled: boolean;
  cancel_reason: string | null;
  rate_basis?: string | null;
  amount?: number | null;
  currency?: string;
  lkr_equivalent?: number | null;
  payment_status?: string;
  cancel_charge?: number | null;
}

interface Vehicle {
  id: string;
  vehicle_no: string;
  vehicle_type: string;
  driver_id: string | null;
  is_active: boolean;
}
interface Driver {
  id: string;
  name: string;
  mobile: string | null;
  is_active: boolean;
}
interface Vendor {
  id: string;
  name: string;
  contact: string | null;
  vehicle_types_offered: string | null;
  is_active: boolean;
}
interface Currency {
  id: string;
  code: string;
  is_active: boolean;
}

const BLANK_FORM = {
  legType: LEG_TYPES[0],
  scheduledAt: "",
  level: "guest",
  source: "inhouse" as "inhouse" | "vendor",
  vehicleId: "",
  vendorId: "",
  vendorVehicleType: "",
  usageType: "",
  destinationNotes: "",
  rateBasis: "",
  amount: "",
  currency: "LKR",
  lkrEquiv: "",
};

export function TransportPanel({ trip }: { trip: TripDetail }) {
  const { user } = useSession();
  const role = user?.role;
  const canEdit = role === "COORDINATOR" || role === "TRANSPORT";
  const canSeeCost = role === "COORDINATOR" || role === "TENANT_ADMIN" || role === "MANAGER";
  const canCancelOrPay = role === "COORDINATOR";

  const [legs, setLegs] = useState<TransportLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelCharge, setCancelCharge] = useState("0");

  const [payId, setPayId] = useState<string | null>(null);
  const [payStatus, setPayStatus] = useState("Pending");
  const [payMethod, setPayMethod] = useState("");
  const [payDate, setPayDate] = useState("");

  function loadLegs() {
    setLoading(true);
    apiFetch<TransportLeg[]>(`/api/transport/legs?trip_id=${trip.id}`)
      .then(setLegs)
      .catch(() => setLegs([]))
      .finally(() => setLoading(false));
  }

  useEffect(loadLegs, [trip.id]);

  useEffect(() => {
    if (!canEdit) return;
    apiFetch<Vehicle[]>("/api/master-data/vehicles").then(setVehicles).catch(() => setVehicles([]));
    apiFetch<Driver[]>("/api/master-data/drivers").then(setDrivers).catch(() => setDrivers([]));
    apiFetch<Vendor[]>("/api/master-data/vendors").then(setVendors).catch(() => setVendors([]));
    if (canSeeCost) apiFetch<Currency[]>("/api/master-data/currencies").then(setCurrencies).catch(() => setCurrencies([]));
  }, [canEdit, canSeeCost]);

  function openAdd() {
    setForm(BLANK_FORM);
    setConflict(null);
    setOverrideReason("");
    setAddOpen(true);
  }

  async function submitLeg(override: boolean) {
    if (!form.scheduledAt) {
      toast.error("Date & time is required.");
      return;
    }
    if (form.source === "inhouse" && !form.vehicleId) {
      toast.error("Vehicle + driver is required.");
      return;
    }
    if (form.source === "vendor" && (!form.vendorId || !form.vendorVehicleType.trim())) {
      toast.error("Vendor and vehicle type are required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/transport/legs", {
        method: "POST",
        json: {
          trip_id: trip.id,
          level: form.level,
          leg_type: form.legType,
          scheduled_at: form.scheduledAt,
          source: form.source,
          vehicle_id: form.source === "inhouse" ? form.vehicleId : undefined,
          vendor_id: form.source === "vendor" ? form.vendorId : undefined,
          vendor_vehicle_type: form.source === "vendor" ? form.vendorVehicleType.trim() : undefined,
          usage_type: form.usageType || undefined,
          destination_notes: form.destinationNotes.trim() || undefined,
          rate_basis: canSeeCost && form.rateBasis ? form.rateBasis : undefined,
          amount: canSeeCost && form.amount !== "" ? Number(form.amount) : undefined,
          currency: canSeeCost ? form.currency : "LKR",
          lkr_equivalent: canSeeCost && form.lkrEquiv !== "" ? Number(form.lkrEquiv) : undefined,
          override,
          override_reason: override ? overrideReason.trim() : undefined,
        },
      });
      toast.success("Transport leg assigned");
      setAddOpen(false);
      loadLegs();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(err.message);
      } else {
        toast.error(err instanceof ApiError ? err.message : "Failed to assign leg.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function completeLeg(legId: string) {
    try {
      await apiFetch(`/api/transport/legs/${legId}/complete`, { method: "POST" });
      toast.success("Leg completed");
      loadLegs();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to complete leg.");
    }
  }

  async function doCancel() {
    if (!cancelId) return;
    if (!cancelReason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    try {
      await apiFetch(`/api/transport/legs/${cancelId}/cancel`, {
        method: "POST",
        json: { reason: cancelReason.trim(), charge: Number(cancelCharge) || 0 },
      });
      toast.success("Leg cancelled");
      setCancelId(null);
      loadLegs();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to cancel leg.");
    }
  }

  async function doPay() {
    if (!payId) return;
    try {
      await apiFetch(`/api/transport/legs/${payId}/payment`, {
        method: "POST",
        json: { status: payStatus, method: payMethod.trim() || undefined, payment_date: payDate || undefined },
      });
      toast.success("Payment recorded");
      setPayId(null);
      loadLegs();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record payment.");
    }
  }

  function waLink(leg: TransportLeg) {
    const mobile = leg.source === "inhouse" ? leg.driver_mobile : vendors.find((v) => v.id === leg.vendor_id)?.contact ?? null;
    if (!mobile) return null;
    const veh = leg.source === "inhouse" ? leg.vehicle_no : [leg.vendor_name, leg.vendor_vehicle_type].filter(Boolean).join(" ");
    const msg = `${leg.leg_type === "Departure Drop" ? "Drop" : "Pickup"}: ${trip.guest?.name ?? "Guest"} | ${fmtDT(leg.scheduled_at)} | ${veh ?? ""}${leg.destination_notes ? " | " + leg.destination_notes : ""}`;
    return `https://wa.me/${mobile.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`;
  }

  const vehicleOptions = vehicles.filter((v) => v.is_active);
  const vendorOptions = vendors.filter((v) => v.is_active);
  const currencyOptions = currencies.filter((c) => c.is_active);

  return (
    <Panel title="Transport Lane — legs" actions={canEdit ? <Button onClick={openAdd}>+ Add leg</Button> : undefined}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Leg</TableHead>
            <TableHead>Vehicle / Vendor</TableHead>
            {canSeeCost && <TableHead>Cost</TableHead>}
            <TableHead>Completion</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={canSeeCost ? 5 : 4} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {!loading && legs.length === 0 && (
            <TableRow>
              <TableCell colSpan={canSeeCost ? 5 : 4} className="text-center text-muted-foreground">
                No transport legs yet.
              </TableCell>
            </TableRow>
          )}
          {legs.map((l) => {
            const who =
              l.source === "inhouse"
                ? [l.vehicle_no, l.driver_name].filter(Boolean).join(" · ") || "—"
                : [l.vendor_name, l.vendor_vehicle_type].filter(Boolean).join(" · ") || "—";
            const wa = canEdit && !l.is_cancelled ? waLink(l) : null;
            return (
              <TableRow key={l.id} className={l.is_cancelled ? "opacity-55" : undefined}>
                <TableCell>
                  <div className="font-semibold">{l.leg_type}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {fmtDT(l.scheduled_at)} {l.usage_type ? `· ${l.usage_type}` : ""} {l.destination_notes ? `· ${l.destination_notes}` : ""}
                  </div>
                  {l.is_cancelled && <div className="text-[12px] text-destructive">{l.cancel_reason}</div>}
                </TableCell>
                <TableCell>{who}</TableCell>
                {canSeeCost && (
                  <TableCell>
                    {l.amount != null ? (
                      <>
                        {l.currency} {l.amount.toLocaleString()}
                        {l.source === "vendor" && l.payment_status && (
                          <div>
                            <Pill tone="grey">{l.payment_status}</Pill>
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {l.is_cancelled ? (
                    <Pill tone="red">Cancelled</Pill>
                  ) : l.completed_at ? (
                    <Pill tone="green">✓ {fmtDT(l.completed_at)}</Pill>
                  ) : (
                    <Pill tone="amber">Pending</Pill>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {!l.is_cancelled && canEdit && !l.completed_at && (
                      <Button size="sm" variant="outline" className="border-border" onClick={() => completeLeg(l.id)}>
                        Complete
                      </Button>
                    )}
                    {!l.is_cancelled && canSeeCost && l.source === "vendor" && canCancelOrPay && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-border"
                        onClick={() => {
                          setPayId(l.id);
                          setPayStatus(l.payment_status ?? "Pending");
                          setPayMethod("");
                          setPayDate("");
                        }}
                      >
                        Payment
                      </Button>
                    )}
                    {!l.is_cancelled && canCancelOrPay && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-border text-destructive"
                        onClick={() => {
                          setCancelId(l.id);
                          setCancelReason("");
                          setCancelCharge("0");
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center rounded-lg border border-[#3FBF7F] px-2.5 text-[12.5px] font-medium text-[#3FBF7F]"
                      >
                        wa.me ↗
                      </a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="mt-3.5 text-[12.5px] text-muted-foreground">
        The cycle closes when the Departure Drop is confirmed. Transport never sees costs.
      </p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add transport leg</DialogTitle>
          </DialogHeader>

          {conflict ? (
            <div className="space-y-3">
              <p className="text-[13px] text-destructive">{conflict}</p>
              <div className="space-y-1.5">
                <Label>Override reason *</Label>
                <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" className="border-border" onClick={() => setConflict(null)}>
                  Back
                </Button>
                <Button disabled={saving || !overrideReason.trim()} onClick={() => submitLeg(true)}>
                  {saving ? "Saving…" : "Override and assign"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Leg type *</Label>
                  <Select value={form.legType} onValueChange={(v) => v && setForm((s) => ({ ...s, legType: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEG_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date &amp; time *</Label>
                  <Input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm((s) => ({ ...s, scheduledAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Level</Label>
                  <Select value={form.level} onValueChange={(v) => v && setForm((s) => ({ ...s, level: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="guest">This guest only</SelectItem>
                      {trip.group_id && <SelectItem value="group">Group — shared</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Usage type</Label>
                  <Select value={form.usageType} onValueChange={(v) => v && setForm((s) => ({ ...s, usageType: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="— select —" />
                    </SelectTrigger>
                    <SelectContent>
                      {USAGE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Source *</Label>
                  <Select
                    value={form.source}
                    onValueChange={(v) => v && setForm((s) => ({ ...s, source: v as "inhouse" | "vendor" }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inhouse">In-house fleet</SelectItem>
                      <SelectItem value="vendor">External vendor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.source === "inhouse" ? (
                  <div className="space-y-1.5">
                    <Label>Vehicle + driver *</Label>
                    <Select value={form.vehicleId} onValueChange={(v) => v && setForm((s) => ({ ...s, vehicleId: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="— select —" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleOptions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.vehicle_no} · {drivers.find((d) => d.id === v.driver_id)?.name ?? "no driver"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>Vendor *</Label>
                      <Select value={form.vendorId} onValueChange={(v) => v && setForm((s) => ({ ...s, vendorId: v }))}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="— select —" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendorOptions.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vehicle type *</Label>
                      <Input
                        placeholder="Sedan / Van"
                        value={form.vendorVehicleType}
                        onChange={(e) => setForm((s) => ({ ...s, vendorVehicleType: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Destination / notes</Label>
                <Input
                  placeholder="e.g. BIA → Shangri-La / shopping Odel"
                  value={form.destinationNotes}
                  onChange={(e) => setForm((s) => ({ ...s, destinationNotes: e.target.value }))}
                />
              </div>

              {canSeeCost ? (
                <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Rate basis</Label>
                    <Select value={form.rateBasis} onValueChange={(v) => v && setForm((s) => ({ ...s, rateBasis: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="— select —" />
                      </SelectTrigger>
                      <SelectContent>
                        {RATE_BASES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.amount}
                      onChange={(e) => {
                        const amount = e.target.value;
                        setForm((s) => ({ ...s, amount, lkrEquiv: s.currency === "LKR" ? amount : s.lkrEquiv }));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Select value={form.currency} onValueChange={(v) => v && setForm((s) => ({ ...s, currency: v }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(currencyOptions.length ? currencyOptions.map((c) => c.code) : ["LKR"]).map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>LKR equivalent</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.lkrEquiv}
                      onChange={(e) => setForm((s) => ({ ...s, lkrEquiv: e.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">Cost fields are entered by the Coordinator — costs are not visible to Transport.</p>
              )}

              <DialogFooter>
                <Button variant="outline" className="border-border" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={saving} onClick={() => submitLeg(false)}>
                  {saving ? "Saving…" : "Add leg"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel leg</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Cancellation charge (LKR, 0 if none)</Label>
              <Input type="number" min={0} value={cancelCharge} onChange={(e) => setCancelCharge(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setCancelId(null)}>
              Back
            </Button>
            <Button disabled={!cancelReason.trim()} onClick={doCancel}>
              Cancel leg
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payId} onOpenChange={(o) => !o && setPayId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vendor payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={payStatus} onValueChange={(v) => v && setPayStatus(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setPayId(null)}>
              Cancel
            </Button>
            <Button onClick={doPay}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
