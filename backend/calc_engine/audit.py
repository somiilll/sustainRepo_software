"""Structured audit log accumulator for calculations."""

from __future__ import annotations

from typing import Any, Dict, List


class AuditTrail:
    def __init__(self) -> None:
        self.trail: List[Dict[str, Any]] = []

    def add(self, entry: Dict[str, Any]) -> None:
        if entry is None:
            return
        self.trail.append(entry)

    def extend(self, entries: List[Dict[str, Any]]) -> None:
        for e in entries:
            self.add(e)
