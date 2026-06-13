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
    CACHE_SIZE: int = 1024
    FORCE_FALLBACK: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()

# print("DEBUG GROQ KEY:", settings.GROQ_API_KEY)
print("Environment loaded successfully")
print("Metrics enabled:", settings.ENABLE_METRICS)
