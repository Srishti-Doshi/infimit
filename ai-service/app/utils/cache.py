from collections import OrderedDict

class LRUCache:

    def __init__(self, capacity=1024):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key):

        if key not in self.cache:
            return None

        self.cache.move_to_end(key)

        return self.cache[key]

    def set(self, key, value):

        if key in self.cache:
            self.cache.move_to_end(key)

        self.cache[key] = value

        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)


from app.config import settings

summarize_cache = LRUCache(
    capacity=settings.CACHE_SIZE
)