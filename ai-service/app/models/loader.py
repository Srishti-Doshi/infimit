import os
from groq import Groq

_groq_client = None


def get_groq_client():
    global _groq_client

    if _groq_client is not None:
        return _groq_client

    _groq_client = Groq(
        api_key=os.getenv("GROQ_API_KEY")
    )

    return _groq_client