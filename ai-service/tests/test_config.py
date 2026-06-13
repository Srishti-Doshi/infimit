from app.config import settings

def test_port_exists():
    assert settings.PORT is not None

def test_log_level_exists():
    assert settings.LOG_LEVEL is not None