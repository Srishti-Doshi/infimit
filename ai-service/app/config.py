from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import dotenv_values

class Settings(BaseSettings):
    AI_INTERNAL_KEY: str
    PORT: int
    LOG_LEVEL: str
    MODELS_CACHE_DIR: str
    ENABLE_METRICS: bool

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
print(dotenv_values(".env"))