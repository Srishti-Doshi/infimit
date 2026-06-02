import logging
from fastapi import FastAPI
from app.routers.summarize import router as summarize_router
from app.middleware.auth_middleware import AuthMiddleware
app = FastAPI()

app.include_router(summarize_router)
app.add_middleware(AuthMiddleware)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



 

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

 
