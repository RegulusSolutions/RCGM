# RCGM — Deployment Notes (Ubuntu VPS + Docker)

This task is scoped to a working localhost build first. Nothing in this repo has touched the
live system nginx config or issued any certificate — deployment is deliberately deferred.

## Current status (2026-07-30)

- **Target VPS is this machine** (`vmi3185062.contaboserver.net`, `217.15.165.57`) — it already
  runs several other client sites behind system nginx + certbot (one vhost per domain in
  `/etc/nginx/sites-available`), so any nginx change here must not disturb those.
- **`rcgm.reguluscompliance.com` does not resolve yet.** `reguluscompliance.com` is on Cloudflare
  DNS (nameservers `alina`/`bjorn.ns.cloudflare.com`), but no `rcgm` host record exists. DNS must
  be added (A record → `217.15.165.57`) before an nginx vhost + TLS cert can go live for it.
- Local dev already runs on this host via `docker compose`, bound to `127.0.0.1` only on ports
  `3011` (web) and `8010` (api) — chosen instead of the stack defaults `3000`/`8000` because both
  were already in use by other services on this VPS (see `.env`).
- A ready-to-use nginx vhost for this exact domain/port pair is checked in at
  `infrastructure/nginx/rcgm.reguluscompliance.com.conf`, following the same pattern as the other
  sites already configured on this box. It is **not** installed into `/etc/nginx` yet — the file
  itself documents the exact steps to do so once DNS resolves.

## Remaining assumptions to confirm before deployment

1. Backup strategy/retention for PostgreSQL and the uploads volume is not specified.
2. Whether multiple casino tenants will run on this VPS instance alongside RCGM, or one VPS per
   tenant, is not specified — the multi-tenant data model supports either.
3. Object storage migration target (S3 / Cloudflare R2 / Supabase Storage / MinIO) is not chosen
   — the `StorageBackend` interface is deliberately storage-agnostic so this can be decided later
   without an application rewrite.
4. Email sender (for future notification email delivery, if ever added — not part of this brief)
   is not specified.

## What is already deployment-shaped in this codebase

- Both `apps/api` and `apps/web` build via multi-stage Dockerfiles producing minimal runtime
  images; no dev-only tooling ships in the runtime image.
- All configuration is environment-variable driven (`.env` / `.env.example`), nothing is
  hard-coded to `localhost`.
- `infrastructure/nginx/rcgm.reguluscompliance.com.conf` contains a ready-to-install reverse-proxy
  vhost (HTTP-01 challenge path, `proxy_pass` to the `web` container, upload size limit) matching
  the exact pattern already used by other sites on this VPS; certbot fills in the TLS block on
  first run, as it did for those.
- Health check endpoints (`/api/health`, `/api/health/ready`) are ready for a container
  orchestrator or `docker compose healthcheck` in production.
- Database migrations are managed by Alembic and run automatically on container start, safe to
  run repeatedly (idempotent `upgrade head`).

## Explicit non-actions in this task

- No DNS records added, no `/etc/nginx` files installed or symlinked, no TLS certificates issued.
- The target VPS was inspected (read-only) to confirm port availability and the existing nginx/
  certbot pattern — nothing on it was modified.
- No production secrets generated or stored anywhere in this repository.
- No CI/CD pipeline targeting production.
