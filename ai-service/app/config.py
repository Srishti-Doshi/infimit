from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    sentry_dsn: str | None = None
    env: str = "development"
    WARM_ON_STARTUP: bool = False
    AI_INTERNAL_KEY: str = "test"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"
    MODELS_CACHE_DIR: str = "./models"
    ENABLE_METRICS: bool = True
    GROQ_API_KEY: str = "test"
    EXPOSE_DOCS: bool = True
    LRU_CAPACITY: int = 100
    FORCE_FALLBACK: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()