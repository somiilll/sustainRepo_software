"""Process-wide caps on simultaneous AI calls, shared by every job.

One job alone can start 4 document reads and 8 classifier calls at once; with several jobs running that would exceed a
provider's rate limit and calls would fail with 'too many requests'. A call waits here for a free slot instead.
Caps live in policy.json -> concurrency_caps ("claude": document reads and layout calls, "classifier": Jev/OpenAI/Claude decisions).
"""
from __future__ import annotations

import threading

from .config import load

DEFAULTS = {"claude": 8, "openai": 8, "classifier": 16}
_sems: dict[tuple[str, int], threading.BoundedSemaphore] = {}
_lock = threading.Lock()


def gate(name: str) -> threading.BoundedSemaphore:
    """Use as `with gate("claude"): ...`."""
    cap = int((load().policy.get("concurrency_caps") or {}).get(name, DEFAULTS.get(name, 8)))
    with _lock:
        return _sems.setdefault((name, cap), threading.BoundedSemaphore(cap))
