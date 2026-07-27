#!/bin/sh
set -e

echo "[rcgm-api] waiting for database migrations..."
alembic upgrade head

echo "[rcgm-api] running idempotent development seed..."
python -m scripts.seed || echo "[rcgm-api] seed skipped/failed (non-fatal in this build step)"

echo "[rcgm-api] starting application: $@"
exec "$@"
