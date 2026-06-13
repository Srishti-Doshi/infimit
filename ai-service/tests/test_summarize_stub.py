from fastapi.testclient import TestClient
from unittest.mock import patch

from app.main import app

client = TestClient(app)

VALID_KEY = "test_key"
INVALID_KEY = "wrong_key"


@patch("app.routers.summarize.summarize_text")
def test_summarize_stub_success(mock_summarize):
    mock_summarize.return_value = "This is a test summary."

    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={
            "text": "The quick brown fox jumps over the lazy dog.",
            "maxWords": 20,
            "style": "neutral",
        },
    )

    assert response.status_code == 200

    payload = response.json()

    assert payload["summary"] == "This is a test summary."
    assert isinstance(payload["confidence"], (float, int))
    assert isinstance(payload["model"], str)
    assert isinstance(payload["tokensIn"], int)
    assert isinstance(payload["tokensOut"], int)
    assert isinstance(payload["cached"], bool)


def test_summarize_stub_empty_text_returns_validation_error():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={"text": "   "}
    )

    assert response.status_code == 422


def test_summarize_stub_large_payload_rejected():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={"text": "a" * 20001}
    )

    assert response.status_code in {413, 422}


def test_summarize_stub_missing_key_returns_unauthorized():
    response = client.post(
        "/v1/summarize",
        json={"text": "Hello world"}
    )

    assert response.status_code == 401


def test_summarize_stub_invalid_key_returns_unauthorized():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": INVALID_KEY},
        json={"text": "Hello world"}
    )

    assert response.status_code == 401