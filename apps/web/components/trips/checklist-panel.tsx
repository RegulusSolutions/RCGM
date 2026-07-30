"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import type { ChecklistEntry } from "@/lib/types";
import { toast } from "sonner";

const NA_ELIGIBLE = new Set(["flight", "hotel", "visa", "pickupA", "pickupC", "dropA", "dropC"]);

export function ChecklistPanel({
  tripId,
  checklist,
  canEdit,
  onDone,
}: {
  tripId: string;
  checklist: ChecklistEntry[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [naTarget, setNaTarget] = useState<ChecklistEntry | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function markNa() {
    if (!naTarget || !reason.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/trips/${tripId}/checklist/${naTarget.item_key}/na`, {
        method: "POST",
        json: { reason },
      });
      toast.success("Marked N/A");
      setNaTarget(null);
      setReason("");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to mark N/A.");
    } finally {
      setSaving(false);
    }
  }

  async function clearNa(item: ChecklistEntry) {
    setSaving(true);
    try {
      await apiFetch(`/api/trips/${tripId}/checklist/${item.item_key}/na`, { method: "DELETE" });
      toast.success("N/A cleared");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to clear N/A.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Completion Checklist" className="mb-0">
      <p className="mb-3 text-[12px] text-muted-foreground">
        Derived live from bookings, visas, transport and expense state — never manually ticked.
      </p>
      <div className="space-y-2">
        {checklist.map((item) => (
          <div
            key={item.item_key}
            className="flex items-center justify-between rounded-lg border border-border bg-[var(--rcgm-navy3)] px-3.5 py-2.5"
          >
            <div>
              <div className="text-[12.5px]">{item.label}</div>
              {item.state === "na" && item.na_reason && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">N/A — {item.na_reason}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {item.state === "green" && <Pill tone="green">✓ Done</Pill>}
              {item.state === "open" && <Pill tone="amber">Open</Pill>}
              {item.state === "na" && <Pill tone="grey">N/A</Pill>}
              {canEdit && NA_ELIGIBLE.has(item.item_key) && item.state === "open" && (
                <Button size="sm" variant="outline" className="border-border" onClick={() => setNaTarget(item)}>
                  Mark N/A
                </Button>
              )}
              {canEdit && item.state === "na" && (
                <Button size="sm" variant="outline" className="border-border" disabled={saving} onClick={() => clearNa(item)}>
                  Clear N/A
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!naTarget} onOpenChange={(o) => !o && setNaTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark &ldquo;{naTarget?.label}&rdquo; as N/A</DialogTitle>
          </DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)…" />
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setNaTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!reason.trim() || saving} onClick={markNa}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
