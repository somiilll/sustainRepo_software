"""Reusable FastAPI dependencies for canonical entitlement enforcement."""
from collections import defaultdict
from typing import Any

from fastapi import Depends, HTTPException

from modules.auth.dependencies import get_current_user
from .service import entitlement_access_map, resolve_entitlement_config, resolve_entitlements


async def assert_entitlement(org_id: str, entitlement: str) -> None:
    config = await resolve_entitlement_config(org_id, migrate=True)
    allowed = entitlement_access_map(config).get(entitlement, False)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"{entitlement.replace('_', ' ').title()} is not enabled for this organization")


async def get_resolved_entitlements(org_id: str) -> dict:
    """Return the detailed policy document without ever consulting legacy flags."""
    return await resolve_entitlement_config(org_id, migrate=True)


async def assert_ghg_scope_access(org_id: str, scope: str, biogenic_scope_selection: str | None = None) -> None:
    await assert_entitlement(org_id, "environment.ghg")
    normalized_scope = (scope or "").lower().replace(" ", "")
    is_scope_three = normalized_scope == "scope3" or (
        normalized_scope == "biogenic" and biogenic_scope_selection == "scope3"
    )
    if is_scope_three:
        await assert_entitlement(org_id, "environment.ghg.scope_3")
    elif normalized_scope in {"scope1", "scope2", "biogenic"}:
        await assert_entitlement(org_id, "environment.ghg.scope_1_2")


async def assert_monthly_row_limit(org_id: str, module_code: str, collection: str, query: dict) -> None:
    """Block a new monthly row once its Platform Access allowance is exhausted."""
    config = await get_resolved_entitlements(org_id)
    module = (config.get("environment") or {}).get(module_code) or {}
    if not module.get("enabled", False):
        raise HTTPException(status_code=403, detail=f"{module_code.replace('_', ' ').title()} is not enabled for this organization")
    limit = module.get("monthly_rows_allowed")
    if limit is None:
        return
    from shared.database.mongo import db
    current = await db[collection].count_documents(query)
    if current >= limit:
        raise HTTPException(status_code=403, detail=f"Monthly row limit reached for {module_code.replace('_', ' ')} ({limit}).")


def build_period_row_query(org_id: str, frequency_type: str, reporting_period: str) -> dict:
    """Build the canonical GHG record-count query for one reporting period."""
    query = {
        "organization_id": org_id,
        "reporting_period": reporting_period,
        "is_current_revision": {"$ne": False},
    }
    if frequency_type == "yearly":
        query["frequency_type"] = "yearly"
    else:
        # Legacy monthly rows, including C7 rows, may not store frequency_type.
        query["frequency_type"] = {"$in": ["monthly", None]}
    return query


async def get_period_row_allowance(org_id: str, module_code: str, frequency_type: str) -> tuple[int | None, int | None]:
    """Return (effective allowance, configured monthly allowance)."""
    config = await get_resolved_entitlements(org_id)
    module = (config.get("environment") or {}).get(module_code) or {}
    if not module.get("enabled", False):
        raise HTTPException(
            status_code=403,
            detail=f"{module_code.replace('_', ' ').title()} is not enabled for this organization",
        )

    monthly_limit = module.get("monthly_rows_allowed")
    if monthly_limit is None:
        return None, None
    effective_limit = monthly_limit * 12 if frequency_type == "yearly" else monthly_limit
    return effective_limit, monthly_limit


def format_period_row_limit_error(
    module_code: str,
    frequency_type: str,
    reporting_period: str,
    limit: int,
    monthly_limit: int,
    current_count: int,
    accepted_in_batch: int = 0,
) -> str:
    module_name = module_code.replace("_", " ").upper() if module_code == "ghg" else module_code.replace("_", " ").title()
    if frequency_type == "yearly":
        allowance = f"{limit} rows ({monthly_limit} monthly rows × 12)"
        period_label = "reporting year"
    else:
        allowance = f"{limit} rows"
        period_label = "reporting month"
    batch_context = (
        f" {accepted_in_batch} earlier row(s) in this upload use the remaining allowance."
        if accepted_in_batch
        else ""
    )
    return (
        f"{module_name} row limit exceeded for {period_label} {reporting_period}: "
        f"maximum {allowance}; {current_count} already saved.{batch_context}"
    )


async def partition_records_by_period_row_limit(
    org_id: str,
    module_code: str,
    collection: str,
    records: list[dict[str, Any]],
    database=None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Keep records within each period allowance and describe every rejected row."""
    if not records:
        return [], []

    frequency_types = {
        "yearly" if record.get("frequency_type") == "yearly" else "monthly"
        for record in records
    }
    allowances = {
        frequency_type: await get_period_row_allowance(org_id, module_code, frequency_type)
        for frequency_type in frequency_types
    }
    if all(limit is None for limit, _ in allowances.values()):
        return list(records), []

    if database is None:
        from shared.database.mongo import db as database

    current_counts: dict[tuple[str, str], int] = {}
    accepted_counts: dict[tuple[str, str], int] = defaultdict(int)
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for record in records:
        frequency_type = "yearly" if record.get("frequency_type") == "yearly" else "monthly"
        reporting_period = str(record.get("reporting_period") or "").strip()
        limit, monthly_limit = allowances[frequency_type]
        if limit is None:
            accepted.append(record)
            continue

        key = (frequency_type, reporting_period)
        if key not in current_counts:
            current_counts[key] = await database[collection].count_documents(
                build_period_row_query(org_id, frequency_type, reporting_period)
            )

        current_count = current_counts[key]
        if current_count + accepted_counts[key] >= limit:
            rejected.append({
                "record": record,
                "frequency_type": frequency_type,
                "reporting_period": reporting_period,
                "limit": limit,
                "monthly_limit": monthly_limit,
                "current_count": current_count,
                "accepted_in_batch": accepted_counts[key],
                "message": format_period_row_limit_error(
                    module_code,
                    frequency_type,
                    reporting_period,
                    limit,
                    monthly_limit,
                    current_count,
                    accepted_counts[key],
                ),
            })
            continue

        accepted_counts[key] += 1
        accepted.append(record)

    return accepted, rejected


async def assert_period_row_limit(
    org_id: str,
    module_code: str,
    collection: str,
    frequency_type: str,
    reporting_period: str,
    incoming_rows: int = 1,
    database=None,
) -> None:
    """Block a manual or batch save that would exceed one period's allowance."""
    probe_records = [
        {"frequency_type": frequency_type, "reporting_period": reporting_period}
        for _ in range(incoming_rows)
    ]
    _, rejected = await partition_records_by_period_row_limit(
        org_id,
        module_code,
        collection,
        probe_records,
        database=database,
    )
    if rejected:
        raise HTTPException(status_code=403, detail=rejected[0]["message"])


async def assert_period_row_batch_limit(
    org_id: str,
    module_code: str,
    collection: str,
    records: list[dict[str, Any]],
    database=None,
) -> None:
    """Recheck an entire batch immediately before persistence."""
    _, rejected = await partition_records_by_period_row_limit(
        org_id,
        module_code,
        collection,
        records,
        database=database,
    )
    if rejected:
        first = rejected[0]
        extra = len(rejected) - 1
        suffix = f" Another {extra} row(s) also exceed configured limits." if extra else ""
        raise HTTPException(status_code=403, detail=f"{first['message']}{suffix}")


async def assert_supplier_limit(org_id: str) -> None:
    config = await get_resolved_entitlements(org_id)
    settings = config["supplier_assessment"]
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="Supplier Assessment is not enabled for this organization")
    limit = settings.get("suppliers_allowed")
    if limit is None:
        return
    from shared.database.mongo import db
    current = await db.supplier_relationships.count_documents({"customer_org_id": org_id, "is_active": True})
    if current >= limit:
        raise HTTPException(status_code=403, detail=f"Supplier limit reached ({limit}).")


async def assert_mis_schedule_limit(org_id: str) -> None:
    config = await get_resolved_entitlements(org_id)
    settings = config["mis_reports"]
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="MIS Reports is not enabled for this organization")
    limit = settings.get("configurations_allowed")
    if limit is None:
        return
    from shared.database.mongo import db
    current = await db.mis_report_schedules.count_documents({"organization_id": org_id})
    if current >= limit:
        raise HTTPException(status_code=403, detail=f"MIS schedule limit reached ({limit}).")


async def assert_evidence_storage_limit(org_id: str, incoming_bytes: int) -> None:
    config = await get_resolved_entitlements(org_id)
    settings = config["evidence_storage"]
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="Evidence Storage is not enabled for this organization")
    limit_gb = settings.get("storage_limit_gb")
    if limit_gb is None:
        return
    from shared.database.mongo import db
    totals = await db.uploaded_files.aggregate([
        {"$match": {"organization_id": org_id}},
        {"$group": {"_id": None, "bytes": {"$sum": "$file_size"}}},
    ]).to_list(1)
    used_bytes = (totals[0].get("bytes") or 0) if totals else 0
    if used_bytes + incoming_bytes > limit_gb * 1024 * 1024 * 1024:
        raise HTTPException(status_code=403, detail=f"Evidence storage limit reached ({limit_gb} GB).")


def require_entitlement(entitlement: str):
    async def dependency(current_user: dict = Depends(get_current_user)) -> None:
        if current_user.get("role") == "super_admin":
            return
        org_id = current_user.get("organization_id")
        if not org_id:
            raise HTTPException(status_code=400, detail="No organization assigned")
        await assert_entitlement(org_id, entitlement)

    return dependency