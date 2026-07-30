"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import type { TripDetail } from "@/lib/types";
import { toast } from "sonner";

export function ClearancePanel({
  trip,
  canRecord,
  onDone,
}: {
  trip: TripDetail;
  canRecord: boolean;
  onDone: () => void;
}) {
  const [clearedBy, setClearedBy] = useState("");
  const [reference, setReference] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/trips/${trip.id}/clearance`, {
        method: "POST",
        json: {
          cleared_by_name: clearedBy,
          reference,
          override,
          override_reason: override ? overrideReason : undefined,
        },
      });
      toast.success("Clearance recorded");
      setClearedBy("");
      setReference("");
      setOverride(false);
      setOverrideReason("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record clearance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Compliance Clearance">
      {trip.clearance ? (
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center gap-2">
            <Pill tone="green">✓ Cleared</Pill>
            {trip.clearance.is_override && <Pill tone="amber">Admin Override</Pill>}
          </div>
          <div>
            <span className="text-muted-foreground">By: </span>
            {trip.clearance.cleared_by_name}
          </div>
          <div>
            <span className="text-muted-foreground">Reference: </span>
            {trip.clearance.reference}
          </div>
          <div>
            <span className="text-muted-foreground">At: </span>
            {fmtDT(trip.clearance.cleared_at)}
          </div>
        </div>
      ) : (
        <div className="mb-3 text-[13px] text-muted-foreground">Not yet cleared to book.</div>
      )}

      {canRecord && !trip.clearance && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cleared by *</Label>
              <Input value={clearedBy} onChange={(e) => setClearedBy(e.target.value)} placeholder="Compliance Desk — name" />
            </div>
            <div className="space-y-1.5">
              <Label>Reference *</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Email / clearance ref" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Admin override (bypass normal clearance workflow)
          </label>
          {override && (
            <div className="space-y-1.5">
              <Label>Override reason *</Label>
              <Textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </div>
          )}
          {error && <div className="text-[12.5px] text-destructive">{error}</div>}
          <Button
            disabled={saving || !clearedBy.trim() || !reference.trim()}
            onClick={submit}
            className="font-bold text-[#15203A]"
            style={{ background: "linear-gradient(135deg,var(--rcgm-gold),var(--rcgm-gold2))" }}
          >
            {saving ? "Recording…" : "Record Clearance"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
