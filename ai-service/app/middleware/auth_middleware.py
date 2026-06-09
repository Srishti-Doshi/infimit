from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class AuthMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next):

        public_paths = [
            "/docs",
            "/openapi.json",
            "/favicon.ico",
            "/v1/health"
        ]

        if request.url.path in public_paths:
            return await call_next(request)


        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Authorization token required"}
            )

        response = await call_next(request)
        return response