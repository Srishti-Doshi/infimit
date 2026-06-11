import logging
from fastapi import FastAPI

from app.routers.summarize import router as summarize_router
from app.routers.health import router as health_router
from app.routers.metrics import router as metrics_router
from app.middleware.auth_middleware import AuthMiddleware
from app.config import settings

app = FastAPI()

# Routers
app.include_router(summarize_router, prefix="/v1", tags=["Summarize"])
app.include_router(health_router, prefix="/v1", tags=["Health"])
app.include_router(metrics_router, prefix="/v1", tags=["Metrics"])
app.add_middleware(AuthMiddleware)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print("Server starting on port:", settings.PORT)