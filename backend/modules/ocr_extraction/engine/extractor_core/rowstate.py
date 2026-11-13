"""Every Excel row (or document line) ends with one processing state, so nothing is silently lost:

  extracted        values were identified, but no emission category yet
  categorised      the emission category was identified and the row is ready
  needs_attention  something needs the customer's confirmation (category, unit, currency, facility, ...)
  couldnt_read     code and AI could not interpret the row
  failed           processing failed technically (for example no AI provider was reachable)
"""
from __future__ import annotations

STATES = ("extracted", "categorised", "needs_attention", "couldnt_read", "failed")


def of(row: dict, item: dict) -> dict:
    """{'state', 'reason'} for one output row."""
    if item.get("processing_error"):
        return {"state": "failed", "reason": item["processing_error"]}
    if not row.get("activity_id") and "AI unavailable" in (row["decision"].get("reason") or ""):
        return {"state": "failed", "reason": "No AI provider could categorise this row: " + row["decision"]["reason"][:120]}
    if item.get("read_state") == "unreadable":
        return {"state": "couldnt_read", "reason": (item.get("read_notes") or ["Nothing could be read from this row"])[0]}
    if row["review_status"] != "ready" or item.get("read_state") == "needs_attention":
        reasons = list(item.get("read_notes") or []) + [c["message"] for c in row.get("checks", []) if c["level"] in ("warn", "error")]
        if row["decision"].get("question"):
            reasons.insert(0, row["decision"]["question"])
        return {"state": "needs_attention", "reason": (reasons or ["Please review this row"])[0]}
    return {"state": "categorised" if row.get("activity_id") or row["decision"].get("factor_match") else "extracted", "reason": None}


def counts(rows: list[dict]) -> dict[str, int]:
    out = dict.fromkeys(STATES, 0)
    for r in rows:
        if not r.get("derived"):
            out[r["state"]["state"]] += 1
    return out


def shown(row: dict) -> str:
    """The one label a reviewer sees before approving: ready | check | input | unreadable."""
    if (row.get("state") or {}).get("state") in ("couldnt_read", "failed"):
        return "unreadable"
    level = (row.get("trust") or {}).get("level")
    rs = row.get("review_status")
    if rs == "ready":
        return "check" if level == "check" else "ready"
    if rs == "ask" or level == "needs_you" or not (row.get("facility") or {}).get("id"):
        return "input"
    return "check"
