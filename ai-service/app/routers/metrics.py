from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from prometheus_client import generate_latest

router = APIRouter()

@router.get("/metrics")
def metrics():
    return PlainTextResponse(
        generate_latest().decode("utf-8")
    )