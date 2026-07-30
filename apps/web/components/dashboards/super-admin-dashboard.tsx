"use client";

import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { StatCard, StatRow } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/status-pill";
import { useApi } from "@/hooks/use-api";

interface PlatformStats {
  tenants: number;
  active_tenants: number;
  users: number;
  audit_events: number;
}
interface TenantRow {
  id: string;
  code: string;
  name: string;
  location: string | null;
  is_active: boolean;
}

export function SuperAdminDashboard() {
  const { data: stats, loading } = useApi<PlatformStats>("/api/tenants/stats");
  const { data: tenants } = useApi<TenantRow[]>("/api/tenants");

  return (
    <div>
      <PageHead title="Platform Dashboard" subtitle="Regulus Compliance Solutions — cross-tenant overview" />
      <StatRow>
        <StatCard value={loading ? "…" : stats?.tenants ?? 0} label="Tenants" />
        <StatCard value={loading ? "…" : stats?.active_tenants ?? 0} label="Active Tenants" />
        <StatCard value={loading ? "…" : stats?.users ?? 0} label="Users" />
        <StatCard value={loading ? "…" : stats?.audit_events ?? 0} label="Audit Events" />
      </StatRow>
      <Panel title="Tenants">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tenants ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.code}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.location ?? "—"}</TableCell>
                <TableCell>{t.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="red">Inactive</Pill>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
