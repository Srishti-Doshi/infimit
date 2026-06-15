from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import dotenv_values
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    AI_INTERNAL_KEY: str
    PORT: int
    LOG_LEVEL: str
    MODELS_CACHE_DIR: str
    ENABLE_METRICS: bool
    GROQ_API_KEY: str 
    EXPOSE_DOCS: bool = True
    LRU_CAPACITY: int = 100

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()

import logging

logger = logging.getLogger(__name__)

logger.info("Environment loaded successfully")
logger.info("Metrics enabled: %s", settings.ENABLE_METRICS)