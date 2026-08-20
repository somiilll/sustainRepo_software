"""
Phase 0 — GHG golden baseline capture (READ-ONLY).

Builds the regression baselines used by `tests/golden/test_ghg_golden_*.py`.

Guarantees:
  * Mongo is only read (`find`, `aggregate`, `count_documents`).
  * Every calculation replay runs with `dry_run=True`, so no audit-log rows,
    emission records or any other document are written.
  * No business logic is modified; the script only observes.

Usage:
    cd /app/backend && python3 tests/golden/capture_ghg_baseline.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests  # noqa: E402

from ghg_golden_support import (  # noqa: E402
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    API,
    API_CONTRACT_BASELINE,
    CALC_BASELINE,
    FINDINGS,
    FORM_CONFIG_BASELINE,
    HTTP_BASELINE,
    RECORD_CONTRACT_BASELINE,
    TREE_BASELINE,
    auth_header,
    bucket_key,
    enumerate_tree_paths,
    fixture_slug,
    login,
    mongo_db,
    normalise_outputs,
    reconstruct_user_overrides,
    save_baseline,
    stable_hash,
    strip_volatile,
)

MAX_FIXTURES_PER_BUCKET = 3


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------- helpers


async def _latest_audit_log_by_record(db) -> Dict[str, Dict[str, Any]]:
    """emission_record_id -> most recent calculation audit log."""
    latest: Dict[str, Dict[str, Any]] = {}
    cursor = db.ce_calculation_audit_logs.find(
        {"emission_record_id": {"$ne": None}}, {"_id": 0}
    )
    async for doc in cursor:
        rid = doc["emission_record_id"]
        prev = latest.get(rid)
        if prev is None or str(doc.get("created_at") or "") > str(prev.get("created_at") or ""):
            latest[rid] = doc
    return latest


async def _category_name_to_id(db) -> Dict[str, Dict[str, Any]]:
    """
    Resolve category name -> canonical id.

    Several names exist twice in `emission_categories` (all active). We prefer
    the id that owns an active decision tree; the ambiguity is reported in the
    findings file rather than silently normalised.
    """
    cats = [c async for c in db.emission_categories.find({}, {"_id": 0})]
    trees = {
        t["category_id"]
        async for t in db.ce_decision_trees.find({"is_active": True}, {"_id": 0, "category_id": 1})
    }
    by_name: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for c in cats:
        by_name[c["name"]].append(c)

    resolved: Dict[str, Dict[str, Any]] = {}
    duplicates: List[Dict[str, Any]] = []
    for name, entries in by_name.items():
        if len(entries) > 1:
            duplicates.append(
                {
                    "name": name,
                    "ids": sorted(e["id"] for e in entries),
                    "ids_with_active_decision_tree": sorted(
                        e["id"] for e in entries if e["id"] in trees
                    ),
                }
            )
        preferred = next((e for e in entries if e["id"] in trees), None) or sorted(
            entries, key=lambda e: str(e.get("created_at") or "")
        )[0]
        resolved[name] = preferred
    return {"resolved": resolved, "duplicates": duplicates}


def _reconstruct_decision_inputs(
    record: Dict[str, Any], tree: Optional[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """
    Best-effort rebuild of the `decision_inputs` the UI would have sent.

    Returns None when a required decision field cannot be sourced from the
    stored record — those fixtures are excluded so the test stays deterministic.
    """
    if not tree:
        return {}

    dfv = record.get("dynamic_field_values") or {}

    def dfv_value(key: str) -> Optional[Any]:
        raw = dfv.get(key)
        if isinstance(raw, dict):
            return raw.get("value")
        return raw

    candidates = {
        "calculation_methodology": dfv_value("calculation_methodology"),
        "process_type": record.get("process_type") or dfv_value("process_type"),
        "calculation_method_scope3": record.get("calculation_method_scope3"),
        "type_of_product": record.get("type_of_product") or dfv_value("type_of_product"),
    }

    node = tree
    decision_inputs: Dict[str, Any] = {}
    depth = 0
    while isinstance(node, dict) and "formula_id" not in node:
        depth += 1
        if depth > 20:
            return None
        field = node.get("field_name")
        value = candidates.get(field)
        if value is None or value not in (node.get("options") or {}):
            return None
        decision_inputs[field] = value
        child = node["options"][value]
        if isinstance(child, dict) and "formula_id" in child:
            return decision_inputs
        node = (child or {}).get("next")
    return decision_inputs


# ------------------------------------------------------------------ capture #1


async def capture_calculation_fixtures(db) -> Dict[str, Any]:
    """
    One hermetic replay fixture per (bucket, record):
        formula + inputs + context + user_overrides  ->  outputs

    `user_overrides` is rebuilt from the persisted audit trail, which records
    every user-overridden property (and every router-injected property such as
    `co2_gwp_fugitives`, `inflation_rate`, `ppp`) as a `resolve_property` step
    with `source == "user_override"`. Replaying with them reproduces the
    original calculation without depending on router enrichment.
    """
    from calc_engine import CalcEngine

    engine = CalcEngine(db)

    records = {r["id"]: r async for r in db.emission_records.find({}, {"_id": 0})}
    logs = await _latest_audit_log_by_record(db)
    formulas = {f["id"]: f async for f in db.ce_formulas.find({}, {"_id": 0})}

    per_bucket: Dict[str, List[str]] = defaultdict(list)
    for rid in sorted(logs):
        rec = records.get(rid)
        if rec is None:
            continue
        per_bucket[bucket_key(rec)].append(rid)

    fixtures: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    drift: List[Dict[str, Any]] = []

    for bucket in sorted(per_bucket):
        for idx, rid in enumerate(per_bucket[bucket][:MAX_FIXTURES_PER_BUCKET]):
            rec = records[rid]
            log = logs[rid]
            if not log.get("formula_id"):
                skipped.append(
                    {
                        "record_id": rid,
                        "bucket": bucket,
                        "reason": "audit_log_has_no_formula_id",
                    }
                )
                continue
            formula_doc = formulas.get(log.get("formula_id"))
            if not formula_doc:
                skipped.append(
                    {
                        "record_id": rid,
                        "bucket": bucket,
                        "reason": "formula_no_longer_exists",
                        "formula_id": log.get("formula_id"),
                    }
                )
                continue
            if not formula_doc.get("is_active", True):
                skipped.append(
                    {"record_id": rid, "bucket": bucket, "reason": "formula_inactive"}
                )
                continue

            definition = dict(formula_doc["definition"])
            definition.setdefault("id", formula_doc["id"])
            definition.setdefault("version_id", formula_doc.get("version_id"))

            inputs = log.get("inputs") or {}
            context = log.get("context") or {}
            user_overrides = reconstruct_user_overrides(log.get("audit_log") or [])

            try:
                result = await engine.execute(
                    formula=definition,
                    inputs=inputs,
                    context=context,
                    user_overrides=user_overrides,
                    dry_run=True,
                )
            except Exception as exc:  # noqa: BLE001 - capture-time diagnosis only
                skipped.append(
                    {
                        "record_id": rid,
                        "bucket": bucket,
                        "reason": f"replay_error: {type(exc).__name__}: {exc}",
                    }
                )
                continue

            replayed = normalise_outputs(result.get("outputs") or {})
            stored = normalise_outputs(log.get("outputs") or {})
            if stable_hash(replayed) != stable_hash(stored):
                drift.append(
                    {
                        "record_id": rid,
                        "bucket": bucket,
                        "formula_id": formula_doc["id"],
                        "stored_outputs": stored,
                        "replayed_outputs": replayed,
                    }
                )

            fixtures.append(
                {
                    "fixture_id": f"{fixture_slug(rec)}__{idx}",
                    "bucket": bucket,
                    "emission_record_id": rid,
                    "audit_log_id": log.get("id"),
                    "formula_id": formula_doc["id"],
                    "formula_name": formula_doc.get("name"),
                    "formula_version_id": formula_doc.get("version_id"),
                    "inputs": inputs,
                    "context": context,
                    "user_overrides": user_overrides,
                    "baseline_outputs": replayed,
                    "stored_outputs": stored,
                    "matches_stored": stable_hash(replayed) == stable_hash(stored),
                }
            )

    return {
        "generated_at": _now(),
        "note": (
            "baseline_outputs = current engine behaviour at capture time. "
            "The refactor must reproduce baseline_outputs exactly. "
            "stored_outputs = value persisted on the record when it was created; "
            "differences are pre-existing drift, reported not fixed."
        ),
        "fixture_count": len(fixtures),
        "bucket_count": len({f["bucket"] for f in fixtures}),
        "fixtures": fixtures,
        "skipped": skipped,
        "stored_vs_replay_drift": drift,
    }


# ------------------------------------------------------------------ capture #2


async def capture_decision_trees(db) -> Dict[str, Any]:
    """Lock formula selection: every decision-tree leaf and the record mapping."""
    cats = {c["id"]: c async for c in db.emission_categories.find({}, {"_id": 0})}
    trees = [t async for t in db.ce_decision_trees.find({"is_active": True}, {"_id": 0})]

    tree_snapshots = []
    for tree in sorted(trees, key=lambda t: t["category_id"]):
        leaves = enumerate_tree_paths(tree.get("tree") or {})
        tree_snapshots.append(
            {
                "decision_tree_id": tree["id"],
                "category_id": tree["category_id"],
                "category_name": (cats.get(tree["category_id"]) or {}).get("name"),
                "tree": strip_volatile(tree.get("tree") or {}),
                "leaf_count": len(leaves),
                "leaves": sorted(
                    leaves, key=lambda leaf: stable_hash(leaf["decision_inputs"])
                ),
            }
        )

    # Record-level expected formula (locks "this stored record still resolves
    # to the same formula" through the real traversal function).
    name_map = await _category_name_to_id(db)
    resolved = name_map["resolved"]
    trees_by_cat = {t["category_id"]: t for t in trees}
    logs = await _latest_audit_log_by_record(db)
    records = {r["id"]: r async for r in db.emission_records.find({}, {"_id": 0})}

    # name -> every category id sharing that name, and (name, scope_code) -> id.
    # The app resolves categories by (name, scope_code) — `Stationary Combustion`
    # and `Mobile Combustion` each exist once under Scope 1 and once under
    # Biogenic, so name alone is not an identity.
    ids_by_name: Dict[str, List[str]] = defaultdict(list)
    ids_by_name_scope: Dict[tuple, str] = {}
    scopes = {s["id"]: s async for s in db.scopes.find({}, {"_id": 0})}
    for cat_id, cat in cats.items():
        ids_by_name[cat["name"]].append(cat_id)
        scope_code = (scopes.get(cat.get("scope_id")) or {}).get("code")
        if scope_code:
            ids_by_name_scope[(cat["name"], scope_code)] = cat_id

    def scope_code_for(record: Dict[str, Any]) -> str:
        """Mirror the frontend's effectiveScope resolution."""
        raw = str(record.get("scope") or "").strip().lower().replace(" ", "")
        if raw == "biogenic":
            return "scope3" if record.get("biogenic_scope_selection") == "scope3" else "biogenic"
        return raw

    # (category_id, formula_id) -> unique decision_inputs, when unambiguous
    leaves_by_cat_formula: Dict[str, Dict[str, List[Dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for snap in tree_snapshots:
        for leaf in snap["leaves"]:
            leaves_by_cat_formula[snap["category_id"]][leaf["formula_id"]].append(
                leaf["decision_inputs"]
            )

    selection_fixtures: List[Dict[str, Any]] = []
    unresolvable: List[Dict[str, Any]] = []
    seen_buckets: Dict[str, int] = defaultdict(int)

    for rid in sorted(logs):
        rec = records.get(rid)
        if rec is None:
            continue
        bucket = bucket_key(rec)
        if seen_buckets[bucket] >= MAX_FIXTURES_PER_BUCKET:
            continue
        stored_formula = logs[rid].get("formula_id")
        if not stored_formula:
            unresolvable.append(
                {"record_id": rid, "bucket": bucket, "reason": "audit_log_has_no_formula_id"}
            )
            continue

        scoped_id = ids_by_name_scope.get((rec.get("category"), scope_code_for(rec)))
        candidate_ids = [scoped_id] if scoped_id else (ids_by_name.get(rec.get("category")) or [])
        if not candidate_ids:
            unresolvable.append(
                {"record_id": rid, "bucket": bucket, "reason": "category_name_not_found"}
            )
            continue

        chosen: Optional[Dict[str, Any]] = None

        # 1) Preferred: rebuild the decision inputs the UI would have sent and
        #    check they resolve to the stored formula.
        for cat_id in sorted(candidate_ids):
            tree = trees_by_cat.get(cat_id)
            attempt = _reconstruct_decision_inputs(rec, (tree or {}).get("tree"))
            if attempt is None:
                continue
            leaves = leaves_by_cat_formula.get(cat_id, {}).get(stored_formula) or []
            if not tree or attempt in leaves:
                chosen = {
                    "category_id": cat_id,
                    "decision_inputs": attempt,
                    "source": "reconstructed_from_record",
                    "has_decision_tree": tree is not None,
                }
                break

        # 2) Fallback: reverse-map the stored formula to its unique tree leaf.
        if chosen is None:
            matches = [
                (cat_id, di)
                for cat_id in sorted(candidate_ids)
                for di in (leaves_by_cat_formula.get(cat_id, {}).get(stored_formula) or [])
            ]
            unique = {stable_hash(di): (cat_id, di) for cat_id, di in matches}
            if len(unique) == 1:
                cat_id, di = next(iter(unique.values()))
                chosen = {
                    "category_id": cat_id,
                    "decision_inputs": di,
                    "source": "reverse_mapped_from_formula",
                    "has_decision_tree": True,
                }

        if chosen is None:
            unresolvable.append(
                {
                    "record_id": rid,
                    "bucket": bucket,
                    "candidate_category_ids": sorted(candidate_ids),
                    "stored_formula_id": stored_formula,
                    "reason": "decision_inputs_not_reconstructible",
                }
            )
            continue

        seen_buckets[bucket] += 1
        selection_fixtures.append(
            {
                "fixture_id": f"sel__{fixture_slug(rec)}__{seen_buckets[bucket] - 1}",
                "bucket": bucket,
                "emission_record_id": rid,
                "category_id": chosen["category_id"],
                "category_name": rec.get("category"),
                "has_decision_tree": chosen["has_decision_tree"],
                "decision_inputs": chosen["decision_inputs"],
                "reconstruction_source": chosen["source"],
                "expected_formula_id": stored_formula,
            }
        )

    resolved_by_scope = {
        f"{name}|{scope}": cid for (name, scope), cid in ids_by_name_scope.items()
    }

    return {
        "generated_at": _now(),
        "tree_count": len(tree_snapshots),
        "category_id_by_name_and_scope": resolved_by_scope,
        "trees": tree_snapshots,
        "selection_fixture_count": len(selection_fixtures),
        "selection_fixtures": selection_fixtures,
        "unresolvable": unresolvable,
    }


# ------------------------------------------------------------------ capture #3


def _normalise_form_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    mappings = []
    for m in cfg.get("input_field_mappings") or []:
        mappings.append(
            {
                "field_key": m.get("field_key"),
                "field_label": m.get("field_label"),
                "field_type": m.get("field_type"),
                "maps_to_variable": m.get("maps_to_variable"),
                "maps_to_context": m.get("maps_to_context"),
                "default_unit": m.get("default_unit"),
                "allowed_units": m.get("allowed_units") or [],
                "is_required": bool(m.get("is_required")),
                "is_override": bool(m.get("is_override")),
                "display_order": m.get("display_order"),
                "unit_source": m.get("unit_source"),
                "compound_with_variable": m.get("compound_with_variable"),
                "options": m.get("options") or [],
                "validation_rules": m.get("validation_rules") or {},
                "placeholder": m.get("placeholder"),
                "help_text": m.get("help_text"),
            }
        )

    formulas = []
    for f in cfg.get("formulas") or []:
        formulas.append(
            {
                "id": f.get("id"),
                "name": f.get("name"),
                "inputs": f.get("inputs") or [],
                "outputs": f.get("outputs") or [],
                "properties": f.get("properties") or [],
            }
        )

    fuels = cfg.get("applicable_fuels") or []
    return {
        "has_decision_tree": cfg.get("has_decision_tree"),
        "decision_tree": strip_volatile(cfg.get("decision_tree") or {}),
        "decision_fields": cfg.get("decision_fields") or [],
        "formulas": sorted(formulas, key=lambda f: str(f["id"])),
        "required_input_variables": sorted(cfg.get("required_input_variables") or []),
        "required_properties": sorted(cfg.get("required_properties") or []),
        "input_field_mappings": mappings,
        "input_field_mapping_order": [m["field_key"] for m in mappings],
        "variables": sorted(
            [
                {
                    "key": v.get("key"),
                    "label": v.get("label"),
                    "type": v.get("type"),
                    "dimension": v.get("dimension"),
                    "default_unit": v.get("default_unit"),
                }
                for v in (cfg.get("variables") or [])
            ],
            key=lambda v: str(v["key"]),
        ),
        "applicable_fuel_count": len(fuels),
        "applicable_fuel_id_hash": stable_hash(
            sorted(str(f.get("id")) for f in fuels if isinstance(f, dict))
        ),
    }


async def capture_form_configs(db, token: str) -> Dict[str, Any]:
    """Lock the input side of field derivation for every active category."""
    cats = [
        c async for c in db.emission_categories.find({"is_active": True}, {"_id": 0})
    ]
    snapshots: Dict[str, Any] = {}
    failures: List[Dict[str, Any]] = []
    headers = auth_header(token)

    for cat in sorted(cats, key=lambda c: (c["name"], c["id"])):
        resp = requests.get(
            f"{API}/calc-engine/form-config/{cat['id']}", headers=headers, timeout=120
        )
        if resp.status_code != 200:
            failures.append(
                {
                    "category_id": cat["id"],
                    "category_name": cat["name"],
                    "status": resp.status_code,
                    "body": resp.text[:300],
                }
            )
            continue
        snapshots[cat["id"]] = {
            "category_name": cat["name"],
            **_normalise_form_config(resp.json()),
        }

    return {
        "generated_at": _now(),
        "category_count": len(snapshots),
        "configs": snapshots,
        "failures": failures,
    }


# ------------------------------------------------------------------ capture #4


def _dfv_shape(dfv: Dict[str, Any]) -> Dict[str, Any]:
    shape = {}
    for key, val in sorted((dfv or {}).items()):
        if isinstance(val, dict):
            shape[key] = {
                "unit": val.get("unit"),
                "value_type": type(val.get("value")).__name__,
                "has_is_override": "is_override" in val,
                "is_override": bool(val.get("is_override")),
                "has_justification": bool(val.get("justification")),
            }
        else:
            shape[key] = {"value_type": type(val).__name__, "flat": True}
    return shape


async def capture_record_contract(db) -> Dict[str, Any]:
    """
    Lock the persisted record contract per behaviour bucket: which top-level
    fields are populated, the dynamic_field_values shape, and output keys.
    A refactor that drops or renames a saved field breaks this immediately.
    """
    records = [r async for r in db.emission_records.find({}, {"_id": 0})]
    per_bucket: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in sorted(records, key=lambda r: r["id"]):
        per_bucket[bucket_key(rec)].append(rec)

    buckets = {}
    for bucket, recs in sorted(per_bucket.items()):
        sample = recs[0]
        buckets[bucket] = {
            "record_count": len(recs),
            "representative_record_id": sample["id"],
            "populated_top_level_fields": sorted(
                k for k, v in sample.items() if v not in (None, "", [], {})
            ),
            "dynamic_field_values_shape": _dfv_shape(
                sample.get("dynamic_field_values") or {}
            ),
            "output_keys": sorted((sample.get("outputs") or {}).keys()),
            "output_units": {
                k: (v.get("unit") if isinstance(v, dict) else None)
                for k, v in sorted((sample.get("outputs") or {}).items())
            },
            "emission_total_fields_present": sorted(
                f
                for f in (
                    "co2_emissions",
                    "ch4_emissions",
                    "n2o_emissions",
                    "co2e_emissions",
                    "total_emissions",
                )
                if sample.get(f) is not None
            ),
        }

    # C7 multi-employee has no calculation audit log by design, so its contract
    # is locked structurally instead.
    c7 = [
        r
        for r in records
        if "C7" in str(r.get("category") or "") and r.get("employees")
    ]
    c7_contract = None
    if c7:
        sample = sorted(c7, key=lambda r: r["id"])[0]
        employees = sample.get("employees") or []
        c7_contract = {
            "record_count": len(c7),
            "representative_record_id": sample["id"],
            "employee_item_keys": sorted(employees[0].keys()) if employees else [],
            "monthly_totals_month_keys": sorted(
                (sample.get("monthly_totals") or {}).keys()
            ),
            "monthly_totals_value_keys": sorted(
                next(iter((sample.get("monthly_totals") or {}).values()), {}).keys()
            ),
            "yearly_total_keys": sorted((sample.get("yearly_total") or {}).keys()),
        }

    return {
        "generated_at": _now(),
        "total_records": len(records),
        "bucket_count": len(buckets),
        "buckets": buckets,
        "c7_multi_employee_contract": c7_contract,
    }


# ------------------------------------------------------------------ capture #5


def capture_api_contract() -> Dict[str, Any]:
    """Freeze the emission API request/response field sets."""
    from modules.emissions.contracts import (
        EmissionHistoryResponse,
        EmissionRecordCreate,
        EmissionRecordResponse,
    )

    def fields(model) -> Dict[str, str]:
        return {
            name: str(field.annotation)
            for name, field in model.model_fields.items()
        }

    return {
        "generated_at": _now(),
        "EmissionRecordCreate": fields(EmissionRecordCreate),
        "EmissionRecordResponse": fields(EmissionRecordResponse),
        "EmissionHistoryResponse": fields(EmissionHistoryResponse),
    }


# ------------------------------------------------------------------ capture #6


async def capture_findings(db, calc: Dict[str, Any], trees: Dict[str, Any]) -> Dict[str, Any]:
    """Pre-existing inconsistencies observed while capturing. Reported, NOT fixed."""
    name_map = await _category_name_to_id(db)

    # Same display name under different scopes is NOT a duplicate identity.
    scope_docs = {s["id"]: s async for s in db.scopes.find({}, {"_id": 0})}
    grouped_cats: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    async for c in db.emission_categories.find({}, {"_id": 0}):
        grouped_cats[c["name"]].append(c)
    same_name_different_scope = [
        {
            "name": nm,
            "definitions": [
                {
                    "id": e["id"],
                    "code": e.get("code"),
                    "scope_id": e.get("scope_id"),
                    "scope_code": (scope_docs.get(e.get("scope_id")) or {}).get("code"),
                    "is_active": e.get("is_active"),
                }
                for e in sorted(entries, key=lambda x: str(x.get("created_at")))
            ],
            "distinct_scope_codes": sorted(
                {
                    str((scope_docs.get(e.get("scope_id")) or {}).get("code"))
                    for e in entries
                }
            ),
        }
        for nm, entries in sorted(grouped_cats.items())
        if len(entries) > 1
    ]


    scopes = sorted(
        {
            str(d["_id"])
            for d in await db.emission_records.aggregate(
                [{"$group": {"_id": "$scope"}}]
            ).to_list(100)
            if d["_id"] is not None
        }
    )
    methods = sorted(
        {
            str(d["_id"])
            for d in await db.emission_records.aggregate(
                [{"$group": {"_id": "$calculation_method_scope3"}}]
            ).to_list(100)
            if d["_id"] is not None
        }
    )
    freqs = sorted(
        {
            str(d["_id"])
            for d in await db.emission_records.aggregate(
                [{"$group": {"_id": "$frequency_type"}}]
            ).to_list(100)
        }
    )
    legacy_scope3 = [
        d["_id"]
        for d in await db.emission_records.aggregate(
            [
                {"$match": {"scope": "scope3"}},
                {"$group": {"_id": "$category"}},
            ]
        ).to_list(200)
        if d["_id"] and not str(d["_id"]).upper().startswith("C")
    ]
    process_type_outside_process = await db.emission_records.count_documents(
        {"process_type": {"$ne": None}, "category": {"$ne": "Process Emissions"}}
    )
    orphan_logs = 0
    rec_ids = {r["id"] async for r in db.emission_records.find({}, {"_id": 0, "id": 1})}
    async for log in db.ce_calculation_audit_logs.find(
        {"emission_record_id": {"$ne": None}}, {"_id": 0, "emission_record_id": 1}
    ):
        if log["emission_record_id"] not in rec_ids:
            orphan_logs += 1

    return {
        "generated_at": _now(),
        "note": "Observed pre-existing inconsistencies. Phase 0 reports them; it does not change behaviour.",
        "duplicate_active_category_names": name_map["duplicates"],
        "same_name_categories_explained": same_name_different_scope,
        "same_name_categories_note": (
            "NOT duplicates: each name exists once per scope (Scope 1 and Biogenic) "
            "with a distinct scope_id and its own decision tree. The application "
            "resolves categories by (name, scope_code), so runtime resolution is "
            "unambiguous. Only name-only resolution is ambiguous."
        ),
        "distinct_scope_values_in_records": scopes,
        "distinct_scope3_method_values_in_records": methods,
        "distinct_frequency_type_values_in_records": freqs,
        "scope3_records_with_legacy_uncoded_category": sorted(legacy_scope3),
        "records_with_process_type_outside_process_emissions": process_type_outside_process,
        "orphan_calculation_audit_logs": orphan_logs,
        "stored_vs_replay_output_drift_count": len(calc["stored_vs_replay_drift"]),
        "stored_vs_replay_output_drift": calc["stored_vs_replay_drift"],
        "calculation_fixtures_skipped": calc["skipped"],
        "formula_selection_unresolvable": trees["unresolvable"],
    }


async def capture_http_endpoint_fixtures(db, token: str, calc: Dict[str, Any], trees: Dict[str, Any]) -> Dict[str, Any]:
    """
    End-to-end fixtures for `POST /api/calc-engine/execute-by-category`.

    This is the endpoint the Add/Edit forms actually call, so it also locks the
    router-side enrichment that the engine replay bypasses:
      * `scope3_ef_id` -> activity/fuel context enrichment,
      * fugitive `co2_gwp_fugitives` injection from `fuel_database`,
      * `spend_basis` inflation_rate / ppp resolution from `currency_conversion`,
      * decision-tree traversal.

    `dry_run=True` keeps it read-only.
    """
    headers = auth_header(token)
    selection_by_record = {s["emission_record_id"]: s for s in trees["selection_fixtures"]}

    fixtures: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for calc_fixture in calc["fixtures"]:
        sel = selection_by_record.get(calc_fixture["emission_record_id"])
        if not sel:
            skipped.append(
                {
                    "record_id": calc_fixture["emission_record_id"],
                    "bucket": calc_fixture["bucket"],
                    "reason": "no_selection_fixture",
                }
            )
            continue

        body = {
            "category_id": sel["category_id"],
            "decision_inputs": sel["decision_inputs"],
            "inputs": calc_fixture["inputs"],
            "context": calc_fixture["context"],
            "user_overrides": calc_fixture["user_overrides"],
            "dry_run": True,
            "scope3_ef_id": (calc_fixture["context"] or {}).get("scope3_ef_id"),
        }
        resp = requests.post(
            f"{API}/calc-engine/execute-by-category", json=body, headers=headers, timeout=180
        )
        if resp.status_code != 200:
            skipped.append(
                {
                    "record_id": calc_fixture["emission_record_id"],
                    "bucket": calc_fixture["bucket"],
                    "reason": f"http_{resp.status_code}",
                    "detail": resp.text[:300],
                }
            )
            continue
        payload = resp.json()
        fixtures.append(
            {
                "fixture_id": f"http__{calc_fixture['fixture_id']}",
                "bucket": calc_fixture["bucket"],
                "emission_record_id": calc_fixture["emission_record_id"],
                "request": body,
                "baseline_resolved_formula_id": (payload.get("resolved_formula") or {}).get("id"),
                "baseline_decision_path": payload.get("decision_path") or [],
                "baseline_outputs": normalise_outputs(payload.get("outputs") or {}),
            }
        )

    return {
        "generated_at": _now(),
        "fixture_count": len(fixtures),
        "bucket_count": len({f["bucket"] for f in fixtures}),
        "fixtures": fixtures,
        "skipped": skipped,
    }


# ---------------------------------------------------------------------- driver


async def main() -> None:
    db = mongo_db()

    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        raise SystemExit("Admin login failed — cannot capture form-config baselines")

    print("[1/7] calculation replay fixtures ...")
    calc = await capture_calculation_fixtures(db)
    save_baseline(CALC_BASELINE, calc)
    print(
        f"      {calc['fixture_count']} fixtures / {calc['bucket_count']} buckets, "
        f"{len(calc['skipped'])} skipped, {len(calc['stored_vs_replay_drift'])} drift"
    )

    print("[2/7] decision trees + formula selection ...")
    trees = await capture_decision_trees(db)
    save_baseline(TREE_BASELINE, trees)
    print(
        f"      {trees['tree_count']} trees, "
        f"{trees['selection_fixture_count']} selection fixtures, "
        f"{len(trees['unresolvable'])} unresolvable"
    )

    print("[3/7] form-config snapshots ...")
    form_cfg = await capture_form_configs(db, token)
    save_baseline(FORM_CONFIG_BASELINE, form_cfg)
    print(f"      {form_cfg['category_count']} categories, {len(form_cfg['failures'])} failures")

    print("[4/7] persisted record contract ...")
    rec = await capture_record_contract(db)
    save_baseline(RECORD_CONTRACT_BASELINE, rec)
    print(f"      {rec['bucket_count']} buckets over {rec['total_records']} records")

    print("[5/7] API contract ...")
    save_baseline(API_CONTRACT_BASELINE, capture_api_contract())

    print("[6/7] findings ...")
    findings = await capture_findings(db, calc, trees)
    save_baseline(FINDINGS, findings)

    print("[7/7] live endpoint fixtures ...")
    http = await capture_http_endpoint_fixtures(db, token, calc, trees)
    save_baseline(HTTP_BASELINE, http)
    print(
        f"      {http['fixture_count']} fixtures / {http['bucket_count']} buckets, "
        f"{len(http['skipped'])} skipped"
    )


if __name__ == "__main__":
    asyncio.run(main())
