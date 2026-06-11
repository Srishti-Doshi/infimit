from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

VALID_KEY = "test_key"


def test_invalid_style():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={
            "text": "hello world",
            "style": "random"
        }
    )

    assert response.status_code == 422


def test_max_words_too_small():
    response = client.post(
        "/v1/summarize",
        headers={"X-Internal-Key": VALID_KEY},
        json={
            "text": "hello world",
            "maxWords": 5
        }
    )

    assert response.status_code == 422