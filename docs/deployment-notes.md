# RCGM — Deployment Notes (future Ubuntu VPS + Docker — NOT executed in this task)

This task is scoped to a working localhost build only. Nothing below is configured or deployed
now; it documents assumptions and a forward path so the codebase is deployment-ready later,
per the brief's explicit instruction not to deploy or configure production domains yet.

## Assumptions to confirm before deployment (not verifiable from the HTML prototype)

1. Target VPS spec (CPU/RAM/disk) and Ubuntu version are not specified — assume Ubuntu 22.04/24.04
   LTS with Docker Engine + Compose plugin.
2. TLS provider (Let's Encrypt via certbot vs. a managed proxy) is not specified.
3. Backup strategy/retention for PostgreSQL and the uploads volume is not specified.
4. Whether multiple casino tenants will run on one VPS instance or one VPS per tenant is not
   specified — the multi-tenant data model supports either.
5. Object storage migration target (S3 / Cloudflare R2 / Supabase Storage / MinIO) is not chosen
   — the `StorageBackend` interface is deliberately storage-agnostic so this can be decided later
   without an application rewrite.
6. Domain name(s) and email sender (for future notification email delivery, if added) are not
   specified.

## What is already deployment-shaped in this codebase

- Both `apps/api` and `apps/web` build via multi-stage Dockerfiles producing minimal runtime
  images; no dev-only tooling ships in the runtime image.
- All configuration is environment-variable driven (`.env` / `.env.example`), nothing is
  hard-coded to `localhost`.
- `infrastructure/nginx/` contains a reference reverse-proxy config (TLS termination points,
  upload size limits, gzip, security headers) to adapt with real certificates and server_name
  values when a domain is assigned.
- Health check endpoints (`/api/health`, `/api/health/ready`) are ready for a container
  orchestrator or `docker compose healthcheck` in production.
- Database migrations are managed by Alembic and run automatically on container start, safe to
  run repeatedly (idempotent `upgrade head`).

## Explicit non-actions in this task

- No domain purchased/configured, no DNS records, no TLS certificates issued.
- No VPS provisioned or accessed.
- No production secrets generated or stored anywhere in this repository.
- No CI/CD pipeline targeting production.
