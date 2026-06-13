from groq import Groq
from app.config import settings

_groq_client = None

def get_groq_client():
    global _groq_client

    if _groq_client is not None:
        return _groq_client

    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is missing or not loaded from .env")

    _groq_client = Groq(
        api_key=settings.GROQ_API_KEY
    )

    return _groq_client