from groq import Groq
from app.config import settings
import time

from app.services.metrics_service import (
    MODEL_LOADED,
    MODEL_LOAD_DURATION
)

_groq_client = None

def get_groq_client():
    global _groq_client

    if _groq_client is not None:
        return _groq_client

    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is missing or not loaded from .env")

    start = time.time()

    _groq_client = Groq(
        api_key=settings.GROQ_API_KEY
    )

    MODEL_LOADED.labels(
        model="llama-3.3-70b-versatile"
    ).set(1)

    MODEL_LOAD_DURATION.labels(
        model="llama-3.3-70b-versatile"
    ).observe(time.time() - start)

    return _groq_client