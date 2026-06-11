from app.utils.cache import set_cache, get_cache, delete_cache, clear_cache
import time


def test_set_and_get_cache():
    set_cache("user1", "Saloni")
    assert get_cache("user1") == "Saloni"


def test_cache_expiry():
    set_cache("user1", "Saloni", ttl=1)
    time.sleep(2)
    assert get_cache("user1") is None


def test_delete_cache():
    set_cache("user1", "Saloni")
    delete_cache("user1")
    assert get_cache("user1") is None


def test_clear_cache():
    set_cache("a", 1)
    set_cache("b", 2)
    clear_cache()
    assert get_cache("a") is None
    assert get_cache("b") is None