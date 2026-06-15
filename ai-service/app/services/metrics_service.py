from prometheus_client import Counter, Histogram, Gauge

REQUESTS = Counter(
    "ai_requests_total",
    "AI requests",
    ["endpoint", "status", "degraded"]
)

REQUEST_DURATION = Histogram(
    "ai_request_duration_seconds",
    "AI request duration",
    ["endpoint"]
)

CACHE_HITS = Counter(
    "ai_cache_hits_total",
    "Cache hits",
    ["endpoint"]
)

CACHE_MISSES = Counter(
    "ai_cache_misses_total",
    "Cache misses",
    ["endpoint"]
)

CACHE_EVICTIONS = Counter(
    "ai_cache_evictions_total",
    "Cache evictions",
    ["endpoint"]
)

MODEL_LOADED = Gauge(
    "ai_model_loaded",
    "Model loaded status",
    ["model"]
)

MODEL_LOAD_DURATION = Histogram(
    "ai_model_load_duration_seconds",
    "Model load duration",
    ["model"]
)