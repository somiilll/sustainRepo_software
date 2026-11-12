"""Audit trail: who changed or approved which record, when, and what the old and new values were.

Snapshots and diffs of what a reviewer can change.
`actor` is whatever the host app knows about the user (the testbench has no logins, so it uses "reviewer").
"""
from __future__ import annotations

# the fields a reviewer can see and change; everything in a snapshot is compared field by field
TRACKED = ("review_state", "activity", "scope", "category", "quantity", "unit", "amount", "period", "facility", "use_context")


def snapshot(row: dict | None) -> dict:
    """The reviewer-visible state of a parent row, as plain values."""
    if not row:
        return {}
    g, d = row.get("ghg") or {}, row.get("decision") or {}
    return {
        "review_state": (row.get("review") or {}).get("state") or row.get("review_status"),
        "activity": row.get("activity_label") or row.get("activity_id"),
        "scope": g.get("scope_label"),
        "category": g.get("category_label"),
        "activity_choice": g.get("subcategory_label"),
        "quantity": row.get("raw_quantity"),
        "unit": row.get("raw_unit"),
        "amount": row.get("amount"),
        "period": row.get("reporting_period"),
        "facility": (row.get("facility") or {}).get("name"),
        "use_context": (d.get("context") or {}).get("use_context"),
    }


def diff(before: dict, after: dict) -> dict:
    """{field: [old, new]} for the tracked fields that changed."""
    return {k: [before.get(k), after.get(k)] for k in TRACKED if before.get(k) != after.get(k)}
