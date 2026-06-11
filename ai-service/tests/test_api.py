import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

#  Change this if your env key is different
VALID_KEY = "test_key"
INVALID_KEY = "wrong_key"


# -------------------------
# 1. Health Check Test
# -------------------------
def test_healthz():
    response = client.get("/v1/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# -------------------------
# 2. Readiness Test
# -------------------------
def test_readyz():
    response = client.get("/v1/readyz")
    assert response.status_code == 200
    assert response.json()["ready"] is True


# -------------------------
# 3. Unauthorized (no key)
# -------------------------
def test_summarize_no_key():
    response = client.post(
        "/v1/summarize",
        json={"text": "Hello world"}
    )
    assert response.status_code in [401, 403, 422]
# -------------------------
# 4. Invalid API key
# -------------------------
def test_summarize_invalid_key():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": INVALID_KEY},
        json={"text": "Hello world"}
    )
    assert response.status_code in [401, 403]


# -------------------------
# 5. Empty text validation
# -------------------------
def test_summarize_empty_text():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={"text": ""}
    )
    assert response.status_code in [400, 422]


# -------------------------
# 6. Valid summarization test
# -------------------------
def test_summarize_success():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={"text": "India launched a satellite mission to improve communication."}
    )

    assert response.status_code == 200

    data = response.json()

    assert "summary" in data
    assert "confidence" in data
    assert "model" in data
    assert "tokensIn" in data
    assert "tokensOut" in data
    assert "cached" in data