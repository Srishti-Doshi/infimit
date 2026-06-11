from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class AuthMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next):

        public_paths = [
            "/docs",
           "/openapi.json",
            "/v1/healthz",
            "/v1/readyz"
        ]

        if request.url.path in public_paths:
            return await call_next(request)
        

        auth_header = request.headers.get("X-Internal-Key")

        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Authorization token required"}
            )

        return await call_next(request)


         