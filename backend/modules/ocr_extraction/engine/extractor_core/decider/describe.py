"""Internal plain-words reading of unmatched line items, used only to rank factor names and to inform classification.
Never stored on a row or shown to users. Haiku describes 10 items per call; answers are cached per normalised description."""
from __future__ import annotations

import re
import threading

from .. import llm

BATCH = 10
SYSTEM = ("You help a carbon-accounting tool understand purchase descriptions. For each numbered line item write what it is in plain words "
          "(what the product, material, equipment or service is, what it is made of and what it is used for), plus up to 6 synonyms or "
          "alternative names a catalogue of industries or materials might use. Use the company context to interpret abbreviations. "
          "If you do not recognise a brand, code or abbreviation, say so: set unknown to true and describe only what the visible words support. "
          "Never invent facts.")
SCHEMA = llm.obj({"items": {"type": "array", "items": llm.obj({"i": {"type": "integer"}, "plain": {"type": "string"},
                                                              "synonyms": {"type": "array", "items": {"type": "string"}}, "unknown": {"type": "boolean"}})}})
_CACHE: dict[str, dict] = {}
_LOCK = threading.Lock()


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", str(text or "").lower()).strip()


def text_of(item: dict) -> str:
    return item.get("description_en") or item.get("description") or ""


def lookup(text: str) -> dict | None:
    with _LOCK:
        return _CACHE.get(norm(text))


def describe_missing(texts: list[str], context: str) -> None:
    todo = list(dict.fromkeys(t for t in texts if norm(t) and lookup(t) is None))
    for k in range(0, len(todo), BATCH):
        chunk = todo[k:k + BATCH]
        content = (f"Company context: {context}\n\nLine items:\n" if context else "Line items:\n") + "\n".join(f"{i}: {t[:300]}" for i, t in enumerate(chunk))
        try:
            data, _ = llm.call_json("classify_fallback", SYSTEM, content, SCHEMA, max_tokens=3000)
        except llm.AIUnavailable:
            return
        with _LOCK:
            for r in data.get("items", []):
                if 0 <= r["i"] < len(chunk):
                    _CACHE[norm(chunk[r["i"]])] = {"plain": r["plain"], "synonyms": r.get("synonyms") or [], "unknown": bool(r.get("unknown"))}
        if len(_CACHE) > 20000:
            with _LOCK:
                _CACHE.clear()
