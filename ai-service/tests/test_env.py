from dotenv import load_dotenv
import os

# Load variables from test_env file
load_dotenv("test_env")

# Required variables
required_vars = [
    "AI_INTERNAL_KEY",
    "PORT",
    "LOG_LEVEL",
    "MODELS_CACHE_DIR",
    "ENABLE_METRICS",
    "WARM_ON_STARTUP",
    "READY_REQUIRES_MODEL",
    "EXPOSE_DOCS",
    "FORCE_FALLBACK",
    "LRU_CAPACITY",
    "LRU_TTL_SEC",
    "GROQ_API_KEY"
     
]

print("\n===== ENVIRONMENT TEST REPORT =====\n")

missing = []

# Check each variable
for var in required_vars:
    value = os.getenv(var)
    if value is None or value == "":
        print(f"{var}:  MISSING")
        missing.append(var)
    else:
        print(f"{var}:  LOADED -> {value}")

print("\n====================================")

# Final status
if missing:
    print(f"RESULT: FAILED ({len(missing)} missing variables)")
else:
    print("RESULT: ALL VARIABLES LOADED SUCCESSFULLY")