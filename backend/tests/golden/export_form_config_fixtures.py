"""
Phase 1 helper: export RAW form-config responses + reference lists as frontend
fixtures for the field-derivation equivalence tests.

READ-ONLY. Writes
`/app/frontend/src/modules/ghg/config/__tests__/fixtures/form-config-fixtures.json`

`applicable_fuels` is dropped (field derivation never reads it) to keep the
fixture small.

Usage: cd /app/backend && python3 tests/golden/export_form_config_fixtures.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any, Dict, List

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests  # noqa: E402

from ghg_golden_support import (  # noqa: E402
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    API,
    auth_header,
    enumerate_tree_paths,
    login,
    mongo_db,
)

OUT_DIR = "/app/frontend/src/modules/ghg/config/__tests__/fixtures"
OUT_FILE = os.path.join(OUT_DIR, "form-config-fixtures.json")

# decision field name -> which selection slot the Create form keeps it in
SELECTION_SLOT = {
    "calculation_method_scope3": "scope3Method",
    "activity_type": "scope3ActivityType",
    "subcategory_selection": "scope3Subcategory",
    "type_of_product": "typeOfProduct",
}


async def main() -> None:
    db = mongo_db()
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        raise SystemExit("Admin login failed")
    headers = auth_header(token)

    scopes = [s async for s in db.scopes.find({}, {"_id": 0})]
    scope_by_id = {s["id"]: s for s in scopes}
    cats = [c async for c in db.emission_categories.find({"is_active": True}, {"_id": 0})]

    # Mirror the shape the frontend receives in `dynamicCategories` / `dynamicScopes`.
    dynamic_categories = [
        {
            "id": c["id"],
            "name": c["name"],
            "code": c.get("code"),
            "scope_id": c.get("scope_id"),
            "scope_code": (scope_by_id.get(c.get("scope_id")) or {}).get("code"),
            "is_active": c.get("is_active", True),
            "display_order": c.get("display_order"),
        }
        for c in sorted(cats, key=lambda c: (c["name"], c["id"]))
    ]
    dynamic_scopes = [
        {"id": s["id"], "code": s.get("code"), "name": s.get("name")}
        for s in sorted(scopes, key=lambda s: str(s.get("code")))
    ]

    entries: List[Dict[str, Any]] = []
    for cat in dynamic_categories:
        resp = requests.get(
            f"{API}/calc-engine/form-config/{cat['id']}", headers=headers, timeout=120
        )
        if resp.status_code != 200:
            print(f"  !! {cat['name']} {cat['id']} -> {resp.status_code}")
            continue
        cfg = resp.json()
        cfg.pop("applicable_fuels", None)

        # Every decision path the Create form can reach for this category.
        leaves = enumerate_tree_paths(cfg.get("decision_tree") or {})
        selections: List[Dict[str, Any]] = []
        seen = set()
        for leaf in leaves:
            sel: Dict[str, Any] = {
                "scope3Method": "",
                "scope3ActivityType": "",
                "scope3Subcategory": "",
                "typeOfProduct": "",
                "decisionFieldValues": {},
            }
            for field, value in leaf["decision_inputs"].items():
                slot = SELECTION_SLOT.get(field)
                if slot:
                    sel[slot] = value
                else:
                    sel["decisionFieldValues"][field] = value
            key = json.dumps(sel, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            selections.append({**sel, "expectedFormulaId": leaf["formula_id"]})

        # Plus the "nothing chosen yet" state, which has its own fallback path.
        selections.append(
            {
                "scope3Method": "",
                "scope3ActivityType": "",
                "scope3Subcategory": "",
                "typeOfProduct": "",
                "decisionFieldValues": {},
                "expectedFormulaId": None,
            }
        )

        entries.append(
            {
                "categoryId": cat["id"],
                "categoryName": cat["name"],
                "categoryCode": cat.get("code"),
                "scopeCode": cat.get("scope_code"),
                "formConfig": cfg,
                "selections": selections,
            }
        )

    payload = {
        "note": (
            "Raw GET /api/calc-engine/form-config responses plus every reachable "
            "decision path, used by the Phase 1 field-derivation equivalence tests. "
            "Regenerate with tests/golden/export_form_config_fixtures.py."
        ),
        "dynamicCategories": dynamic_categories,
        "dynamicScopes": dynamic_scopes,
        "entries": entries,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, sort_keys=True, default=str)
        f.write("\n")

    total_sel = sum(len(e["selections"]) for e in entries)
    print(
        f"{len(entries)} categories, {total_sel} decision-path selections, "
        f"{len(dynamic_categories)} categories / {len(dynamic_scopes)} scopes -> {OUT_FILE}"
    )


if __name__ == "__main__":
    asyncio.run(main())
