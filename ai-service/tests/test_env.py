from dotenv import dotenv_values

required = [
    "AI_INTERNAL_KEY",
    "PORT",
    "LOG_LEVEL",
    "MODELS_CACHE_DIR",
    "ENABLE_METRICS"
]

env = dotenv_values(".env")

for var in required:
    print(f"{var}: {'FOUND' if var in env else 'MISSING'}")