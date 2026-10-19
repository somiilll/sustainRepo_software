"""Bounded context-aware caches for repeated OCR classification decisions."""
from __future__ import annotations

import copy
import hashlib
import json
from collections import OrderedDict
from typing import Any


def cache_key(*parts: Any) -> str:
    payload = json.dumps(parts, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class BoundedCache:
    def __init__(self, max_size: int = 2048):
        self.max_size = max_size
        self._values: OrderedDict[str, Any] = OrderedDict()

    def get(self, key: str) -> Any:
        if key not in self._values:
            return None
        self._values.move_to_end(key)
        return copy.deepcopy(self._values[key])

    def set(self, key: str, value: Any) -> None:
        self._values[key] = copy.deepcopy(value)
        self._values.move_to_end(key)
        while len(self._values) > self.max_size:
            self._values.popitem(last=False)