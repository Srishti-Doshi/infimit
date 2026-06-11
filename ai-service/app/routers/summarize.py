import time
from fastapi import APIRouter, HTTPException, Request, Depends

from app.dependencies import verify_internal_key
from app.schemas.summarize import SummarizeRequest, SummarizeResponse
from app.services.summarize_service import summarize_text

from app.services.logger import log_request
from app.services.metrics_service import (
    increment_total_requests,
    increment_successful_requests,
    increment_failed_requests
)
from app.middleware.rate_limiter import is_rate_limited

router = APIRouter()

@router.post("/summarize", response_model=SummarizeResponse)
def summarize(
    data: SummarizeRequest,
    request: Request,
    _: bool = Depends(verify_internal_key)
):
    client_ip = request.client.host

    if is_rate_limited(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later."
        )

    start_time = time.time()
    increment_total_requests()

    try:
        result = summarize_text(
            text=data.text,
            max_words=data.maxWords,
            style=data.style
        )

        increment_successful_requests()

        log_request(
            data.text,
            start_time,
            "SUCCESS"
        )

        return {
            "summary": result,
            "confidence": 0.9,
            "model": "llama-3.3-70b-versatile",
            "tokensIn": len(data.text.split()),
            "tokensOut": len(result.split()),
            "cached": False
        }

    except Exception as e:
        increment_failed_requests()

        log_request(
            data.text,
            start_time,
            "FAILED"
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )