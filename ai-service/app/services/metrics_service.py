# Store application metrics

metrics = {
    "total_requests": 0,
    "successful_requests": 0,
    "failed_requests": 0
}


def increment_total_requests():
    metrics["total_requests"] += 1


def increment_successful_requests():
    metrics["successful_requests"] += 1


def increment_failed_requests():
    metrics["failed_requests"] += 1


def get_metrics():
    return metrics