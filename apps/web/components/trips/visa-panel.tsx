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
import { listTripDocuments, uploadDocument, validateUploadFile, type DocumentMeta } from "@/lib/documents";
import { fmtD } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { TripDetail } from "@/lib/types";
import { DocumentControl } from "./document-control";

const VISA_STATUSES = ["Not Required", "To Apply", "Applied", "Granted", "Rejected", "On Arrival"];

interface VisaRecord {
  id: string;
  traveller_type: "guest" | "companion";
  traveller_name: string;
  passport_no: string | null;
  dob: string | null;
  nationality: string | null;
  status: string;
  eta_reference: string | null;
  application_date: string | null;
  fee_usd: number | null;
  lkr_equivalent: number | null;
  payment_status: string;
  reason: string | null;
}

interface VisaFeeGuide {
  id: string;
  nationality_group: string;
  fee_usd: number;
  is_active: boolean;
}

function visaPill(s: string) {
  if (s === "Granted" || s === "On Arrival") return <Pill tone="green">{s}</Pill>;
  if (s === "Not Required") return <Pill tone="grey">{s}</Pill>;
  if (s === "Rejected") return <Pill tone="red">{s}</Pill>;
  if (s === "Applied") return <Pill tone="blue">{s}</Pill>;
  return <Pill tone="amber">{s}</Pill>;
}

export function VisaPanel({ trip }: { trip: TripDetail }) {
  const { user } = useSession();
  const role = user?.role;
  const canEdit = role === "COORDINATOR";
  const canSeeDocs = role === "COORDINATOR" || role === "RESERVATIONS" || role === "TENANT_ADMIN";

  const [visas, setVisas] = useState<VisaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [feeGuide, setFeeGuide] = useState<VisaFeeGuide[]>([]);
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const [editing, setEditing] = useState<VisaRecord | null>(null);
  const [form, setForm] = useState({
    status: "To Apply",
    nationality: "",
    etaRef: "",
    applyDate: "",
    feeUsd: "",
    lkrEquiv: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    apiFetch<VisaRecord[]>(`/api/visas/trips/${trip.id}`)
      .then(setVisas)
      .catch(() => setVisas([]))
      .finally(() => setLoading(false));
  }

  function loadDocs() {
    if (!canSeeDocs) return;
    listTripDocuments(trip.id)
      .then((all) => setDocs(all.filter((d) => d.owner_type === "visa" && d.category === "eta")))
      .catch(() => setDocs([]));
  }

  useEffect(load, [trip.id]);
  useEffect(loadDocs, [trip.id, canSeeDocs]);

  useEffect(() => {
    if (!canEdit) return;
    apiFetch<VisaFeeGuide[]>("/api/master-data/visa-fees").then(setFeeGuide).catch(() => setFeeGuide([]));
  }, [canEdit]);

  async function attachEtaDoc(visaId: string, file: File) {
    const err = validateUploadFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadingFor(visaId);
    try {
      await uploadDocument({ file, ownerType: "visa", ownerId: visaId, category: "eta", tripId: trip.id });
      toast.success("ETA approval uploaded");
      loadDocs();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to upload ETA approval.");
    } finally {
      setUploadingFor(null);
    }
  }

  function openEdit(v: VisaRecord) {
    setEditing(v);
    setForm({
      status: v.status,
      nationality: v.nationality ?? "",
      etaRef: v.eta_reference ?? "",
      applyDate: v.application_date ?? "",
      feeUsd: v.fee_usd != null ? String(v.fee_usd) : "",
      lkrEquiv: v.lkr_equivalent != null ? String(v.lkr_equivalent) : "",
      reason: v.reason ?? "",
    });
  }

  function feeForNationality(nat: string) {
    const hit =
      feeGuide.find((f) => f.is_active && f.nationality_group.toLowerCase() === nat.toLowerCase()) ??
      feeGuide.find((f) => f.is_active && f.nationality_group === "Other nationalities");
    return hit ? hit.fee_usd : null;
  }

  async function submit() {
    if (!editing) return;
    if ((form.status === "Applied" || form.status === "Granted") && !form.etaRef.trim()) {
      toast.error(`ETA reference is required for ${form.status}.`);
      return;
    }
    if (form.status === "Applied" && !form.applyDate) {
      toast.error("Application date is required.");
      return;
    }
    if ((form.status === "Not Required" || form.status === "On Arrival") && !form.reason.trim()) {
      toast.error(`A reason is required for ${form.status}.`);
      return;
    }
    if (form.feeUsd === "") {
      toast.error("Fee is required (0 = free).");
      return;
    }
    const fee = Number(form.feeUsd);
    if (fee > 0 && form.lkrEquiv === "") {
      toast.error("LKR equivalent is required when the fee is greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/visas/${editing.id}`, {
        method: "PATCH",
        json: {
          status: form.status,
          nationality: form.nationality || undefined,
          eta_reference: form.etaRef.trim() || undefined,
          application_date: form.applyDate || undefined,
          fee_usd: fee,
          lkr_equivalent: form.lkrEquiv === "" ? undefined : Number(form.lkrEquiv),
          reason: form.reason.trim() || undefined,
        },
      });
      toast.success("Visa updated");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update visa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Visa Lane — per traveller (Coordinator-owned)">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Traveller</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
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
          {!loading && visas.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No travellers on this trip.
              </TableCell>
            </TableRow>
          )}
          {visas.map((v) => (
            <TableRow key={v.id}>
              <TableCell>
                <div className="font-semibold">
                  {v.traveller_name}{" "}
                  <span className="ml-1 rounded bg-[var(--rcgm-navy3)] px-1.5 py-0.5 text-[10px] tracking-wide uppercase text-muted-foreground">
                    {v.traveller_type}
                  </span>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {v.passport_no ?? "—"} · {v.nationality ?? "—"}
                  {v.eta_reference ? ` · Ref ${v.eta_reference}` : ""}
                  {v.reason ? ` · ${v.reason}` : ""}
                </div>
              </TableCell>
              <TableCell>{v.fee_usd == null ? "—" : v.fee_usd === 0 ? "Free" : `USD ${v.fee_usd}${v.lkr_equivalent ? ` (LKR ${v.lkr_equivalent.toLocaleString()})` : ""}`}</TableCell>
              <TableCell>{v.fee_usd && v.fee_usd > 0 ? <Pill tone="grey">{v.payment_status}</Pill> : "—"}</TableCell>
              <TableCell>{visaPill(v.status)}</TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  {canEdit && (
                    <Button size="sm" variant="outline" className="border-border" onClick={() => openEdit(v)}>
                      Update
                    </Button>
                  )}
                  {canSeeDocs && (
                    <DocumentControl
                      label="ETA doc"
                      doc={docs.find((d) => d.owner_id === v.id)}
                      canUpload={canEdit}
                      uploading={uploadingFor === v.id}
                      onUpload={(file) => attachEtaDoc(v.id, file)}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-3.5 text-[12.5px] text-muted-foreground">
        Fees pre-fill from the Visa Fee Guide and stay editable — the guide is never a rule. Apply at{" "}
        <a href="https://eta.gov.lk" target="_blank" rel="noreferrer" className="underline">
          eta.gov.lk
        </a>
        .
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Visa — {editing?.traveller_name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <>
              <p className="text-[12.5px] text-muted-foreground">
                Passport {editing.passport_no ?? "—"} · DOB {fmtD(editing.dob)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => v && setForm((s) => ({ ...s, status: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISA_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nationality / fee group</Label>
                  <Select
                    value={form.nationality}
                    onValueChange={(v) => {
                      if (!v) return;
                      const fee = feeForNationality(v);
                      setForm((s) => ({ ...s, nationality: v, feeUsd: fee != null ? String(fee) : s.feeUsd }));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="— select —" />
                    </SelectTrigger>
                    <SelectContent>
                      {feeGuide.filter((f) => f.is_active).map((f) => (
                        <SelectItem key={f.id} value={f.nationality_group}>
                          {f.nationality_group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>ETA reference (req. Applied/Granted)</Label>
                  <Input value={form.etaRef} onChange={(e) => setForm((s) => ({ ...s, etaRef: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Application date (req. Applied)</Label>
                  <Input type="date" value={form.applyDate} onChange={(e) => setForm((s) => ({ ...s, applyDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fee USD (0 = free)</Label>
                  <Input type="number" min={0} value={form.feeUsd} onChange={(e) => setForm((s) => ({ ...s, feeUsd: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>LKR equivalent (req. when fee &gt; 0)</Label>
                  <Input type="number" min={0} value={form.lkrEquiv} onChange={(e) => setForm((s) => ({ ...s, lkrEquiv: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Reason (req. for Not Required / On Arrival)</Label>
                <Input value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} />
              </div>
              <DialogFooter>
                <Button variant="outline" className="border-border" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button disabled={saving} onClick={submit}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
