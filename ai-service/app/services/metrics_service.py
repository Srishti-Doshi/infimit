# Store application metrics
from app.models.metrics_model import MetricsResponse

metrics = {
    "total_requests": 0,
    "successful_requests": 0,
    "failed_requests": 0,
    "cache_hits": 0,
    "cache_misses": 0
}

def increment_total_requests():
    metrics["total_requests"] += 1

def increment_successful_requests():
    metrics["successful_requests"] += 1

def increment_failed_requests():
    metrics["failed_requests"] += 1

def get_metrics():
    return metrics

def increment_cache_hit():
    metrics["cache_hits"] += 1

def increment_cache_miss():
    metrics["cache_misses"] += 1