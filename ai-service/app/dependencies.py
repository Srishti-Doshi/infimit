import time
import logging
from groq import Groq
from fastapi import Header, HTTPException, Depends

from app.config import Settings
from app.services.metrics_service import MODEL_LOADED, MODEL_LOAD_DURATION

logger = logging.getLogger(__name__)

# ----------------------------
# GROQ CLIENT (SINGLETON)
# ----------------------------
_groq_client = None


def get_groq_client():
    global _groq_client

    if _groq_client is not None:
        return _groq_client

    settings = Settings()

    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is missing or not loaded")

    start_time = time.time()

    try:
        _groq_client = Groq(api_key=settings.GROQ_API_KEY)

        # Metrics (safe, non-blocking)
        try:
            MODEL_LOADED.labels(model="llama-3.3-70b-versatile").set(1)
            MODEL_LOAD_DURATION.labels(
                model="llama-3.3-70b-versatile"
            ).observe(time.time() - start_time)
        except Exception:
            pass

    except Exception as e:
        raise RuntimeError(f"Failed to initialize Groq client: {e}")

    return _groq_client


# FastAPI dependency wrapper
def groq_dependency():
    return get_groq_client()


# ----------------------------
# INTERNAL AUTH DEPENDENCY
# ----------------------------
def verify_internal_key(x_internal_key: str = Header(None)):
    settings = Settings()

    if not x_internal_key:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "MISSING_INTERNAL_KEY",
                "message": "Internal key header is missing"
            }
        )

    if x_internal_key != settings.AI_INTERNAL_KEY:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "INVALID_INTERNAL_KEY",
                "message": "Invalid internal key"
            }
        )

    return True


# Optional alias for cleaner usage
InternalAuth = Depends(verify_internal_key)
GroqClient = Depends(groq_dependency)