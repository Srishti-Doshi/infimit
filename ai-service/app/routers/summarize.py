import time

from fastapi import (
    APIRouter,
    HTTPException,
    Request,
    Depends,
    Response
)

from app.dependencies import verify_internal_key
from app.schemas.summarize import (
    SummarizeRequest,
    SummarizeResponse
)
from app.services.summarize_service import summarize_text
from app.services.logger import log_request

from app.services.metrics_service import (
    REQUESTS,
    REQUEST_DURATION
)

from app.middleware.rate_limiter import is_rate_limited

router = APIRouter()

@router.post(
    "/summarize",
    response_model=SummarizeResponse
)
def summarize(
    response: Response,
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

    try:
        result = summarize_text(
            text=data.text,
            max_words=data.maxWords,
            style=data.style
        )

        degraded = False
        model_name = "llama-3.3-70b-versatile"
        summary_text = result

        if isinstance(result, dict):
            degraded = result.get("degraded", False)
            model_name = result.get("model", model_name)
            summary_text = result["summary"]

        response.headers["X-Degraded"] = str(degraded).lower()

        REQUESTS.labels(
            endpoint="summarize",
            status="200",
            degraded=str(degraded).lower()
        ).inc()

        REQUEST_DURATION.labels(
            endpoint="summarize"
        ).observe(time.time() - start_time)

        log_request(
            data.text,
            start_time,
            "SUCCESS"
        )

        return {
            "summary": summary_text,
            "confidence": 0.9,
            "model": model_name,
            "tokensIn": len(data.text.split()),
            "tokensOut": len(summary_text.split()),
            "cached": False
        }

    except Exception as e:

        REQUESTS.labels(
            endpoint="summarize",
            status="500",
            degraded="false"
        ).inc()

        log_request(
            data.text,
            start_time,
            "FAILED"
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )