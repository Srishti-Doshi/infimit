from groq import Groq
import time

from app.config import Settings
from app.services.metrics_service import MODEL_LOADED, MODEL_LOAD_DURATION

_groq_client = None


def get_groq_client():
    global _groq_client

    # Return cached client
    if _groq_client is not None:
        return _groq_client

    # Load config at runtime (safe for Docker/FastAPI lifecycle)
    settings = Settings()

    api_key = settings.GROQ_API_KEY
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing or not loaded from environment")

    start_time = time.time()

    try:
        client = Groq(api_key=api_key)

        # Assign only after successful creation (important safety improvement)
        _groq_client = client

        # Metrics (non-blocking safe pattern)
        try:
            MODEL_LOADED.labels(model="llama-3.3-70b-versatile").set(1)
            MODEL_LOAD_DURATION.labels(
                model="llama-3.3-70b-versatile"
            ).observe(time.time() - start_time)
        except Exception:
            # metrics failure should NEVER break app
            pass

    except Exception as e:
        raise RuntimeError(f"Failed to initialize Groq client: {e}")

    return _groq_client