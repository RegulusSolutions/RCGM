"use client";

import { useParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { StatusPill } from "@/components/status-pill";
import { useApi } from "@/hooks/use-api";
import { useSession } from "@/lib/session";
import { fmtD } from "@/lib/format";
import type { TripDetail } from "@/lib/types";
import { StatusChangeDialog } from "@/components/trips/status-change-dialog";
import { ClearancePanel } from "@/components/trips/clearance-panel";
import { NotesPanel } from "@/components/trips/notes-panel";
import { HandoverPanel } from "@/components/trips/handover-panel";
import { ChecklistPanel } from "@/components/trips/checklist-panel";
import { BookingsPanel } from "@/components/trips/bookings-panel";
import { VisaPanel } from "@/components/trips/visa-panel";
import { TransportPanel } from "@/components/trips/transport-panel";

const BOOKING_VISA_ROLES = new Set(["COORDINATOR", "RESERVATIONS", "TENANT_ADMIN", "MANAGER"]);
const TRANSPORT_ROLES = new Set(["COORDINATOR", "TRANSPORT", "TENANT_ADMIN", "MANAGER"]);

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-[13px]">{value ?? "—"}</div>
    </div>
  );
}

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();
  const { user } = useSession();
  const { data: trip, loading, error, reload } = useApi<TripDetail>(`/api/trips/${tripId}`);

  const canEdit = user?.role === "COORDINATOR";
  const canSeeBookingsVisa = !!user?.role && BOOKING_VISA_ROLES.has(user.role);
  const canSeeTransport = !!user?.role && TRANSPORT_ROLES.has(user.role);

  if (loading) return <div className="text-sm text-muted-foreground">Loading trip…</div>;
  if (error || !trip) {
    return (
      <div>
        <Button variant="outline" className="border-border" onClick={() => router.back()}>
          ← Back
        </Button>
        <div className="mt-4 text-sm text-destructive">Could not load this trip — it may not exist, or you may not have access.</div>
      </div>
    );
  }

  return (
    <div>
      <Button variant="outline" size="sm" className="mb-3 border-border" onClick={() => router.back()}>
        ← Back
      </Button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">{trip.trip_no}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {trip.guest?.name ?? "—"} · {fmtD(trip.arrival_date)} → {fmtD(trip.departure_date)}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <StatusPill status={trip.status} />
          {canEdit && <StatusChangeDialog tripId={trip.id} allowed={trip.allowed_next_statuses} onDone={reload} />}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="guest">Guest</TabsTrigger>
          <TabsTrigger value="companions">Companions ({trip.companions.length})</TabsTrigger>
          <TabsTrigger value="clearance">Clearance</TabsTrigger>
          {canSeeBookingsVisa && <TabsTrigger value="bookings">Bookings</TabsTrigger>}
          {canSeeBookingsVisa && <TabsTrigger value="visa">Visa</TabsTrigger>}
          {canSeeTransport && <TabsTrigger value="transport">Transport</TabsTrigger>}
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="handover">Handover</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Panel title="Trip Overview">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Arrival" value={fmtD(trip.arrival_date)} />
              <Field label="Departure" value={fmtD(trip.departure_date)} />
              <Field label="Package" value={trip.package ? `${trip.package.code} — ${trip.package.label}` : null} />
              <Field label="Agent" value={trip.agent?.name} />
              <Field label="Package Flag" value={trip.package_flag.replace("_", " ")} />
              <Field label="Group" value={trip.group_id ? "Yes" : "Individual"} />
            </div>
            {trip.notes && (
              <div className="mt-4 border-t border-border pt-4">
                <Field label="Special notes" value={trip.notes} />
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="guest">
          <Panel title="Guest">
            {trip.guest ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Full name" value={trip.guest.name} />
                  <Field label="Membership no." value={trip.guest.membership_no} />
                  <Field label="Nationality" value={trip.guest.nationality} />
                  <Field label="Mobile" value={trip.guest.mobile} />
                  <Field label="WhatsApp" value={trip.guest.whatsapp} />
                  <Field label="Email" value={trip.guest.email} />
                  <Field label="Passport no." value={trip.guest.passport_no} />
                  <Field label="Passport expiry" value={fmtD(trip.guest.passport_expiry)} />
                  <Field label="Date of birth" value={fmtD(trip.guest.dob)} />
                  <Field label="Visa status" value={trip.guest.visa_status} />
                </div>
                <div className="mt-4 border-t border-border pt-4">
                  <div className="mb-3 text-xs tracking-wide text-[var(--rcgm-gold-soft)] uppercase">VIP Preferences</div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Dietary" value={trip.guest.preferences?.dietary} />
                    <Field label="Beverage" value={trip.guest.preferences?.beverage} />
                    <Field label="Room" value={trip.guest.preferences?.room} />
                    <Field label="Language" value={trip.guest.preferences?.language} />
                    <Field label="VIP level" value={trip.guest.preferences?.vip_level} />
                    <Field label="Signboard name" value={trip.guest.preferences?.signboard_name} />
                  </div>
                  {trip.guest.preferences?.notes && (
                    <div className="mt-3">
                      <Field label="Service notes" value={trip.guest.preferences.notes} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">No guest record.</div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="companions">
          <Panel title="Companions">
            {trip.companions.length === 0 && <div className="text-[13px] text-muted-foreground">No companions on this trip.</div>}
            <div className="space-y-3">
              {trip.companions.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-[var(--rcgm-navy3)] p-3.5">
                  <div className="mb-2.5 font-semibold">{c.name}</div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Relationship" value={c.relationship} />
                    <Field label="Nationality" value={c.nationality} />
                    <Field label="Passport no." value={c.passport_no} />
                    <Field label="Passport expiry" value={fmtD(c.passport_expiry)} />
                    <Field label="Date of birth" value={fmtD(c.dob)} />
                    <Field label="Visa status" value={c.visa_status} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="clearance">
          <ClearancePanel trip={trip} canRecord={canEdit} onDone={reload} />
        </TabsContent>

        {canSeeBookingsVisa && (
          <TabsContent value="bookings">
            <BookingsPanel trip={trip} />
          </TabsContent>
        )}

        {canSeeBookingsVisa && (
          <TabsContent value="visa">
            <VisaPanel trip={trip} />
          </TabsContent>
        )}

        {canSeeTransport && (
          <TabsContent value="transport">
            <TransportPanel trip={trip} />
          </TabsContent>
        )}

        <TabsContent value="checklist">
          <ChecklistPanel tripId={trip.id} checklist={trip.checklist} canEdit={canEdit} onDone={reload} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesPanel trip={trip} canEdit={canEdit} onDone={reload} />
        </TabsContent>

        <TabsContent value="handover">
          <HandoverPanel trip={trip} canEdit={canEdit} onDone={reload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
