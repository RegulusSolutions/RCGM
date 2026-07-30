"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface Diagnostics {
  checks: { database: string; storage: string };
  migration_version: string | null;
  environment: string;
  counts: { users: number; guests: number; trips: number; audit_events: number };
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0">
      <span className="text-[13px]">{label}</span>
      <span className="flex items-center gap-2">
        {detail && <span className="text-[11.5px] text-muted-foreground">{detail}</span>}
        <span
          className={
            "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
            (ok ? "bg-[#173B2C] text-[#3FBF7F]" : "bg-[#3D1F1F] text-[#E25555]")
          }
        >
          {ok ? "OK" : "ERROR"}
        </span>
      </span>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    apiFetch<Diagnostics>("/api/tenants/diagnostics")
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div>
      <PageHead
        title="Diagnostics"
        subtitle="Live database, migration and file-storage health — server-side analogue of the storage self-test"
        actions={
          <Button size="sm" variant="outline" className="border-border" onClick={load} disabled={loading}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        }
      />

      {error && <div className="mb-4 text-[12.5px] text-destructive">Could not load diagnostics.</div>}

      <Panel title="System Health">
        {loading && !data ? (
          <div className="text-sm text-muted-foreground">Running checks…</div>
        ) : data ? (
          <>
            <CheckRow label="Database connectivity" ok={data.checks.database === "ok"} />
            <CheckRow
              label="Alembic migration version"
              ok={!!data.migration_version}
              detail={data.migration_version ?? "unknown"}
            />
            <CheckRow label="File storage reachability" ok={data.checks.storage === "ok"} />
            <CheckRow label="Environment" ok detail={data.environment} />
          </>
        ) : null}
      </Panel>

      {data && (
        <Panel title="Tenant Record Counts">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(data.counts).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-[var(--rcgm-navy3)] p-3.5 text-center">
                <div className="text-[22px] font-semibold text-[var(--rcgm-gold-soft)]">{v}</div>
                <div className="mt-1 text-[11.5px] text-muted-foreground capitalize">{k.replace("_", " ")}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Demo Data">
        <p className="text-[12.5px] text-muted-foreground">
          Development seed data is managed via a documented, idempotent command rather than a destructive
          in-app button:
          {" "}
          <code className="rounded bg-[var(--rcgm-navy3)] px-1 py-0.5">
            docker compose run --rm --entrypoint python api -m scripts.seed
          </code>
          . See the repository README for local reset instructions.
        </p>
      </Panel>
    </div>
  );
}
