# utils/cache.py

import time
import hashlib
from typing import Any, Dict, Optional

# -------------------------
# IN-MEMORY STORAGE
# -------------------------
_cache: Dict[str, Any] = {}
_cache_ttl: Dict[str, float] = {}


# -------------------------
# CACHE KEY GENERATION
# -------------------------
def get_cache_key(text: str, maxWords: int, style: str, model: str = "default") -> str:
    """
    Generate a stable and collision-safe cache key using hashing.
    """
    raw = f"{text.strip()}|{maxWords}|{style}|{model}"
    return hashlib.sha256(raw.encode()).hexdigest()


# -------------------------
# SET CACHE
# -------------------------
def set_cache(key: str, value: dict, ttl: int = 60) -> None:
    """
    Store value with TTL (time-to-live in seconds)
    """
    _cache[key] = value
    _cache_ttl[key] = time.time() + ttl


# -------------------------
# GET CACHE
# -------------------------
def get_cache(key: str) -> Optional[dict]:
    """
    Return cached value if exists and not expired
    """
    if key not in _cache:
        return None

    # check expiry
    if time.time() > _cache_ttl.get(key, 0):
        _cache.pop(key, None)
        _cache_ttl.pop(key, None)
        return None

    return _cache[key]


# -------------------------
# DELETE CACHE
# -------------------------
def delete_cache(key: str) -> None:
    """
    Remove specific cache entry
    """
    _cache.pop(key, None)
    _cache_ttl.pop(key, None)


# -------------------------
# CLEAR ALL CACHE
# -------------------------
def clear_cache() -> None:
    """
    Clear entire cache (use carefully)
    """
    _cache.clear()
    _cache_ttl.clear()


# -------------------------
# CHECK IF CACHE EXISTS
# -------------------------
def is_cached(key: str) -> bool:
    """
    Check if key exists and is not expired
    """
    return key in _cache and time.time() <= _cache_ttl.get(key, 0)


# -------------------------
# OPTIONAL: CACHE SIZE (DEBUGGING)
# -------------------------
def cache_size() -> int:
    """
    Returns number of active cache entries
    """
    return len(_cache)