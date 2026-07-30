"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { STATUS_META, type TripStatus } from "@/lib/types";
import { toast } from "sonner";

const REASON_REQUIRED: TripStatus[] = ["CANCELLED", "NO_SHOW"];

export function StatusChangeDialog({
  tripId,
  allowed,
  onDone,
}: {
  tripId: string;
  allowed: TripStatus[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<TripStatus | "">("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (allowed.length === 0) return null;

  async function submit() {
    if (!to) return;
    if (REASON_REQUIRED.includes(to) && !reason.trim()) {
      setError("A reason is required for this transition.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/trips/${tripId}/status`, { method: "POST", json: { to, reason: reason || undefined } });
      toast.success("Status updated");
      setOpen(false);
      setTo("");
      setReason("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        className="font-bold text-[#15203A]"
        style={{ background: "linear-gradient(135deg,var(--rcgm-gold),var(--rcgm-gold2))" }}
        onClick={() => setOpen(true)}
      >
        Change Status
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Trip Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>New status</Label>
              <Select value={to} onValueChange={(v) => setTo(v as TripStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select next status" />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s]?.label ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason {to && REASON_REQUIRED.includes(to) ? "(required)" : "(optional)"}</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error && <div className="text-[12.5px] text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!to || saving} onClick={submit}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
