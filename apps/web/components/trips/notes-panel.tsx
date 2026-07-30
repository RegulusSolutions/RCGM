"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import type { TripDetail } from "@/lib/types";
import { toast } from "sonner";

const NOTE_TYPES = ["General", "Error & Correction", "Incident", "Guest Feedback"];

export function NotesPanel({ trip, canEdit, onDone }: { trip: TripDetail; canEdit: boolean; onDone: () => void }) {
  const [noteType, setNoteType] = useState("General");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/trips/${trip.id}/notes`, { method: "POST", json: { note_type: noteType, text } });
      toast.success("Note added");
      setText("");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Notes">
      <div className="mb-4 border-l-2 border-border pl-[18px]">
        {trip.notes_log.length === 0 && <div className="text-[12.5px] text-muted-foreground">No notes yet.</div>}
        {trip.notes_log.map((n) => (
          <div key={n.id} className="relative pb-3.5 text-[12.5px]">
            <div className="text-[11px] text-muted-foreground">
              {fmtDT(n.created_at)} · {n.note_type}
            </div>
            <div>{n.text}</div>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="space-y-2.5 border-t border-border pt-3.5">
          <div className="flex gap-2">
            <Select value={noteType} onValueChange={(v) => v && setNoteType(v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" />
          {error && <div className="text-[12.5px] text-destructive">{error}</div>}
          <Button size="sm" disabled={saving || !text.trim()} onClick={submit}>
            {saving ? "Adding…" : "Add note"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
