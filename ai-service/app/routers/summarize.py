import time
from fastapi import APIRouter, HTTPException , Request
from app.schemas.summarize import SummaryRequest
from app.services.summarize_service import summarize_text
from app.services.logger import log_request
from app.middleware.rate_limiter import is_rate_limited

router = APIRouter()

@router.post("/summarize")
def summarize(data: SummaryRequest, request: Request):
    client_ip = request.client.host

    if is_rate_limited(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later."
        )

    start_time = time.time()

    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        summary = summarize_text(data.text)

        log_request(data.text, start_time, "SUCCESS")

        return {
            "success": True,
            "summary": summary,
            "word_count": len(summary.split()),
            "model": "llama3-8b-8192"
        }

    except Exception as e:

        log_request(data.text, start_time, "FAILED")

        raise HTTPException(status_code=500, detail="AI Service Error")