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
import { useSession } from "@/lib/session";
import type { TripDetail } from "@/lib/types";
import { DocumentControl } from "./document-control";

const PAY_STATUSES = ["Pending", "Paid", "Partially Paid", "Outstanding"];
const OTHER = "__other__";

interface FlightBooking {
  id: string;
  booking_no: string;
  level: string;
  airline_name: string;
  travel_class: string;
  flight_numbers: string;
  pnr: string | null;
  route: string | null;
  ticket_count: number;
  currency: string;
  amount: number | null;
  lkr_equivalent: number | null;
  payment_status: string;
  booking_status: string;
  cancellation_charge: number | null;
  cancellation_reason: string | null;
}

interface HotelBooking {
  id: string;
  booking_no: string;
  level: string;
  hotel_name: string;
  room_type: string;
  room_count: number;
  night_count: number;
  check_in: string;
  check_out: string;
  confirmation_no: string | null;
  meal_plan: string | null;
  currency: string;
  amount: number | null;
  lkr_equivalent: number | null;
  payment_status: string;
  booking_status: string;
  cancellation_charge: number | null;
  cancellation_reason: string | null;
}

interface Catalog {
  id: string;
  name: string;
  room_types?: string[];
  is_active: boolean;
}
interface Currency {
  id: string;
  code: string;
  is_active: boolean;
}

function bkStatusPill(s: string) {
  if (s === "Confirmed") return <Pill tone="green">Confirmed</Pill>;
  if (s === "Cancelled") return <Pill tone="red">Cancelled</Pill>;
  return <Pill tone="amber">Draft</Pill>;
}
function payPill(s: string) {
  if (s === "Paid") return <Pill tone="green">Paid</Pill>;
  if (s === "Partially Paid") return <Pill tone="amber">Partial</Pill>;
  if (s === "Outstanding") return <Pill tone="red">Outstanding</Pill>;
  return <Pill tone="grey">Pending</Pill>;
}

const BLANK_FLIGHT = {
  level: "guest",
  airline: "",
  airlineOther: "",
  fclass: "",
  flightNos: "",
  pnr: "",
  route: "",
  tickets: "1",
  arriveDT: "",
  returnDT: "",
  currency: "LKR",
  amount: "",
  lkrEquiv: "",
};
const BLANK_HOTEL = {
  level: "guest",
  hotel: "",
  hotelOther: "",
  roomType: "",
  rooms: "1",
  nights: "1",
  checkin: "",
  checkout: "",
  confirmationNo: "",
  mealPlan: "",
  rate: "",
  currency: "LKR",
  amount: "",
  lkrEquiv: "",
};

export function BookingsPanel({ trip }: { trip: TripDetail }) {
  const { user } = useSession();
  const role = user?.role;
  const canEdit = role === "COORDINATOR" || role === "RESERVATIONS";
  const canPay = !!user?.can_mark_paid;

  const [flights, setFlights] = useState<FlightBooking[]>([]);
  const [hotels, setHotels] = useState<HotelBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [airlines, setAirlines] = useState<Catalog[]>([]);
  const [hotelCatalog, setHotelCatalog] = useState<Catalog[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  const [flightOpen, setFlightOpen] = useState(false);
  const [flightForm, setFlightForm] = useState(BLANK_FLIGHT);
  const [hotelOpen, setHotelOpen] = useState(false);
  const [hotelForm, setHotelForm] = useState(BLANK_HOTEL);
  const [saving, setSaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<{ type: "flight" | "hotel"; id: string } | null>(null);
  const [cancelCharge, setCancelCharge] = useState("0");
  const [cancelChargeLkr, setCancelChargeLkr] = useState("0");
  const [cancelReason, setCancelReason] = useState("");

  const [payTarget, setPayTarget] = useState<{ type: "flight" | "hotel"; id: string } | null>(null);
  const [payStatus, setPayStatus] = useState("Pending");
  const [payMethod, setPayMethod] = useState("");
  const [payDate, setPayDate] = useState("");

  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const canSeeDocs = role === "COORDINATOR" || role === "RESERVATIONS" || role === "TENANT_ADMIN";

  function load() {
    setLoading(true);
    Promise.all([
      apiFetch<FlightBooking[]>(`/api/bookings/flights?trip_id=${trip.id}`).catch(() => []),
      apiFetch<HotelBooking[]>(`/api/bookings/hotels?trip_id=${trip.id}`).catch(() => []),
    ])
      .then(([f, h]) => {
        setFlights(f);
        setHotels(h);
      })
      .finally(() => setLoading(false));
  }

  function loadDocs() {
    if (!canSeeDocs) return;
    listTripDocuments(trip.id)
      .then((all) => setDocs(all.filter((d) => d.owner_type === "booking" && d.category === "invoice")))
      .catch(() => setDocs([]));
  }

  useEffect(load, [trip.id]);
  useEffect(loadDocs, [trip.id, canSeeDocs]);

  async function attachInvoice(bookingId: string, file: File) {
    const err = validateUploadFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadingFor(bookingId);
    try {
      await uploadDocument({ file, ownerType: "booking", ownerId: bookingId, category: "invoice", tripId: trip.id });
      toast.success("Invoice uploaded");
      loadDocs();
    } catch (err2) {
      toast.error(err2 instanceof ApiError ? err2.message : "Failed to upload invoice.");
    } finally {
      setUploadingFor(null);
    }
  }

  useEffect(() => {
    if (!canEdit || !trip.clearance) return;
    apiFetch<Catalog[]>("/api/master-data/airlines").then(setAirlines).catch(() => setAirlines([]));
    apiFetch<Catalog[]>("/api/master-data/hotels").then(setHotelCatalog).catch(() => setHotelCatalog([]));
    apiFetch<Currency[]>("/api/master-data/currencies").then(setCurrencies).catch(() => setCurrencies([]));
  }, [canEdit, trip.clearance]);

  const currencyCodes = currencies.filter((c) => c.is_active).map((c) => c.code);
  const currencyOptions = currencyCodes.length ? currencyCodes : ["LKR"];

  function openFlight() {
    setFlightForm(BLANK_FLIGHT);
    setFlightOpen(true);
  }
  function openHotel() {
    setHotelForm(BLANK_HOTEL);
    setHotelOpen(true);
  }

  async function submitFlight() {
    const airlineName = flightForm.airline === OTHER ? flightForm.airlineOther.trim() : flightForm.airline;
    if (!airlineName || !flightForm.fclass.trim() || !flightForm.flightNos.trim()) {
      toast.error("Airline, class and flight number(s) are required.");
      return;
    }
    if (flightForm.amount === "" || flightForm.lkrEquiv === "") {
      toast.error("Amount and LKR equivalent are required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/bookings/flights", {
        method: "POST",
        json: {
          trip_id: trip.id,
          level: flightForm.level,
          airline_name: airlineName,
          travel_class: flightForm.fclass.trim(),
          flight_numbers: flightForm.flightNos.trim(),
          pnr: flightForm.pnr.trim() || undefined,
          route: flightForm.route.trim() || undefined,
          ticket_count: Number(flightForm.tickets) || 1,
          arrival_datetime: flightForm.arriveDT || undefined,
          return_datetime: flightForm.returnDT || undefined,
          currency: flightForm.currency,
          amount: Number(flightForm.amount),
          lkr_equivalent: Number(flightForm.lkrEquiv),
        },
      });
      toast.success("Flight booking added");
      setFlightOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add flight booking.");
    } finally {
      setSaving(false);
    }
  }

  async function submitHotel() {
    const hotelName = hotelForm.hotel === OTHER ? hotelForm.hotelOther.trim() : hotelForm.hotel;
    if (!hotelName || !hotelForm.roomType.trim() || !hotelForm.checkin || !hotelForm.checkout) {
      toast.error("Hotel, room type, check-in and check-out are required.");
      return;
    }
    if (hotelForm.checkout <= hotelForm.checkin) {
      toast.error("Check-out must be after check-in.");
      return;
    }
    if (hotelForm.lkrEquiv === "") {
      toast.error("LKR equivalent is required.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/bookings/hotels", {
        method: "POST",
        json: {
          trip_id: trip.id,
          level: hotelForm.level,
          hotel_name: hotelName,
          room_type: hotelForm.roomType.trim(),
          room_count: Number(hotelForm.rooms) || 1,
          night_count: Number(hotelForm.nights) || 1,
          check_in: hotelForm.checkin,
          check_out: hotelForm.checkout,
          confirmation_no: hotelForm.confirmationNo.trim() || undefined,
          meal_plan: hotelForm.mealPlan.trim() || undefined,
          rate_per_night: hotelForm.rate === "" ? undefined : Number(hotelForm.rate),
          currency: hotelForm.currency,
          amount: hotelForm.amount === "" ? undefined : Number(hotelForm.amount),
          lkr_equivalent: Number(hotelForm.lkrEquiv),
        },
      });
      toast.success("Hotel booking added");
      setHotelOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add hotel booking.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmBooking(type: "flight" | "hotel", id: string) {
    try {
      await apiFetch(`/api/bookings/${type === "flight" ? "flights" : "hotels"}/${id}/confirm`, { method: "POST" });
      toast.success("Booking confirmed");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to confirm booking.");
    }
  }

  async function doCancelBooking() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    try {
      await apiFetch(`/api/bookings/${cancelTarget.type === "flight" ? "flights" : "hotels"}/${cancelTarget.id}/cancel`, {
        method: "POST",
        json: { charge: Number(cancelCharge) || 0, charge_lkr: Number(cancelChargeLkr) || 0, reason: cancelReason.trim() },
      });
      toast.success("Booking cancelled");
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to cancel booking.");
    }
  }

  async function doPayBooking() {
    if (!payTarget) return;
    try {
      await apiFetch(`/api/bookings/${payTarget.type === "flight" ? "flights" : "hotels"}/${payTarget.id}/payment`, {
        method: "POST",
        json: { status: payStatus, method: payMethod.trim() || undefined, payment_date: payDate || undefined },
      });
      toast.success("Payment recorded");
      setPayTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record payment.");
    }
  }

  function laneTable(type: "flight" | "hotel", rows: (FlightBooking | HotelBooking)[]) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Booking</TableHead>
            <TableHead>Cost</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No {type} bookings yet.
              </TableCell>
            </TableRow>
          )}
          {rows.map((b) => {
            const isFlight = type === "flight";
            const fb = b as FlightBooking;
            const hb = b as HotelBooking;
            const what = isFlight
              ? `${fb.airline_name} ${fb.flight_numbers}${fb.pnr ? ` · PNR ${fb.pnr}` : ""} · ${fb.ticket_count} tkt${fb.route ? ` · ${fb.route}` : ""}`
              : `${hb.hotel_name} · ${hb.room_type} · ${hb.room_count} rm × ${hb.night_count} nt${hb.confirmation_no ? ` · Conf ${hb.confirmation_no}` : ""}`;
            return (
              <TableRow key={b.id} className={b.booking_status === "Cancelled" ? "opacity-55" : undefined}>
                <TableCell>
                  <div className="font-semibold">
                    {b.booking_no}
                    {b.level === "group" && (
                      <span className="ml-2 rounded bg-[var(--rcgm-navy3)] px-1.5 py-0.5 text-[10px] tracking-wide uppercase text-muted-foreground">
                        Group — shared
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{what}</div>
                  {b.booking_status === "Cancelled" && b.cancellation_charge != null && (
                    <div className="text-[12px] text-destructive">
                      Cancellation charge: {b.cancellation_charge.toLocaleString()} — {b.cancellation_reason}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {b.amount != null ? `${b.currency} ${b.amount.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell>{payPill(b.payment_status)}</TableCell>
                <TableCell>{bkStatusPill(b.booking_status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {canEdit && b.booking_status !== "Cancelled" && (
                      <>
                        {b.booking_status === "Draft" && (
                          <Button size="sm" variant="outline" className="border-border" onClick={() => confirmBooking(type, b.id)}>
                            Confirm
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-border"
                          onClick={() => {
                            setPayTarget({ type, id: b.id });
                            setPayStatus(b.payment_status);
                            setPayMethod("");
                            setPayDate("");
                          }}
                        >
                          Payment
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-border text-destructive"
                          onClick={() => {
                            setCancelTarget({ type, id: b.id });
                            setCancelCharge("0");
                            setCancelChargeLkr("0");
                            setCancelReason("");
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {canSeeDocs && (
                      <DocumentControl
                        label="Invoice"
                        doc={docs.find((d) => d.owner_id === b.id)}
                        canUpload={canEdit}
                        uploading={uploadingFor === b.id}
                        onUpload={(file) => attachInvoice(b.id, file)}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  if (!trip.clearance) {
    return (
      <Panel title="Booking Lanes">
        <p className="text-[13px] text-muted-foreground">🔒 Locked — lanes open once Cleared-to-Book is recorded.</p>
      </Panel>
    );
  }

  const selectedHotel = hotelCatalog.find((h) => h.name === hotelForm.hotel);
  const roomTypeOptions = selectedHotel?.room_types?.length ? selectedHotel.room_types : ["Standard"];

  return (
    <>
      <Panel title="Flight Lane" actions={canEdit ? <Button onClick={openFlight}>+ Flight booking</Button> : undefined}>
        {laneTable("flight", flights)}
      </Panel>
      <Panel title="Hotel Lane" actions={canEdit ? <Button onClick={openHotel}>+ Hotel booking</Button> : undefined}>
        {laneTable("hotel", hotels)}
      </Panel>

      <Dialog open={flightOpen} onOpenChange={setFlightOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add flight booking</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={flightForm.level} onValueChange={(v) => v && setFlightForm((s) => ({ ...s, level: v }))}>
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
              <Label>Airline *</Label>
              <Select value={flightForm.airline} onValueChange={(v) => v && setFlightForm((s) => ({ ...s, airline: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— select —" />
                </SelectTrigger>
                <SelectContent>
                  {airlines.filter((a) => a.is_active).map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other</SelectItem>
                </SelectContent>
              </Select>
              {flightForm.airline === OTHER && (
                <Input
                  className="mt-1.5"
                  placeholder="Type airline name"
                  value={flightForm.airlineOther}
                  onChange={(e) => setFlightForm((s) => ({ ...s, airlineOther: e.target.value }))}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Class *</Label>
              <Input placeholder="Economy / Business" value={flightForm.fclass} onChange={(e) => setFlightForm((s) => ({ ...s, fclass: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Flight number(s) *</Label>
              <Input placeholder="UL196 / UL195" value={flightForm.flightNos} onChange={(e) => setFlightForm((s) => ({ ...s, flightNos: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>PNR (required to confirm)</Label>
              <Input value={flightForm.pnr} onChange={(e) => setFlightForm((s) => ({ ...s, pnr: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tickets *</Label>
              <Input type="number" min={1} value={flightForm.tickets} onChange={(e) => setFlightForm((s) => ({ ...s, tickets: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Route</Label>
              <Input placeholder="BOM → CMB" value={flightForm.route} onChange={(e) => setFlightForm((s) => ({ ...s, route: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Arrival date/time</Label>
              <Input type="datetime-local" value={flightForm.arriveDT} onChange={(e) => setFlightForm((s) => ({ ...s, arriveDT: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Return date/time</Label>
              <Input type="datetime-local" value={flightForm.returnDT} onChange={(e) => setFlightForm((s) => ({ ...s, returnDT: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency *</Label>
              <Select
                value={flightForm.currency}
                onValueChange={(v) => v && setFlightForm((s) => ({ ...s, currency: v, lkrEquiv: v === "LKR" ? s.amount : s.lkrEquiv }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input
                type="number"
                min={0}
                value={flightForm.amount}
                onChange={(e) => {
                  const amount = e.target.value;
                  setFlightForm((s) => ({ ...s, amount, lkrEquiv: s.currency === "LKR" ? amount : s.lkrEquiv }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>LKR equivalent *</Label>
              <Input type="number" min={0} value={flightForm.lkrEquiv} onChange={(e) => setFlightForm((s) => ({ ...s, lkrEquiv: e.target.value }))} />
            </div>
          </div>
          <p className="text-[12.5px] text-muted-foreground">Payment status starts as Pending — use the Payment control on the lane after saving.</p>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setFlightOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={submitFlight}>
              {saving ? "Saving…" : "Add booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hotelOpen} onOpenChange={setHotelOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add hotel booking</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={hotelForm.level} onValueChange={(v) => v && setHotelForm((s) => ({ ...s, level: v }))}>
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
              <Label>Hotel *</Label>
              <Select value={hotelForm.hotel} onValueChange={(v) => v && setHotelForm((s) => ({ ...s, hotel: v, roomType: "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— select —" />
                </SelectTrigger>
                <SelectContent>
                  {hotelCatalog.filter((h) => h.is_active).map((h) => (
                    <SelectItem key={h.id} value={h.name}>
                      {h.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other</SelectItem>
                </SelectContent>
              </Select>
              {hotelForm.hotel === OTHER && (
                <Input
                  className="mt-1.5"
                  placeholder="Type hotel name"
                  value={hotelForm.hotelOther}
                  onChange={(e) => setHotelForm((s) => ({ ...s, hotelOther: e.target.value }))}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Room type *</Label>
              <Select value={hotelForm.roomType} onValueChange={(v) => v && setHotelForm((s) => ({ ...s, roomType: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— select —" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypeOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rooms *</Label>
              <Input
                type="number"
                min={1}
                value={hotelForm.rooms}
                onChange={(e) => {
                  const rooms = e.target.value;
                  const rate = Number(hotelForm.rate) || 0;
                  const nights = Number(hotelForm.nights) || 0;
                  const amount = rate * nights * (Number(rooms) || 0);
                  setHotelForm((s) => ({ ...s, rooms, amount: amount ? String(amount) : "", lkrEquiv: s.currency === "LKR" && amount ? String(amount) : s.lkrEquiv }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nights *</Label>
              <Input
                type="number"
                min={1}
                value={hotelForm.nights}
                onChange={(e) => {
                  const nights = e.target.value;
                  const rate = Number(hotelForm.rate) || 0;
                  const rooms = Number(hotelForm.rooms) || 0;
                  const amount = rate * (Number(nights) || 0) * rooms;
                  setHotelForm((s) => ({ ...s, nights, amount: amount ? String(amount) : "", lkrEquiv: s.currency === "LKR" && amount ? String(amount) : s.lkrEquiv }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Check-in *</Label>
              <Input type="date" value={hotelForm.checkin} onChange={(e) => setHotelForm((s) => ({ ...s, checkin: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Check-out *</Label>
              <Input type="date" value={hotelForm.checkout} onChange={(e) => setHotelForm((s) => ({ ...s, checkout: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmation no. (required to confirm)</Label>
              <Input value={hotelForm.confirmationNo} onChange={(e) => setHotelForm((s) => ({ ...s, confirmationNo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Meal plan</Label>
              <Input placeholder="BB / HB / FB" value={hotelForm.mealPlan} onChange={(e) => setHotelForm((s) => ({ ...s, mealPlan: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Rate per night *</Label>
              <Input
                type="number"
                min={0}
                value={hotelForm.rate}
                onChange={(e) => {
                  const rate = e.target.value;
                  const nights = Number(hotelForm.nights) || 0;
                  const rooms = Number(hotelForm.rooms) || 0;
                  const amount = (Number(rate) || 0) * nights * rooms;
                  setHotelForm((s) => ({ ...s, rate, amount: amount ? String(amount) : "", lkrEquiv: s.currency === "LKR" && amount ? String(amount) : s.lkrEquiv }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency *</Label>
              <Select
                value={hotelForm.currency}
                onValueChange={(v) => v && setHotelForm((s) => ({ ...s, currency: v, lkrEquiv: v === "LKR" ? s.amount : s.lkrEquiv }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (auto: rate × nights × rooms)</Label>
              <Input type="number" min={0} value={hotelForm.amount} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label>LKR equivalent *</Label>
              <Input type="number" min={0} value={hotelForm.lkrEquiv} onChange={(e) => setHotelForm((s) => ({ ...s, lkrEquiv: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setHotelOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={submitHotel}>
              {saving ? "Saving…" : "Add booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">Any cancellation charge survives into the Expense Summary.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Charge</Label>
                <Input type="number" min={0} value={cancelCharge} onChange={(e) => setCancelCharge(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Charge LKR equivalent</Label>
                <Input type="number" min={0} value={cancelChargeLkr} onChange={(e) => setCancelChargeLkr(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setCancelTarget(null)}>
              Back
            </Button>
            <Button disabled={!cancelReason.trim()} onClick={doCancelBooking}>
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Payment</DialogTitle>
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
              <Label>Method (required when Paid)</Label>
              <Input placeholder="Bank transfer / Card / Cash" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            {!canPay && (payStatus === "Paid" || payStatus === "Partially Paid") && (
              <p className="text-[12.5px] text-destructive">You do not hold the Mark-Paid permission.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button onClick={doPayBooking}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
