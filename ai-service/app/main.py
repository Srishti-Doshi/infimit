import logging
from fastapi import FastAPI
from fastapi import Depends
from app.dependencies import verify_internal_key
from app.routers.summarize import router as summarize_router
from app.middleware.auth_middleware import AuthMiddleware
from fastapi import FastAPI
from app.config import settings
from app.routers.health import router as health_router
from app.routers.metrics import router as metrics_router

app = FastAPI()

app.include_router(summarize_router,
                    prefix="/v1")
# app.add_middleware(AuthMiddleware)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

#Connects health.py to the FastAPI app.
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

 

print(settings.PORT)

 
