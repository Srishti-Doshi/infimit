from app.services.metrics_service import REQUESTS


def test_ai_requests_total_labels():
    expected_labels = {"endpoint", "status", "degraded"}

    assert set(REQUESTS._labelnames) == expected_labels


def test_ai_requests_total_accepts_required_labels():
    metric = REQUESTS.labels(
        endpoint="summarize",
        status="200",
        degraded="false"
    )

    assert metric is not None