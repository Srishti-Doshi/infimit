import time
from collections import OrderedDict

class LRUCache:

    def __init__(self, capacity=1024):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key):

        if key not in self.cache:
            return None

        self.cache.move_to_end(key)

        value, expires_at = self.cache[key]

        if expires_at is not None and expires_at <= time.monotonic():
            del self.cache[key]
            return None

        return value

    def set(self, key, value, ttl=None):

        if key in self.cache:
            self.cache.move_to_end(key)

        expires_at = None

        if ttl is not None:
            expires_at = time.monotonic() + ttl

        self.cache[key] = (value, expires_at)

        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)

    def delete(self, key):
        self.cache.pop(key, None)

    def clear(self):
        self.cache.clear()

from app.config import settings

summarize_cache = LRUCache(
    capacity=settings.CACHE_SIZE
)

_default_cache = LRUCache(
    capacity=settings.CACHE_SIZE
)

def set_cache(key, value, ttl=None):
    _default_cache.set(key, value, ttl=ttl)

def get_cache(key):
    return _default_cache.get(key)

def delete_cache(key):
    _default_cache.delete(key)

def clear_cache():
    _default_cache.clear()