# Store all health-related APIs.
from fastapi import APIRouter
import time
import platform


router = APIRouter()

START_TIME = time.time()

@router.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "uptime_sec": int(time.time() - START_TIME),
        "version": "0.1.0",
        "python": platform.python_version()
    }


@router.get("/readyz")
def readyz():
    return {
        "ready": True,
        "models": {
            "summarize": "not_loaded"
        }
    }

