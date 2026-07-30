"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import type { Package, TripDetail } from "@/lib/types";

const NATIONALITIES = [
  "India", "China", "Sri Lanka", "Pakistan", "Bangladesh", "Nepal", "Maldives", "UAE",
  "Saudi Arabia", "Qatar", "Oman", "Kuwait", "Bahrain", "Singapore", "Malaysia", "Thailand",
  "United Kingdom", "Australia", "Russia", "Other",
];
const VISA_STATUSES = ["ETA", "Visa on arrival", "Granted", "Pending"];

interface CompanionForm {
  name: string;
  relationship: string;
  passport_no: string;
  passport_expiry: string;
  dob: string;
  nationality: string;
  visa_status: string;
}

function blankCompanion(): CompanionForm {
  return { name: "", relationship: "", passport_no: "", passport_expiry: "", dob: "", nationality: "", visa_status: "ETA" };
}

export default function NewGuestArrivalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editTripId = searchParams.get("tripId");

  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(!!editTripId);

  const [name, setName] = useState("");
  const [membershipNo, setMembershipNo] = useState("");
  const [nationality, setNationality] = useState("India");
  const [mobile, setMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [passportNo, setPassportNo] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  const [dob, setDob] = useState("");
  const [visaStatus, setVisaStatus] = useState("ETA");

  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [packageId, setPackageId] = useState("");
  const [notes, setNotes] = useState("");

  const [dietary, setDietary] = useState("");
  const [beverage, setBeverage] = useState("");
  const [room, setRoom] = useState("");
  const [language, setLanguage] = useState("");
  const [vipLevel, setVipLevel] = useState("");
  const [signboard, setSignboard] = useState("");
  const [prefNotes, setPrefNotes] = useState("");

  const [companions, setCompanions] = useState<CompanionForm[]>([]);
  const [lookupMsg, setLookupMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Package[]>("/api/master-data/packages")
      .then(setPackages)
      .catch(() => setPackages([]));
  }, []);

  useEffect(() => {
    if (!editTripId) return;
    apiFetch<TripDetail>(`/api/trips/${editTripId}`)
      .then((t) => {
        if (t.guest) {
          setName(t.guest.name);
          setMembershipNo(t.guest.membership_no);
          setNationality(t.guest.nationality ?? "India");
          setMobile(t.guest.mobile ?? "");
          setWhatsapp(t.guest.whatsapp ?? "");
          setEmail(t.guest.email ?? "");
          setPassportNo(t.guest.passport_no ?? "");
          setPassportExpiry(t.guest.passport_expiry ?? "");
          setDob(t.guest.dob ?? "");
          setVisaStatus(t.guest.visa_status ?? "ETA");
          setDietary(t.guest.preferences?.dietary ?? "");
          setBeverage(t.guest.preferences?.beverage ?? "");
          setRoom(t.guest.preferences?.room ?? "");
          setLanguage(t.guest.preferences?.language ?? "");
          setVipLevel(t.guest.preferences?.vip_level ?? "");
          setSignboard(t.guest.preferences?.signboard_name ?? "");
          setPrefNotes(t.guest.preferences?.notes ?? "");
        }
        setArrival(t.arrival_date);
        setDeparture(t.departure_date);
        setPackageId(t.package?.id ?? "");
        setNotes(t.notes ?? "");
        setCompanions(
          t.companions.map((c) => ({
            name: c.name,
            relationship: c.relationship ?? "",
            passport_no: c.passport_no ?? "",
            passport_expiry: c.passport_expiry ?? "",
            dob: c.dob ?? "",
            nationality: c.nationality ?? "",
            visa_status: c.visa_status ?? "ETA",
          }))
        );
      })
      .catch(() => setError("Could not load the draft to edit."))
      .finally(() => setLoadingExisting(false));
  }, [editTripId]);

  async function lookupMembership() {
    const v = membershipNo.trim();
    if (!v || v.toUpperCase() === "NEW") {
      setLookupMsg("");
      return;
    }
    try {
      const res = await apiFetch<{ guest: TripDetail["guest"]; last_trip: { trip_no: string } | null } | null>(
        `/api/guests/lookup?membership_no=${encodeURIComponent(v)}`
      );
      if (res?.guest) {
        const g = res.guest;
        setName(g.name);
        setNationality(g.nationality ?? "India");
        setMobile(g.mobile ?? "");
        setWhatsapp(g.whatsapp ?? "");
        setEmail(g.email ?? "");
        setPassportNo(g.passport_no ?? "");
        setPassportExpiry(g.passport_expiry ?? "");
        setDob(g.dob ?? "");
        setVisaStatus(g.visa_status ?? "ETA");
        setDietary(g.preferences?.dietary ?? "");
        setBeverage(g.preferences?.beverage ?? "");
        setRoom(g.preferences?.room ?? "");
        setLanguage(g.preferences?.language ?? "");
        setVipLevel(g.preferences?.vip_level ?? "");
        setSignboard(g.preferences?.signboard_name ?? "");
        setPrefNotes(g.preferences?.notes ?? "");
        setLookupMsg(
          `Pre-filled from existing guest record${res.last_trip ? ` — last trip ${res.last_trip.trip_no}` : ""}.`
        );
      } else {
        setLookupMsg("");
      }
    } catch {
      setLookupMsg("");
    }
  }

  function addCompanion() {
    setCompanions((c) => [...c, blankCompanion()]);
  }
  function removeCompanion(i: number) {
    setCompanions((c) => c.filter((_, idx) => idx !== i));
  }
  function updateCompanion(i: number, patch: Partial<CompanionForm>) {
    setCompanions((c) => c.map((comp, idx) => (idx === i ? { ...comp, ...patch } : comp)));
  }

  function buildPayload() {
    return {
      guest: {
        name,
        membership_no: membershipNo || "NEW",
        nationality,
        mobile,
        whatsapp: whatsapp || mobile,
        email: email || undefined,
        passport_no: passportNo || undefined,
        passport_expiry: passportExpiry || undefined,
        dob: dob || undefined,
        visa_status: visaStatus,
        preferences: {
          dietary: dietary || undefined,
          beverage: beverage || undefined,
          room: room || undefined,
          language: language || undefined,
          vip_level: vipLevel || undefined,
          signboard_name: signboard || undefined,
          notes: prefNotes || undefined,
        },
      },
      companions: companions.map((c) => ({
        name: c.name,
        relationship: c.relationship || undefined,
        passport_no: c.passport_no || undefined,
        passport_expiry: c.passport_expiry || undefined,
        dob: c.dob || undefined,
        nationality: c.nationality || undefined,
        visa_status: c.visa_status || undefined,
      })),
      arrival_date: arrival,
      departure_date: departure,
      package_id: packageId || undefined,
      notes: notes || undefined,
    };
  }

  async function save(submit: boolean) {
    setError("");
    if (!name.trim() || !membershipNo.trim() || !mobile.trim() || !arrival || !departure) {
      setError("Please fill in all required (*) fields.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editTripId) {
        await apiFetch(`/api/trips/${editTripId}/draft?submit=${submit}`, { method: "PATCH", json: payload });
      } else {
        await apiFetch(`/api/trips?submit=${submit}`, { method: "POST", json: payload });
      }
      toast.success(submit ? "Request submitted" : "Draft saved");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save request.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingExisting) return <div className="text-sm text-muted-foreground">Loading draft…</div>;

  return (
    <div>
      <PageHead
        title={editTripId ? "Edit Draft Request" : "New Guest Arrival"}
        subtitle="All * fields plus passport details are required before submission"
      />
      {lookupMsg && <div className="mb-4 text-[12.5px] text-[var(--rcgm-gold-soft)]">{lookupMsg}</div>}

      <Panel title="Guest">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Full name (as per passport) *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Membership number * (&quot;NEW&quot; allowed)</Label>
            <Input value={membershipNo} onChange={(e) => setMembershipNo(e.target.value)} onBlur={lookupMembership} />
          </div>
          <div className="space-y-1.5">
            <Label>Nationality *</Label>
            <Select value={nationality} onValueChange={(v) => v && setNationality(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NATIONALITIES.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mobile * (SMS channel)</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp (defaults to mobile)</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Passport number *</Label>
            <Input value={passportNo} onChange={(e) => setPassportNo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Passport expiry *</Label>
            <Input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth *</Label>
            <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Visa status *</Label>
            <Select value={visaStatus} onValueChange={(v) => v && setVisaStatus(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISA_STATUSES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Panel>

      <Panel title="Trip">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Proposed arrival *</Label>
            <Input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Proposed departure *</Label>
            <Input type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Package code *</Label>
            <Select value={packageId} onValueChange={(v) => v && setPackageId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— select —" />
              </SelectTrigger>
              <SelectContent>
                {packages
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3.5 space-y-1.5">
          <Label>Special notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Panel>

      <Panel
        title="Companions"
        actions={
          <Button size="sm" variant="outline" className="border-border" onClick={addCompanion}>
            + Add companion
          </Button>
        }
      >
        {companions.length === 0 && <div className="text-[12.5px] text-muted-foreground">No companions added.</div>}
        <div className="space-y-3">
          {companions.map((c, i) => (
            <div key={i} className="rounded-lg border border-border bg-[var(--rcgm-navy3)] p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <b className="text-[13px]">Companion {i + 1}</b>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border text-destructive hover:border-destructive"
                  onClick={() => removeCompanion(i)}
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Name (as per passport) *</Label>
                  <Input value={c.name} onChange={(e) => updateCompanion(i, { name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Relationship *</Label>
                  <Input
                    value={c.relationship}
                    placeholder="Spouse / Friend / Assistant"
                    onChange={(e) => updateCompanion(i, { relationship: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Passport number *</Label>
                  <Input value={c.passport_no} onChange={(e) => updateCompanion(i, { passport_no: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Passport expiry *</Label>
                  <Input
                    type="date"
                    value={c.passport_expiry}
                    onChange={(e) => updateCompanion(i, { passport_expiry: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date of birth *</Label>
                  <Input type="date" value={c.dob} onChange={(e) => updateCompanion(i, { dob: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Visa status *</Label>
                  <Select value={c.visa_status} onValueChange={(v) => v && updateCompanion(i, { visa_status: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISA_STATUSES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="VIP Preferences">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Dietary</Label>
            <Input value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="Veg / Non-veg / Jain / Halal / Allergies" />
          </div>
          <div className="space-y-1.5">
            <Label>Beverage</Label>
            <Input value={beverage} onChange={(e) => setBeverage(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Room</Label>
            <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Smoking / Non-smoking, floor" />
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>VIP level</Label>
            <Input value={vipLevel} onChange={(e) => setVipLevel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Signboard name (airport pickup)</Label>
            <Input value={signboard} onChange={(e) => setSignboard(e.target.value)} />
          </div>
        </div>
        <div className="mt-3.5 space-y-1.5">
          <Label>Service notes</Label>
          <Textarea rows={2} value={prefNotes} onChange={(e) => setPrefNotes(e.target.value)} />
        </div>
      </Panel>

      {error && <div className="mb-3 text-[12.5px] text-destructive">{error}</div>}
      <div className="flex justify-end gap-2.5">
        <Button variant="outline" className="border-border" onClick={() => router.push("/dashboard")}>
          Discard changes
        </Button>
        <Button variant="outline" className="border-border" disabled={saving} onClick={() => save(false)}>
          Save draft
        </Button>
        <Button
          disabled={saving}
          className="font-bold text-[#15203A]"
          style={{ background: "linear-gradient(135deg,var(--rcgm-gold),var(--rcgm-gold2))" }}
          onClick={() => save(true)}
        >
          {saving ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </div>
  );
}
