"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import type { TripDetail } from "@/lib/types";
import { toast } from "sonner";

export function HandoverPanel({ trip, canEdit, onDone }: { trip: TripDetail; canEdit: boolean; onDone: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/trips/${trip.id}/handover`, { method: "POST", json: { text } });
      toast.success("Handover set");
      setText("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set handover.");
    } finally {
      setSaving(false);
    }
  }

  async function ack() {
    setSaving(true);
    try {
      await apiFetch(`/api/trips/${trip.id}/handover/ack`, { method: "POST" });
      toast.success("Handover acknowledged");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to acknowledge.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Shift Handover">
      {trip.handover ? (
        <div
          className="mb-4 rounded-lg border p-3.5 text-[12.5px]"
          style={{ background: "#3D3217", borderColor: "var(--rcgm-amber)" }}
        >
          <div className="mb-1 text-[11px] text-muted-foreground">{fmtDT(trip.handover.created_at)}</div>
          <div>{trip.handover.text}</div>
          {trip.handover.acknowledged_at ? (
            <div className="mt-2 text-[11px] text-[var(--rcgm-green)]">
              Acknowledged {fmtDT(trip.handover.acknowledged_at)}
            </div>
          ) : (
            canEdit && (
              <Button size="sm" variant="outline" className="mt-2 border-border" disabled={saving} onClick={ack}>
                Acknowledge
              </Button>
            )
          )}
        </div>
      ) : (
        <div className="mb-3 text-[12.5px] text-muted-foreground">No handover note set.</div>
      )}
      {canEdit && (
        <div className="space-y-2.5 border-t border-border pt-3.5">
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Handover note for next shift…" />
          {error && <div className="text-[12.5px] text-destructive">{error}</div>}
          <Button size="sm" disabled={saving || !text.trim()} onClick={submit}>
            {saving ? "Saving…" : "Set handover"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
