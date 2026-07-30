"use client";

import { useEffect, useState } from "react";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { fmtDT } from "@/lib/format";
import { useSession } from "@/lib/session";

interface AuditEvent {
  id: string;
  username: string;
  role: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  trip_id: string | null;
  description: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditPage {
  items: AuditEvent[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

const ACTIONS = [
  "LOGIN", "LOGIN_FAILED", "LOGOUT",
  "TRIP_CREATED", "DRAFT_SAVED", "TRIP_SUBMITTED", "TRIP_EDIT", "STATUS_CHANGE", "CLEARED_TO_BOOK",
  "CHECKLIST_NA", "CHECKLIST_NA_CLEARED", "HANDOVER_SET", "HANDOVER_ACK", "NOTE",
  "BOOKING_ADDED", "BOOKING_EDIT", "BOOKING_CONFIRMED", "BOOKING_CANCELLED", "VISA_UPDATE",
  "LEG_ADDED", "LEG_EDIT", "LEG_COMPLETED", "LEG_CANCELLED", "LEG_VEHICLE_CONFLICT_OVERRIDE",
  "GROUP_CREATED", "GROUP_ASSIGNED", "EXPENSE_GENERATED", "PACKAGE_FLAG_SET",
  "GUEST_LINK_CREATED", "GUEST_LINK_REVOKED", "FILE_UPLOADED", "FILE_DELETED",
  "MASTER_ADD", "MASTER_EDIT", "MASTER_DEACTIVATE", "MASTER_REACTIVATE",
  "USER_CREATED", "USER_DEACTIVATED", "USER_REACTIVATED", "PERMISSION_CHANGE", "SETTINGS_CHANGE",
  "PAYMENT_STATUS", "TENANT_CREATED", "TENANT_DEACTIVATED", "TENANT_REACTIVATED",
];

export default function AuditPage() {
  const { user } = useSession();
  const isPlatform = user?.role === "SUPER_ADMIN";

  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [username, setUsername] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: "25" });
    if (!isPlatform) {
      if (username.trim()) params.set("username", username.trim());
      if (action) params.set("action", action);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
    }
    const path = isPlatform ? `/api/audit/platform?${params}` : `/api/audit?${params}`;
    apiFetch<AuditPage>(path)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }

  useEffect(load, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters() {
    setPage(1);
    load();
  }

  const items = data?.items ?? [];

  return (
    <div>
      <PageHead
        title="Audit Log"
        subtitle={isPlatform ? "Platform-level history across all tenants" : "Append-only history of every mutation, tenant-scoped"}
      />

      {!isPlatform && (
        <Panel title="Filters">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">Username contains</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">Action</Label>
              <Select value={action} onValueChange={(v) => setAction(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— any —" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">From date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-muted-foreground">To date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-border"
              onClick={() => {
                setUsername("");
                setAction("");
                setDateFrom("");
                setDateTo("");
                setPage(1);
                setTimeout(load, 0);
              }}
            >
              Clear
            </Button>
            <Button size="sm" onClick={applyFilters}>
              Apply filters
            </Button>
          </div>
        </Panel>
      )}

      <Panel title={`Events${data ? ` (${data.total})` : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No events found.
                </TableCell>
              </TableRow>
            )}
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{fmtDT(e.created_at)}</TableCell>
                <TableCell>{e.username}</TableCell>
                <TableCell className="text-muted-foreground">{e.role}</TableCell>
                <TableCell className="font-mono text-[11px]">{e.action}</TableCell>
                <TableCell className="max-w-[420px] whitespace-normal">{e.description ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{e.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data && data.total_pages > 1 && (
          <div className="mt-3.5 flex items-center justify-between text-[12.5px] text-muted-foreground">
            <span>
              Page {data.page} of {data.total_pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-border"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-border"
                disabled={page >= data.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
