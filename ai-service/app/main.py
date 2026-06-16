import logging
import uuid
from fastapi import Request
from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse
from app.routers.summarize import router as summarize_router
from app.routers.health import router as health_router
from app.routers.metrics import router as metrics_router
from app.middleware.auth_middleware import AuthMiddleware
from app.config import settings
from app.models.loader import get_groq_client
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.0, 
        send_default_pii=False, 
        environment=settings.env,
                     )


# Logging setup (ONLY ONCE)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("ai-service")


# SINGLE lifespan (IMPORTANT)
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Server starting on port %s", settings.PORT)

    if settings.WARM_ON_STARTUP:
        logger.info("Warming up model...")
        get_groq_client()

    app.state.ready = True

    yield

    logger.info("Server stopping")


app = FastAPI(
    lifespan=lifespan,
    docs_url="/docs" if settings.EXPOSE_DOCS else None,
    redoc_url="/redoc" if settings.EXPOSE_DOCS else None
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())

    request.state.request_id = request_id

    response = await call_next(request)

    response.headers["X-Request-ID"] = request_id

    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):

    request_id = getattr(request.state, "request_id", "unknown")

    with sentry_sdk.push_scope() as scope:
        scope.set_tag("request_id", request_id)
        sentry_sdk.capture_exception(exc)

    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "request_id": request_id,
        },
    )


@app.get("/sentry-test")
def sentry_test():
    raise Exception("Sentry test error")

app.add_middleware(AuthMiddleware) 


# Routers
app.include_router(summarize_router, prefix="/v1", tags=["Summarize"])
app.include_router(health_router, prefix="/v1", tags=["Health"])
app.include_router(metrics_router, prefix="/v1", tags=["Metrics"])
