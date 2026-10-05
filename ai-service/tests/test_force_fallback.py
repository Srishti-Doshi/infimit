import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings

client = TestClient(app)

VALID_KEY = "test_key"


def test_force_fallback(monkeypatch):
    """
    Verify FORCE_FALLBACK returns a degraded response
    and uses the fallback model.
    """

    monkeypatch.setattr(settings, "FORCE_FALLBACK", True)

    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={
            "text": "India launched a satellite mission to improve communication."
        }
    )

    assert response.status_code == 200

    assert response.headers["X-Degraded"] == "true"

    data = response.json()

    assert data["model"] == "fallback-truncate"
    assert "summary" in data
    assert len(data["summary"]) > 0