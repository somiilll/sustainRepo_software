"""Canonical calculation-audit persistence helpers for Bulk Upload records."""

from datetime import datetime, timezone
from typing import Dict, Iterable, List
import uuid


def prepare_bulk_calculation_audits(records: Iterable[Dict]) -> List[Dict]:
    """Extract transient calculation traces before emission-record insertion."""
    audit_documents: List[Dict] = []
    for record in records:
        calculation_audit = record.pop("_calculation_audit", None) or {}
        audit_log = calculation_audit.get("audit_log") or record.get("audit_log") or []
        if not audit_log:
            continue

        audit_documents.append({
            "id": str(uuid.uuid4()),
            "emission_record_id": record.get("id"),
            "org_id": record.get("organization_id"),
            "formula_id": record.get("formula_id"),
            "formula_version_id": record.get("formula_version_id"),
            "decision_tree_version_id": record.get("decision_tree_version_id"),
            "formula_snapshot": record.get("formula_snapshot"),
            "inputs": calculation_audit.get("inputs") or {},
            "context": calculation_audit.get("context") or {
                "scope": record.get("scope"),
                "category": record.get("category"),
                "reporting_period": record.get("reporting_period"),
                "scope3_ef_id": record.get("scope3_ef_id"),
            },
            "outputs": calculation_audit.get("outputs") or record.get("outputs") or {},
            "applied_factors": calculation_audit.get("applied_factors") or record.get("applied_factors") or {},
            "audit_log": audit_log,
            "source": "bulk_upload",
            "bulk_upload_job_id": record.get("bulk_upload_job_id"),
            "created_at": record.get("created_at") or datetime.now(timezone.utc).isoformat(),
        })

    return audit_documents


async def persist_bulk_calculation_audits(db, audit_documents: List[Dict]) -> None:
    """Persist calculation traces used by the Edit Emission dialog."""
    if audit_documents:
        await db.ce_calculation_audit_logs.insert_many(audit_documents)