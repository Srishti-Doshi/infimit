import time
from fastapi import APIRouter, HTTPException , Request, Depends

# Verify internal API key before processing requests
from app.dependencies import verify_internal_key

from app.schemas.summarize import SummaryRequest
from app.services.summarize_service import summarize_text
from app.services.logger import log_request
from app.middleware.rate_limiter import is_rate_limited

router = APIRouter()

# Summarize input text using the AI model
@router.post("/summarize")
def summarize(data: SummaryRequest, request: Request,_: bool = Depends(verify_internal_key)):
   

    # Get client IP address for rate limiting
    client_ip = request.client.host


    # Block excessive requests from the same client
    if is_rate_limited(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later."
        )


     # Record request start time for logging
    start_time = time.time()

    # Validate input text
    if not data.text.strip():
        raise HTTPException(
              status_code=400, 
              detail="Text cannot be empty"
              )


    try:
        # Generate summary using AI service
        summary = summarize_text(data.text)


        log_request(data.text, start_time, "SUCCESS")
        

         # Return summarized result
        return {
            "success": True,
            "summary": summary,
            "word_count": len(summary.split()),
            "model": "llama3-8b-8192"
        }


    except Exception:
         # Log failed request
        log_request(data.text, start_time, "FAILED")
        

         # Return generic server error
        raise HTTPException(
            status_code=500, 
            detail="AI Service Error"
        )