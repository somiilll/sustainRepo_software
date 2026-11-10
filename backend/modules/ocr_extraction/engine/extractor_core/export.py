"""Approved rows -> the payload Emergent's Save-all receives.

One record per row. Emergent resolves category_id / subcategory_id / emission-factor id from the labels until its JSON
export lets mappings/activity_taxonomy.json carry the real ids (then they are filled here and the labels are only
for display). `fields` holds exactly the formula's field keys plus '<key>_unit', so Save-all can calculate without
re-deriving anything. Rows with review_status 'rejected' are never exported.
"""
from __future__ import annotations

from datetime import datetime, timezone

CONTRACT_VERSION = "1.0"


def to_record(row: dict) -> dict:
    g, c, p = row["ghg"], row["calc"], row["period"]
    alloc = p.get("allocation") or [{"period": p["reporting_period"], "share": 1.0}]
    return {
        "row_id": row["row_id"],
        "parent_row_id": row.get("parent_id"),
        "derived": bool(row.get("derived")),
        "facility_id": row["facility"]["id"],
        "reporting_period": p["reporting_period"],
        "period_allocation": alloc,
        "scope": g.get("scope"), "category": g.get("category"), "subcategory": g.get("subcategory"),
        "scope_label": g.get("scope_label"), "category_label": g.get("category_label"), "subcategory_label": g.get("subcategory_label"),
        "category_id": g.get("category_id"), "subcategory_id": g.get("subcategory_id"),
        "modules": row.get("modules", []),
        "activity_id": row.get("activity_id"),
        "formula_id": c.get("formula_id"), "emergent_formula_id": c.get("emergent_formula_id"),
        "ef_method": c.get("ef_method"),
        "fields": c.get("fields", {}),
        "description": row.get("extracted_item"), "original_text": row.get("original_text"),
        "vendor": row.get("vendor"), "invoice_number": row.get("invoice_number"), "document_date": row.get("date"),
        "amount": row.get("amount"), "currency": row.get("currency"),
        "evidence": {"file": row.get("file"), "file_hash": (row.get("source") or {}).get("file_hash"),
                     "page": (row.get("source") or {}).get("page"), "sheet": (row.get("source") or {}).get("sheet"),
                     "excel_row": (row.get("source") or {}).get("row"), "quotes": row.get("evidence", [])[:3]},
        "classification": {"source": row["decision"].get("source"), "confidence": row["confidence"]["overall"],
                           "reason": row["decision"].get("reason")},
        "review": row.get("review") or {"state": row.get("review_status")},
    }


def approval_blockers(rows: list[dict], ids: set[str]) -> set[str]:
    """Rows among `ids` that cannot be approved yet (no formula, facility or period), plus their parent and companions,
    because a parent and its linked rows are saved together."""
    bad = {r["row_id"] for r in rows if r["row_id"] in ids and
           (not (r.get("calc") or {}).get("formula_id") or not (r.get("facility") or {}).get("id") or not r.get("reporting_period"))}
    bad |= {r["parent_id"] for r in rows if r["row_id"] in bad and r.get("parent_id")}
    bad |= {r["row_id"] for r in rows if r.get("parent_id") in bad}
    return bad


def save_all_payload(rows: list[dict], org: str = "default", only_approved: bool = True) -> dict:
    pick = [r for r in rows if (r.get("review") or {}).get("state") == "approved"] if only_approved else         [r for r in rows if (r.get("review") or {}).get("state") != "rejected"]
    recs = [to_record(r) for r in pick]
    # an incomplete record is never exported as a record, even if it was approved and then edited: it is listed instead
    blocked = [r["row_id"] for r in recs if not r["formula_id"] or not r["facility_id"] or not r["reporting_period"]]
    return {"contract_version": CONTRACT_VERSION, "org": org,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "records": [r for r in recs if r["row_id"] not in set(blocked)], "not_calculable": blocked}
