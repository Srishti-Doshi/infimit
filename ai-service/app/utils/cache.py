# Speed up system using memory caching
import time

_cache = {}
_cache_ttl = {}


def set_cache(key: str, value, ttl: int = 60):
    """Store value with time-to-live (TTL in seconds)"""
    _cache[key] = value
    _cache_ttl[key] = time.time() + ttl


def get_cache(key: str):
    """Return cached value if not expired"""
    if key not in _cache:
        return None

    if time.time() > _cache_ttl.get(key, 0):
        # expired
        _cache.pop(key, None)
        _cache_ttl.pop(key, None)
        return None

    return _cache[key]


def delete_cache(key: str):
    _cache.pop(key, None)
    _cache_ttl.pop(key, None)


def clear_cache():
    _cache.clear()
    _cache_ttl.clear()