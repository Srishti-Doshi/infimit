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
    GROQ_API_KEY: str = "test"#  here "test" :-it prevents errors if someone forgets to create a .env file
    EXPOSE_DOCS: bool = True
    LRU_CAPACITY: int = 100
    FORCE_FALLBACK: bool = False
    READY_REQUIRES_MODEL: bool = False
    LRU_TTL_SEC: int = 86400

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()