from app.config import Settings

try:
    settings = Settings()
    print("SUCCESS")
    print(settings.model_dump())
except Exception as e:
    print(e)