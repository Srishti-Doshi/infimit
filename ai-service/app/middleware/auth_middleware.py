from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


class AuthMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next):

        # Public endpoints (no auth required)
        public_paths = {
            "/docs",
            "/openapi.json",
            "/v1/healthz",
            "/v1/readyz",
            "/v1/metrics",
            "/sentry-test"
        }

        if request.url.path in public_paths:
            return await call_next(request)

        # Read internal auth key
        internal_key = request.headers.get("x-internal-key")

        # Validate key
        if not internal_key or internal_key != settings.AI_INTERNAL_KEY:
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "INVALID_INTERNAL_KEY",
                        "message": "Invalid or missing internal key"
                    }
                }
            )

        # Allow request
        return await call_next(request)