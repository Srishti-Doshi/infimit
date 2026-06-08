from fastapi import APIRouter
import time
import platform

from app.models.loader import get_groq_client

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
        return {
            "ready": False,
            "models": {
                "summarize": "not_loaded"
            },
            "error": str(e)
        }