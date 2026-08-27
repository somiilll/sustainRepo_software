"""Selective local-to-staging migration with dry-run, backup, and reference validation."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import subprocess
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from dotenv import dotenv_values
from pymongo import MongoClient


MISSING_COLLECTIONS = (
    "login_attempts",
    "supplier_assessment_programs",
    "supplier_document_acceptances",
    "supplier_document_requirements",
    "supplier_document_responses",
    "supplier_document_submissions",
    "supplier_document_versions",
    "supplier_revenue_submissions",
    "supplier_training_assignments",
    "supplier_training_consumption_events",
    "supplier_training_contents",
    "supplier_training_progress",
    "supplier_training_requirements",
    "supplier_training_versions",
)

CATALOG_COLLECTIONS = (
    "ce_variables",
    "ce_properties",
    "ce_input_field_mappings",
    "ce_formulas",
    "ce_formula_versions",
    "ce_decision_trees",
    "ce_decision_tree_versions",
    "currency_conversion",
)

SIMPLE_CATALOG_KEYS = {
    "ce_variables": ("key", {"quantity_used_process_emissions", "ef_heat_basis", "exchange_rate"}),
    "ce_properties": ("key", {"exchange_rate"}),
    "ce_input_field_mappings": ("field_key", {"quantity_used_process_emissions", "ef_heat_basis", "exchange_rate", "qty", "cv"}),
}

AUDIT_FIELDS = {
    "_id", "id", "created_at", "created_by", "created_by_email",
    "updated_at", "updated_by", "updated_by_email",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def parse_time(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def source_time(document: Dict[str, Any]) -> Optional[datetime]:
    return parse_time(document.get("updated_at")) or parse_time(document.get("created_at"))


def without_mongo_id(document: Dict[str, Any]) -> Dict[str, Any]:
    clean = copy.deepcopy(document)
    clean.pop("_id", None)
    return clean


def functional(document: Dict[str, Any]) -> Dict[str, Any]:
    return {key: copy.deepcopy(value) for key, value in document.items() if key not in AUDIT_FIELDS}


def stable_hash(document: Dict[str, Any]) -> str:
    encoded = json.dumps(document, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def deterministic_id(kind: str, logical_id: str, payload: Dict[str, Any]) -> str:
    seed = f"sustainrepo-staging:{kind}:{logical_id}:{stable_hash(payload)}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, seed))


def duplicate_values(collection, key: str, query: Optional[Dict[str, Any]] = None) -> List[Any]:
    rows = collection.aggregate([
        {"$match": query or {key: {"$exists": True}}},
        {"$group": {"_id": f"${key}", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
    ])
    return [row["_id"] for row in rows]


def collect_formula_ids(value: Any, destination: Set[str]) -> None:
    if isinstance(value, dict):
        formula_id = value.get("formula_id")
        if isinstance(formula_id, str):
            destination.add(formula_id)
        for child in value.values():
            collect_formula_ids(child, destination)
    elif isinstance(value, list):
        for child in value:
            collect_formula_ids(child, destination)


class Migration:
    def __init__(self, source_db, target_db):
        self.source = source_db
        self.target = target_db
        self.actions: List[Dict[str, Any]] = []
        self.conflicts: List[str] = []
        self.skipped: Dict[str, Counter] = {name: Counter() for name in MISSING_COLLECTIONS}
        self.planned_missing: Dict[str, List[Dict[str, Any]]] = {name: [] for name in MISSING_COLLECTIONS}

    def add_conflict(self, message: str) -> None:
        self.conflicts.append(message)

    def check_newer_target(self, collection: str, identity: Any, source_doc: Dict[str, Any], target_doc: Dict[str, Any]) -> bool:
        source_updated = source_time(source_doc)
        target_updated = source_time(target_doc)
        if target_updated and (not source_updated or target_updated > source_updated):
            self.add_conflict(f"{collection} {identity}: staging is newer than local")
            return True
        return False

    def plan_missing_collections(self) -> None:
        organizations = set(self.target.organizations.distinct("id"))
        users = set(self.target.users.distinct("id"))
        relationships = set(self.target.supplier_relationships.distinct("id"))

        def user_ok(value: Any) -> bool:
            return not value or value in users

        def include(name: str, document: Dict[str, Any], valid: bool, reason: str = "invalid_reference") -> None:
            if not valid:
                self.skipped[name][reason] += 1
                return
            doc = without_mongo_id(document)
            identity = doc.get("id")
            if not identity:
                self.skipped[name]["missing_id"] += 1
                return
            existing = self.target[name].find_one({"id": identity}, {"_id": 0})
            if existing:
                if stable_hash(existing) != stable_hash(doc):
                    self.add_conflict(f"{name} {identity}: same id has different content")
                return
            self.planned_missing[name].append(doc)

        self.skipped["login_attempts"]["security_telemetry_not_migrated"] = self.source.login_attempts.count_documents({})

        for doc in self.source.supplier_assessment_programs.find({}):
            include("supplier_assessment_programs", doc, doc.get("customer_org_id") in organizations and user_ok(doc.get("created_by")))
        program_ids = set(self.target.supplier_assessment_programs.distinct("program_id")) | {doc["program_id"] for doc in self.planned_missing["supplier_assessment_programs"]}

        for doc in self.source.supplier_document_versions.find({}):
            include("supplier_document_versions", doc, doc.get("customer_org_id") in organizations and user_ok(doc.get("created_by")))
        document_version_ids = set(self.target.supplier_document_versions.distinct("id")) | {doc["id"] for doc in self.planned_missing["supplier_document_versions"]}

        for source_doc in self.source.supplier_document_requirements.find({}):
            doc = without_mongo_id(source_doc)
            doc["supplier_relationship_ids"] = [value for value in doc.get("supplier_relationship_ids", []) if value in relationships]
            doc["excluded_supplier_relationship_ids"] = [value for value in doc.get("excluded_supplier_relationship_ids", []) if value in relationships]
            valid = (
                doc.get("customer_org_id") in organizations
                and doc.get("document_version_id") in document_version_ids
                and (not doc.get("assessment_program_id") or doc.get("assessment_program_id") in program_ids)
                and user_ok(doc.get("created_by"))
            )
            include("supplier_document_requirements", doc, valid)
        document_requirement_ids = set(self.target.supplier_document_requirements.distinct("id")) | {doc["id"] for doc in self.planned_missing["supplier_document_requirements"]}

        for name in ("supplier_document_acceptances", "supplier_document_responses", "supplier_document_submissions"):
            for doc in self.source[name].find({}):
                valid = (
                    doc.get("supplier_relationship_id") in relationships
                    and doc.get("document_requirement_id") in document_requirement_ids
                    and (not doc.get("document_version_id") or doc.get("document_version_id") in document_version_ids)
                    and (not doc.get("customer_org_id") or doc.get("customer_org_id") in organizations)
                    and (not doc.get("supplier_org_id") or doc.get("supplier_org_id") in organizations)
                    and user_ok(doc.get("accepted_by") or doc.get("responded_by") or doc.get("submitted_by"))
                )
                include(name, doc, valid)

        for doc in self.source.supplier_revenue_submissions.find({}):
            valid = (
                doc.get("supplier_relationship_id") in relationships
                and doc.get("customer_org_id") in organizations
                and doc.get("supplier_org_id") in organizations
                and user_ok(doc.get("submitted_by"))
            )
            include("supplier_revenue_submissions", doc, valid)

        for doc in self.source.supplier_training_contents.find({}):
            include("supplier_training_contents", doc, doc.get("organization_id") in organizations and user_ok(doc.get("created_by")))
        training_content_ids = set(self.target.supplier_training_contents.distinct("id")) | {doc["id"] for doc in self.planned_missing["supplier_training_contents"]}

        for doc in self.source.supplier_training_versions.find({}):
            include("supplier_training_versions", doc, doc.get("training_content_id") in training_content_ids and user_ok(doc.get("created_by")))
        training_version_ids = set(self.target.supplier_training_versions.distinct("id")) | {doc["id"] for doc in self.planned_missing["supplier_training_versions"]}

        for doc in self.source.supplier_training_requirements.find({}):
            valid = (
                doc.get("organization_id") in organizations
                and doc.get("training_content_id") in training_content_ids
                and doc.get("training_version_id") in training_version_ids
                and user_ok(doc.get("created_by"))
            )
            include("supplier_training_requirements", doc, valid)
        training_requirement_ids = set(self.target.supplier_training_requirements.distinct("id")) | {doc["id"] for doc in self.planned_missing["supplier_training_requirements"]}

        for doc in self.source.supplier_training_assignments.find({}):
            valid = (
                doc.get("supplier_relationship_id") in relationships
                and doc.get("training_requirement_id") in training_requirement_ids
                and doc.get("requirement_version_id") in training_version_ids
                and doc.get("organization_id") in organizations
            )
            include("supplier_training_assignments", doc, valid)
        training_assignment_ids = set(self.target.supplier_training_assignments.distinct("id")) | {doc["id"] for doc in self.planned_missing["supplier_training_assignments"]}

        for name in ("supplier_training_progress", "supplier_training_consumption_events"):
            for doc in self.source[name].find({}):
                valid = (
                    doc.get("supplier_relationship_id") in relationships
                    and doc.get("training_assignment_id") in training_assignment_ids
                    and doc.get("training_version_id") in training_version_ids
                    and user_ok(doc.get("updated_by") or doc.get("recorded_by"))
                )
                include(name, doc, valid)

    def plan_simple_catalog(self) -> None:
        variable_id_by_key = {doc["key"]: doc["id"] for doc in self.target.ce_variables.find({}, {"_id": 0, "id": 1, "key": 1})}
        for collection_name, (logical_key, allowed_values) in SIMPLE_CATALOG_KEYS.items():
            source_collection = self.source[collection_name]
            target_collection = self.target[collection_name]
            duplicates = duplicate_values(target_collection, logical_key)
            if duplicates:
                self.add_conflict(f"{collection_name}: duplicate staging logical keys {duplicates}")
                continue
            for source_doc in source_collection.find({logical_key: {"$in": sorted(allowed_values)}}):
                source_doc = without_mongo_id(source_doc)
                identity = source_doc[logical_key]
                target_doc = target_collection.find_one({logical_key: identity}, {"_id": 0})
                desired = functional(source_doc)
                if collection_name == "ce_properties" and source_doc.get("variable_id"):
                    source_variable = self.source.ce_variables.find_one({"id": source_doc["variable_id"]}, {"_id": 0, "key": 1})
                    if not source_variable or source_variable["key"] not in variable_id_by_key:
                        self.add_conflict(f"ce_properties {identity}: unresolved staging variable")
                        continue
                    desired["variable_id"] = variable_id_by_key[source_variable["key"]]
                if not target_doc:
                    collision = target_collection.find_one({"id": source_doc.get("id")}, {"_id": 0, logical_key: 1})
                    if collision:
                        self.add_conflict(f"{collection_name} {identity}: source id belongs to {collision.get(logical_key)} in staging")
                        continue
                    self.actions.append({"type": "simple_insert", "collection": collection_name, "document": source_doc, "identity": identity})
                    if collection_name == "ce_variables":
                        variable_id_by_key[identity] = source_doc["id"]
                    continue
                if functional(target_doc) == desired:
                    continue
                known_exchange_rate_legacy = (
                    collection_name == "ce_variables"
                    and identity == "exchange_rate"
                    and target_doc.get("default_unit") == "1"
                    and target_doc.get("dimension") == "dimensionless"
                    and source_doc.get("default_unit") == ""
                    and source_doc.get("dimension") == "generic"
                )
                if not known_exchange_rate_legacy and self.check_newer_target(collection_name, identity, source_doc, target_doc):
                    continue
                self.actions.append({"type": "simple_update", "collection": collection_name, "filter": {logical_key: identity}, "desired": desired, "identity": identity})

    def plan_formulas(self) -> None:
        target_formula_ids = set(self.target.ce_formulas.distinct("id"))
        for source_doc in self.source.ce_formulas.find({}):
            source_doc = without_mongo_id(source_doc)
            formula_id = source_doc["id"]
            target_doc = self.target.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
            desired = functional(source_doc)
            for key in ("version_id", "version_number"):
                desired.pop(key, None)
            if not target_doc:
                version_payload = {"formula_id": formula_id, "definition": source_doc.get("definition")}
                version_id = deterministic_id("formula-version", formula_id, version_payload)
                self.actions.append({"type": "formula_insert", "source": source_doc, "version_id": version_id, "identity": formula_id})
                target_formula_ids.add(formula_id)
                continue
            target_desired = functional(target_doc)
            for key in ("version_id", "version_number"):
                target_desired.pop(key, None)
            if target_desired == desired:
                continue
            if self.check_newer_target("ce_formulas", formula_id, source_doc, target_doc):
                continue
            definition_changed = target_doc.get("definition") != source_doc.get("definition")
            if definition_changed:
                latest = self.target.ce_formula_versions.find_one({"formula_id": formula_id}, {"_id": 0, "version_number": 1}, sort=[("version_number", -1)])
                next_version = int((latest or {}).get("version_number") or target_doc.get("version_number") or 0) + 1
                version_payload = {"formula_id": formula_id, "version_number": next_version, "definition": source_doc.get("definition")}
                version_id = deterministic_id("formula-version", formula_id, version_payload)
                self.actions.append({"type": "formula_version_update", "source": source_doc, "version_id": version_id, "version_number": next_version, "identity": formula_id})
            else:
                self.actions.append({"type": "formula_metadata_update", "source": source_doc, "identity": formula_id})

        desired_formula_ids = set(self.source.ce_formulas.distinct("id")) | target_formula_ids
        for source_doc in self.source.ce_decision_trees.find({}):
            source_doc = without_mongo_id(source_doc)
            tree_id = source_doc["id"]
            target_doc = self.target.ce_decision_trees.find_one({"id": tree_id}, {"_id": 0})
            if not target_doc:
                self.add_conflict(f"ce_decision_trees {tree_id}: tree is missing in staging")
                continue
            referenced_formula_ids: Set[str] = set()
            collect_formula_ids(source_doc.get("tree"), referenced_formula_ids)
            unresolved = sorted(referenced_formula_ids - desired_formula_ids)
            if unresolved:
                self.add_conflict(f"ce_decision_trees {tree_id}: unresolved formulas {unresolved}")
                continue
            if source_doc.get("tree") == target_doc.get("tree"):
                continue
            if self.check_newer_target("ce_decision_trees", tree_id, source_doc, target_doc):
                continue
            latest = self.target.ce_decision_tree_versions.find_one({"source_tree_id": tree_id}, {"_id": 0, "version_number": 1}, sort=[("version_number", -1)])
            next_version = int((latest or {}).get("version_number") or target_doc.get("version_number") or 0) + 1
            version_payload = {"tree_id": tree_id, "version_number": next_version, "tree": source_doc.get("tree")}
            version_id = deterministic_id("decision-tree-version", tree_id, version_payload)
            snapshot_id = deterministic_id("decision-tree-snapshot", tree_id, version_payload)
            self.actions.append({"type": "tree_version_update", "source": source_doc, "version_id": version_id, "snapshot_id": snapshot_id, "version_number": next_version, "identity": tree_id})

    def plan_currency(self) -> None:
        identity_fields = ("source_currency", "target_currency", "year_applicable", "month_applicable", "conversion_method")
        for source_doc in self.source.currency_conversion.find({}):
            source_doc = without_mongo_id(source_doc)
            same_id = self.target.currency_conversion.find_one({"id": source_doc.get("id")}, {"_id": 0})
            if same_id and same_id.get("conversion_method") is None and source_doc.get("conversion_method"):
                self.actions.append({"type": "currency_update", "filter": {"id": source_doc["id"]}, "source": source_doc, "identity": source_doc["id"]})
                continue
            identity = {field: source_doc.get(field) for field in identity_fields}
            target_doc = self.target.currency_conversion.find_one(identity, {"_id": 0})
            if not target_doc:
                if same_id:
                    self.add_conflict(f"currency_conversion {source_doc['id']}: staging id has a different logical identity")
                    continue
                self.actions.append({"type": "currency_insert", "source": source_doc, "identity": identity})
                continue
            comparable_fields = ("exchange_rate", "purchase_parity", "inflation_factor", "is_active")
            if any(target_doc.get(field) != source_doc.get(field) for field in comparable_fields):
                if self.check_newer_target("currency_conversion", identity, source_doc, target_doc):
                    continue
                self.actions.append({"type": "currency_update", "filter": identity, "source": source_doc, "identity": identity})

    def plan(self) -> Dict[str, Any]:
        self.plan_missing_collections()
        self.plan_simple_catalog()
        self.plan_formulas()
        self.plan_currency()
        return self.summary()

    def summary(self) -> Dict[str, Any]:
        action_counts = Counter(action["type"] for action in self.actions)
        return {
            "missing_collection_inserts": {name: len(documents) for name, documents in self.planned_missing.items()},
            "skipped_missing_collection_records": {name: dict(reasons) for name, reasons in self.skipped.items() if reasons},
            "catalog_actions": dict(action_counts),
            "conflicts": self.conflicts,
        }

    def apply_actions(self, session) -> None:
        migration_time = now_iso()
        for collection_name, documents in self.planned_missing.items():
            collection = self.target[collection_name]
            for document in documents:
                collection.update_one({"id": document["id"]}, {"$setOnInsert": document}, upsert=True, session=session)

        for action in self.actions:
            collection = self.target[action.get("collection")] if action.get("collection") else None
            if action["type"] == "simple_insert":
                document = {**action["document"], "created_at": migration_time, "created_by": "staging-catalog-migration", "updated_at": migration_time, "updated_by": "staging-catalog-migration"}
                collection.update_one({"id": document["id"]}, {"$setOnInsert": document}, upsert=True, session=session)
            elif action["type"] == "simple_update":
                desired = action["desired"]
                existing = collection.find_one(action["filter"], {"_id": 0}, session=session) or {}
                unset_fields = {key: "" for key in functional(existing) if key not in desired}
                update = {"$set": {**desired, "updated_at": migration_time, "updated_by": "staging-catalog-migration"}}
                if unset_fields:
                    update["$unset"] = unset_fields
                collection.update_one(action["filter"], update, session=session)
            elif action["type"] == "formula_insert":
                source = action["source"]
                version_number = 1
                version = {**source, "id": action["version_id"], "formula_id": source["id"], "source_formula_id": source["id"], "version_id": action["version_id"], "version_number": version_number, "is_active": True, "created_at": migration_time, "created_by": "staging-catalog-migration"}
                formula = {**source, "version_id": action["version_id"], "version_number": version_number, "created_at": migration_time, "created_by": "staging-catalog-migration", "updated_at": migration_time, "updated_by": "staging-catalog-migration"}
                self.target.ce_formula_versions.update_one({"id": version["id"]}, {"$setOnInsert": version}, upsert=True, session=session)
                self.target.ce_formulas.update_one({"id": formula["id"]}, {"$setOnInsert": formula}, upsert=True, session=session)
            elif action["type"] == "formula_version_update":
                source = action["source"]
                self.target.ce_formula_versions.update_many({"formula_id": source["id"], "is_active": True}, {"$set": {"is_active": False, "effective_to": migration_time}}, session=session)
                version = {**source, "id": action["version_id"], "formula_id": source["id"], "source_formula_id": source["id"], "version_id": action["version_id"], "version_number": action["version_number"], "is_active": True, "effective_from": migration_time, "effective_to": None, "created_at": migration_time, "created_by": "staging-catalog-migration"}
                self.target.ce_formula_versions.update_one({"id": version["id"]}, {"$setOnInsert": version}, upsert=True, session=session)
                formula_updates = functional(source)
                formula_updates.update({"version_id": action["version_id"], "version_number": action["version_number"], "updated_at": migration_time, "updated_by": "staging-catalog-migration"})
                self.target.ce_formulas.update_one({"id": source["id"]}, {"$set": formula_updates}, session=session)
            elif action["type"] == "formula_metadata_update":
                updates = functional(action["source"])
                updates.pop("version_id", None); updates.pop("version_number", None)
                updates.update({"updated_at": migration_time, "updated_by": "staging-catalog-migration"})
                self.target.ce_formulas.update_one({"id": action["source"]["id"]}, {"$set": updates}, session=session)
            elif action["type"] == "tree_version_update":
                source = action["source"]
                self.target.ce_decision_tree_versions.update_many({"source_tree_id": source["id"], "is_active": True}, {"$set": {"is_active": False, "effective_to": migration_time}}, session=session)
                snapshot = {**source, "id": action["snapshot_id"], "source_tree_id": source["id"], "version_id": action["version_id"], "version_number": action["version_number"], "is_active": True, "effective_from": migration_time, "effective_to": None, "created_at": migration_time, "created_by": "staging-catalog-migration"}
                self.target.ce_decision_tree_versions.update_one({"id": snapshot["id"]}, {"$setOnInsert": snapshot}, upsert=True, session=session)
                self.target.ce_decision_trees.update_one({"id": source["id"]}, {"$set": {"tree": source.get("tree"), "version_id": action["version_id"], "version_number": action["version_number"], "updated_at": migration_time, "updated_by": "staging-catalog-migration"}}, session=session)
            elif action["type"] == "currency_insert":
                document = {**action["source"], "created_at": migration_time, "created_by": "staging-catalog-migration", "updated_at": migration_time, "updated_by": "staging-catalog-migration"}
                self.target.currency_conversion.update_one({"id": document["id"]}, {"$setOnInsert": document}, upsert=True, session=session)
            elif action["type"] == "currency_update":
                updates = functional(action["source"])
                updates.update({"updated_at": migration_time, "updated_by": "staging-catalog-migration"})
                self.target.currency_conversion.update_one(action["filter"], {"$set": updates}, session=session)


def copy_missing_indexes(source_db, target_db) -> None:
    existing_collections = set(target_db.list_collection_names())
    for collection_name in MISSING_COLLECTIONS:
        if collection_name not in existing_collections:
            target_db.create_collection(collection_name)
        target_indexes = target_db[collection_name].index_information()
        for spec in source_db[collection_name].list_indexes():
            index = dict(spec)
            name = index.pop("name")
            index.pop("v", None)
            key = list(index.pop("key").items())
            if name == "_id_" or name in target_indexes:
                continue
            target_db[collection_name].create_index(key, name=name, **index)


def backup_target(uri: str, target_db, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=False)
    existing = set(target_db.list_collection_names())
    collections = sorted((set(CATALOG_COLLECTIONS) | set(MISSING_COLLECTIONS)) & existing)
    for collection_name in collections:
        subprocess.run(
            ["mongodump", "--quiet", "--uri", uri, "--db", target_db.name, "--collection", collection_name, "--out", str(directory)],
            check=True,
            capture_output=True,
        )
    manifest = {"created_at": now_iso(), "database": target_db.name, "collections": collections}
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2))


def validate_target(target_db) -> Dict[str, Any]:
    missing_collections = sorted(set(MISSING_COLLECTIONS) - set(target_db.list_collection_names()))
    formula_version_errors = []
    for formula in target_db.ce_formulas.find({}, {"_id": 0, "id": 1, "version_id": 1}):
        if not target_db.ce_formula_versions.find_one({"id": formula.get("version_id"), "formula_id": formula["id"]}, {"_id": 1}):
            formula_version_errors.append(formula["id"])
    formula_ids = set(target_db.ce_formulas.distinct("id"))
    unresolved_tree_formulas: Set[str] = set()
    for tree in target_db.ce_decision_trees.find({"is_active": True}, {"_id": 0, "tree": 1}):
        referenced: Set[str] = set()
        collect_formula_ids(tree.get("tree"), referenced)
        unresolved_tree_formulas.update(referenced - formula_ids)
    duplicate_active_versions = list(target_db.ce_formula_versions.aggregate([
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$formula_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$ne": 1}}},
    ]))
    return {
        "missing_collections": missing_collections,
        "formula_current_version_errors": formula_version_errors,
        "unresolved_decision_tree_formula_ids": sorted(unresolved_tree_formulas),
        "formula_ids_with_nonunique_active_versions": [row["_id"] for row in duplicate_active_versions],
    }


def run(apply: bool) -> Dict[str, Any]:
    local_config = dotenv_values("/app/backend/.env")
    source_uri = local_config.get("MONGO_URL")
    source_db_name = local_config.get("DB_NAME")
    target_uri = os.environ.get("STAGING_MONGO_URL")
    target_db_name = os.environ.get("STAGING_DB_NAME")
    if not source_uri or not source_db_name or not target_uri or not target_db_name:
        raise RuntimeError("MONGO_URL, DB_NAME, STAGING_MONGO_URL, and STAGING_DB_NAME are required")
    if target_db_name != "sustainrepo_staging":
        raise RuntimeError("Target database must be sustainrepo_staging")

    source_client = MongoClient(source_uri, serverSelectionTimeoutMS=15000)
    target_client = MongoClient(target_uri, serverSelectionTimeoutMS=15000, retryWrites=True)
    source_client.admin.command("ping"); target_client.admin.command("ping")
    source_db = source_client[source_db_name]
    target_db = target_client[target_db_name]

    migration = Migration(source_db, target_db)
    plan = migration.plan()
    result = {"mode": "apply" if apply else "dry-run", "plan": plan}
    if migration.conflicts:
        result["status"] = "blocked-conflicts"
        return result
    if not apply:
        result["status"] = "ready"
        return result

    backup_directory = Path("/app/.emergent/backups") / f"staging-migration-{timestamp()}"
    backup_target(target_uri, target_db, backup_directory)
    copy_missing_indexes(source_db, target_db)
    with target_client.start_session() as session:
        with session.start_transaction():
            migration.apply_actions(session)

    validation = validate_target(target_db)
    result.update({"status": "applied", "backup_directory": str(backup_directory), "validation": validation})
    if any(validation.values()):
        result["status"] = "applied-validation-failed"
    source_client.close(); target_client.close()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    arguments = parser.parse_args()
    print(json.dumps(run(arguments.apply), indent=2, default=str))