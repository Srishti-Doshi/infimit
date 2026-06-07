from unittest.mock import patch, MagicMock
from app.models import loader


@patch("app.models.loader.Groq")
def test_get_groq_client(mock_groq):
    loader._groq_client = None

    mock_client = MagicMock()
    mock_groq.return_value = mock_client

    client = loader.get_groq_client()

    assert client == mock_client


@patch("app.models.loader.Groq")
def test_singleton_client(mock_groq):
    loader._groq_client = None

    mock_client = MagicMock()
    mock_groq.return_value = mock_client

    client1 = loader.get_groq_client()
    client2 = loader.get_groq_client()

    assert client1 is client2
    assert mock_groq.call_count == 1