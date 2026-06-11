from fastapi import APIRouter
from app.services.metrics_service import get_metrics

router = APIRouter(tags=["Metrics"])


@router.get("/metrics")
def metrics_endpoint():
    return get_metrics()