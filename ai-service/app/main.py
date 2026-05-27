from fastapi import FastAPI
from app.routers.summarize import router as summarize_router

app = FastAPI()

app.include_router(summarize_router)
