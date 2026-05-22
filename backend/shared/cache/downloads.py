"""In-memory pending downloads cache.

Phase B8: extracted from server.py so the reports router and any future
download endpoints can share it.

Key: download_token (str)
Value: {"buffer": BytesIO, "filename": str, "created_at": datetime}
"""
from typing import Any, Dict

# Module-level singleton dict; identical semantics to the legacy
# `pending_downloads` global in server.py.
pending_downloads: Dict[str, Dict[str, Any]] = {}

__all__ = ["pending_downloads"]
