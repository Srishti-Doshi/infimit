import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.dependencies import verify_internal_key
from app.routers.summarize import router as summarize_router
from app.middleware.auth_middleware import AuthMiddleware
from app.config import settings
from app.routers.health import router as health_router
from app.routers.metrics import router as metrics_router

app = FastAPI()

# ✅ CORS Middleware (ADD THIS BEFORE ROUTERS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(summarize_router, prefix="/v1")

app.include_router(
    health_router,
    prefix="/v1",
    tags=["Health"]
)

app.include_router(
    metrics_router,
    prefix="/v1",
    tags=["Metrics"]
)

# Middleware (optional)
# app.add_middleware(AuthMiddleware)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print(settings.PORT)