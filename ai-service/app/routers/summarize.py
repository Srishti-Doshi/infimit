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
async def summarize(
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
        result = await summarize_text(
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

        from fastapi.responses import JSONResponse

        headers = {}
        
        if result.get("degraded"):
            headers["X-Degraded"] = "true"
        
        return JSONResponse(
            content={
                "summary": result["summary"],
                "confidence": result["confidence"],
                "model": result["model"],
                "tokensIn": result["tokensIn"],
                "tokensOut": result["tokensOut"],
                "cached": result["cached"]
            },
            headers=headers
        )

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