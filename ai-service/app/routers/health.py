from fastapi import APIRouter
import time
import platform

from app.models.loader import get_groq_client
from fastapi import HTTPException
from app.config import settings

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
    try:
        get_groq_client()
        return {
            "ready": True,
            "models": {
                "summarize": "loaded"
            }
        }
    except Exception as e:
        if settings.READY_REQUIRES_MODEL:
            raise HTTPException(
                status_code=503,
                detail="Groq unavailable"
            )

        return {
            "ready": False,
            "models": {
                "summarize": "not_loaded"
            },
            "error": str(e)
        }