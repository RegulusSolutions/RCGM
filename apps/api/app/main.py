"""RCGM API entry point.

Wires together CORS, global exception handling (app/core/errors.py), and every
route group named in docs/api-reference.md. No route is registered anywhere
else — this file is the single source of truth for the API surface.
"""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.errors import register_exception_handlers
from app.deps import require_csrf_header
from app.logging_config import configure_logging
from app.routers import (
    audit,
    auth,
    bookings,
    expenses,
    files,
    groups,
    guest_links,
    guests,
    health,
    host,
    master_data,
    notifications,
    package_flag,
    public,
    reports,
    tasks,
    tenants,
    transport,
    trips,
    users,
    visas,
)

settings = get_settings()
configure_logging(settings.debug)

app = FastAPI(
    title="RCGM — Regulus Casino Guest Manager API",
    description="Backend for the casino guest travel & hospitality lifecycle: "
    "guest request → compliance clearance → visa → flight → hotel → transport → "
    "stay → expenses → completion → closure.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    # Applied to every route: on top of SameSite=Lax cookies, every mutating
    # request from the web app must also carry X-Requested-With, per
    # docs/architecture.md's CSRF strategy. A cross-site form/script cannot
    # set this custom header, so it blocks classic CSRF submissions.
    dependencies=[Depends(require_csrf_header)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
)

register_exception_handlers(app)

# ---- Route groups (see docs/api-reference.md for the full contract) --------
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(users.router)
app.include_router(guests.router)
app.include_router(trips.router)
app.include_router(groups.router)
app.include_router(bookings.router)
app.include_router(visas.router)
app.include_router(transport.router)
app.include_router(master_data.router)
app.include_router(tasks.router)
app.include_router(notifications.router)
app.include_router(files.router)
app.include_router(expenses.router)
app.include_router(package_flag.router)
app.include_router(guest_links.router)
app.include_router(public.router)
app.include_router(reports.router)
app.include_router(audit.router)
app.include_router(host.router)


@app.get("/")
def root():
    return {"service": "rcgm-api", "docs": "/docs"}
