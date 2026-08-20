"""
Read-only impact analysis for duplicate active emission categories
(Stationary Combustion / Mobile Combustion).

Usage: cd /app/backend && python3 tests/golden/analyze_category_identity.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ghg_golden_support import mongo_db, stable_hash, strip_volatile  # noqa: E402

TARGET_NAMES = ["Stationary Combustion", "Mobile Combustion"]


async def main() -> None:
    db = mongo_db()

    print("=" * 78)
    print("1. CATEGORY DEFINITIONS")
    print("=" * 78)
    cats = [c async for c in db.emission_categories.find({}, {"_id": 0})]
    scopes = {s["id"]: s async for s in db.scopes.find({}, {"_id": 0})}
    by_name = defaultdict(list)
    for c in cats:
        by_name[c["name"]].append(c)

    targets = {}
    for name in TARGET_NAMES:
        entries = sorted(by_name[name], key=lambda c: str(c.get("created_at")))
        targets[name] = entries
        print(f"\n--- {name} ({len(entries)} definitions) ---")
        for c in entries:
            sc = scopes.get(c.get("scope_id")) or {}
            print(json.dumps(c, indent=1, default=str))
            print(f"   scope -> {sc.get('name')} ({sc.get('code')}) id={c.get('scope_id')}")

    print("\n" + "=" * 78)
    print("2. SCOPES TABLE")
    print("=" * 78)
    for s in scopes.values():
        print(" ", json.dumps(s, default=str))

    print("\n" + "=" * 78)
    print("3. DECISION TREES PER CATEGORY ID")
    print("=" * 78)
    trees = [t async for t in db.ce_decision_trees.find({}, {"_id": 0})]
    formulas = {f["id"]: f async for f in db.ce_formulas.find({}, {"_id": 0})}
    trees_by_cat = defaultdict(list)
    for t in trees:
        trees_by_cat[t["category_id"]].append(t)

    def describe_tree(node, formulas, depth=0):
        lines = []
        pad = "   " * (depth + 1)
        if "formula_id" in node:
            f = formulas.get(node["formula_id"]) or {}
            lines.append(f"{pad}-> formula {node['formula_id']} ({f.get('name')}) active={f.get('is_active')}")
            return lines
        lines.append(f"{pad}field: {node.get('field_name')}")
        for val, child in (node.get("options") or {}).items():
            lines.append(f"{pad}  [{val}]")
            if "formula_id" in child:
                f = formulas.get(child["formula_id"]) or {}
                lines.append(
                    f"{pad}    -> formula {child['formula_id']} ({f.get('name')}) active={f.get('is_active')}"
                )
            elif child.get("next"):
                lines.extend(describe_tree(child["next"], formulas, depth + 2))
        return lines

    for name in TARGET_NAMES:
        print(f"\n--- {name} ---")
        for c in targets[name]:
            cid = c["id"]
            ts = trees_by_cat.get(cid) or []
            print(f"\n  category_id={cid}  trees={len(ts)}")
            for t in ts:
                print(f"    tree id={t['id']} is_active={t.get('is_active')} created={t.get('created_at')}")
                print("\n".join(describe_tree(t.get("tree") or {}, formulas, 1)))
                print(f"    structure_hash={stable_hash(strip_volatile(t.get('tree') or {}))}")

    print("\n" + "=" * 78)
    print("4. REFERENCES TO EACH CATEGORY ID ACROSS COLLECTIONS")
    print("=" * 78)
    all_ids = [c["id"] for name in TARGET_NAMES for c in targets[name]]

    async def count_ref(coll, field, cid, array=False):
        q = {field: cid}
        return await db[coll].count_documents(q)

    ref_specs = [
        ("ce_decision_trees", "category_id"),
        ("ce_formulas", "category_id"),
        ("ce_formulas", "category_ids"),
        ("ce_input_field_mappings", "applies_to_categories"),
        ("ce_property_source_mappings", "category_id"),
        ("ce_calculation_audit_logs", "context.category_id"),
        ("emission_records", "category_id"),
        ("esg_kpi_definitions", "category_id"),
        ("category_frequency_configs", "category_id"),
        ("base_year_emissions", "category_id"),
        ("bulk_upload_pending_records", "category_id"),
    ]
    for cid in all_ids:
        cat = next(c for c in cats if c["id"] == cid)
        print(f"\n--- {cat['name']} / {cid} ---")
        for coll, field in ref_specs:
            try:
                n = await count_ref(coll, field, cid)
            except Exception as exc:  # noqa: BLE001
                n = f"err {exc}"
            if n:
                print(f"    {coll}.{field}: {n}")

    print("\n" + "=" * 78)
    print("5. WHICH ID DOES THE APP ACTUALLY USE? (form-config resolution)")
    print("=" * 78)
    print("emission_records store the category NAME only. Checking:")
    for name in TARGET_NAMES:
        n = await db.emission_records.count_documents({"category": name})
        has_cat_id = await db.emission_records.count_documents(
            {"category": name, "category_id": {"$exists": True}}
        )
        print(f"  {name}: {n} records, {has_cat_id} with a category_id field")

    print("\n  Formula usage by records (via calc audit logs), grouped by category name:")
    logs = {}
    async for lg in db.ce_calculation_audit_logs.find(
        {"emission_record_id": {"$ne": None}}, {"_id": 0}
    ):
        rid = lg["emission_record_id"]
        prev = logs.get(rid)
        if prev is None or str(lg.get("created_at") or "") > str(prev.get("created_at") or ""):
            logs[rid] = lg
    recs = {r["id"]: r async for r in db.emission_records.find({}, {"_id": 0})}
    per_name = defaultdict(Counter)
    for rid, lg in logs.items():
        rec = recs.get(rid)
        if not rec:
            continue
        if rec.get("category") in TARGET_NAMES:
            f = formulas.get(lg.get("formula_id")) or {}
            per_name[rec["category"]][
                f"{lg.get('formula_id')} ({f.get('name')})"
            ] += 1
    for name, ctr in per_name.items():
        print(f"\n  {name}:")
        for k, v in ctr.most_common():
            print(f"    {v:4d}  {k}")

    print("\n" + "=" * 78)
    print("6. WHICH CATEGORY ID OWNS EACH USED FORMULA")
    print("=" * 78)
    used = {lg.get("formula_id") for lg in logs.values() if lg.get("formula_id")}
    for name in TARGET_NAMES:
        print(f"\n--- {name} ---")
        for c in targets[name]:
            cid = c["id"]
            owned = set()
            for t in trees_by_cat.get(cid) or []:
                if not t.get("is_active"):
                    continue
                stack = [t.get("tree") or {}]
                while stack:
                    node = stack.pop()
                    if "formula_id" in node:
                        owned.add(node["formula_id"])
                        continue
                    for child in (node.get("options") or {}).values():
                        if "formula_id" in child:
                            owned.add(child["formula_id"])
                        elif child.get("next"):
                            stack.append(child["next"])
            for f in (
                [x async for x in db.ce_formulas.find({"category_id": cid}, {"_id": 0, "id": 1})]
                + [x async for x in db.ce_formulas.find({"category_ids": cid}, {"_id": 0, "id": 1})]
            ):
                owned.add(f["id"])
            print(f"  {cid}: owns {len(owned)} formulas, {len(owned & used)} of them used by records")
            for fid in sorted(owned):
                mark = "USED" if fid in used else "    "
                print(f"     [{mark}] {fid} ({(formulas.get(fid) or {}).get('name')})")

    print("\n" + "=" * 78)
    print("7. INPUT FIELD MAPPINGS PER ID (field derivation input)")
    print("=" * 78)
    for name in TARGET_NAMES:
        print(f"\n--- {name} ---")
        for c in targets[name]:
            cid = c["id"]
            ms = [
                m
                async for m in db.ce_input_field_mappings.find(
                    {"applies_to_categories": cid, "is_active": True}, {"_id": 0}
                )
            ]
            keys = sorted(m["field_key"] for m in ms)
            print(f"  {cid}: {len(ms)} mappings -> {keys}")

    print("\n" + "=" * 78)
    print("8. OTHER DUPLICATE NAMES (full sweep)")
    print("=" * 78)
    for nm, entries in sorted(by_name.items()):
        if len(entries) > 1:
            print(f"  {nm}: {[e['id'] for e in entries]}")


if __name__ == "__main__":
    asyncio.run(main())
