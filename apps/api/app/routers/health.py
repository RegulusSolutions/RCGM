import os

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db

router = APIRouter(prefix="/api/health", tags=["health"])
settings = get_settings()


@router.get("")
def liveness():
    return {"status": "ok"}


@router.get("/ready")
def readiness(db: Session = Depends(get_db)):
    checks = {"database": "unknown", "storage": "unknown"}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    try:
        os.makedirs(settings.upload_storage_dir, exist_ok=True)
        test_path = os.path.join(settings.upload_storage_dir, ".health_check")
        with open(test_path, "w") as f:
            f.write("ok")
        os.remove(test_path)
        checks["storage"] = "ok"
    except Exception:
        checks["storage"] = "error"

    healthy = all(v == "ok" for v in checks.values())
    return {"status": "ok" if healthy else "degraded", "checks": checks}
