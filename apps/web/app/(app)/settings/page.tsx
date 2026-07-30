"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";

interface TenantSettings {
  flight_amber_days: number;
  flight_red_hrs: number;
  hotel_amber_days: number;
  hotel_red_hrs: number;
  visa_amber_days: number;
  visa_red_hrs: number;
  pickup_amber_hrs: number;
  pickup_red_hrs: number;
  drop_amber_hrs: number;
  drop_red_hrs: number;
  guest_link_expiry_days: number;
}

const WINDOW_GROUPS: { title: string; amber: keyof TenantSettings; red: keyof TenantSettings; amberLabel: string; redLabel: string }[] = [
  { title: "Flight Booking", amber: "flight_amber_days", red: "flight_red_hrs", amberLabel: "Amber — days before arrival", redLabel: "Red — hours before arrival" },
  { title: "Hotel Booking", amber: "hotel_amber_days", red: "hotel_red_hrs", amberLabel: "Amber — days before arrival", redLabel: "Red — hours before arrival" },
  { title: "Visa", amber: "visa_amber_days", red: "visa_red_hrs", amberLabel: "Amber — days before arrival", redLabel: "Red — hours before arrival" },
  { title: "Arrival Pickup", amber: "pickup_amber_hrs", red: "pickup_red_hrs", amberLabel: "Amber — hours before arrival", redLabel: "Red — hours before arrival" },
  { title: "Departure Drop", amber: "drop_amber_hrs", red: "drop_red_hrs", amberLabel: "Amber — hours before departure", redLabel: "Red — hours before departure" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    apiFetch<TenantSettings>("/api/tenants/settings")
      .then((s) => {
        setSettings(s);
        const f: Record<string, string> = {};
        for (const k of Object.keys(s) as (keyof TenantSettings)[]) f[k] = String(s[k]);
        setForm(f);
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const k of Object.keys(form)) {
        const n = Number(form[k]);
        if (Number.isFinite(n)) payload[k] = n;
      }
      const updated = await apiFetch<TenantSettings>("/api/tenants/settings", { method: "PATCH", json: payload });
      setSettings(updated);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!settings) return <div className="text-sm text-destructive">Could not load tenant settings.</div>;

  return (
    <div>
      <PageHead
        title="Settings & Flag Windows"
        subtitle="Tenant-configurable escalation windows and guest-link expiry — open tasks turn amber, then red, as anchor dates approach"
      />

      <Panel title="Time-Aware Flag Windows">
        <p className="mb-4 text-[12.5px] text-muted-foreground">
          Open tasks turn amber when the anchor date approaches and red inside the final window. Changes are
          audit-logged.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WINDOW_GROUPS.map((g) => (
            <div key={g.title} className="rounded-lg border border-border bg-[var(--rcgm-navy3)] p-3.5">
              <div className="mb-2.5 text-[13px] font-semibold text-[var(--rcgm-gold-soft)]">{g.title}</div>
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">{g.amberLabel}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form[g.amber] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [g.amber]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">{g.redLabel}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form[g.red] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [g.red]: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Guest Trip Link">
        <div className="max-w-xs space-y-1.5">
          <Label>Link expiry (days)</Label>
          <Input
            type="number"
            min={1}
            value={form.guest_link_expiry_days ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, guest_link_expiry_days: e.target.value }))}
          />
          <p className="text-[11.5px] text-muted-foreground">
            Default validity for newly generated guest itinerary links, unless revoked earlier.
          </p>
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
