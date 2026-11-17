"""
KPI Engine - Energy Module Adapter

Total / Renewable / Non-renewable energy (GJ) read only from ESG Energy records in
`environment_records` (manual entries and GHG-derived rows alike). Only approved or
approval-not-required, non-draft, current records are counted.
"""

from typing import Any, Dict, List, Optional
from shared.database.mongo import db
from shared.unit_registry import convert as unit_convert
from .utils import build_period_filter, format_result

CARRIERS = ("fuel", "electricity", "heating", "cooling", "steam")
ELIGIBLE_RECORD_FILTER = {
    "is_current": {"$ne": False},
    "status": {"$ne": "draft"},
    "approval_status": {"$in": ["approved", "not_required", None]},
}


def to_gj(value: float, unit: str) -> float:
    """Convert any energy unit to GJ using the centralized unit registry."""
    if not value or not unit:
        return 0
    return unit_convert(value, unit, "GJ")


def _carrier(subcategory: Optional[str]) -> Optional[str]:
    """Within-organisation carrier of an Energy subcategory (outside-org and reduction rows are not consumption)."""
    sub = (subcategory or "").lower()
    if "outside" in sub or "reduction" in sub:
        return None
    return next((c for c in CARRIERS if c in sub), None)


def _gj(fv: Dict[str, Any], key: str) -> float:
    """Field value in GJ; fields without a stored unit use the Energy form default (J)."""
    try:
        value = float(fv.get(key) or 0)
    except (TypeError, ValueError):
        return 0.0
    return to_gj(value, fv.get(f"{key}_unit") or "J") if value else 0.0


def _record_energy(rec: Dict[str, Any]) -> Optional[Dict[str, float]]:
    """{"total", "renewable"} in GJ for one Energy record, or None if it is not within-organisation consumption."""
    carrier = _carrier(rec.get("subcategory"))
    if not carrier:
        return None
    fv = rec.get("field_values") or {}
    if carrier == "electricity":
        renewable = _gj(fv, "renewable_electricity")
        total = _gj(fv, "quantity") or (_gj(fv, "grid_electricity") + renewable)
    elif carrier == "fuel":
        total = _gj(fv, "quantity")
        sub_sub = (rec.get("sub_subcategory") or "").lower()
        renewable = total if "renewable" in sub_sub and "non" not in sub_sub else 0.0
    else:
        renewable = _gj(fv, f"renewable_{carrier}")
        total = _gj(fv, "quantity") or (_gj(fv, f"non_renewable_{carrier}") + renewable)
    return {"total": total, "renewable": min(renewable, total) if total else renewable}


async def _energy_totals(
    org_id: str, scope_type: str, facility_ids: Optional[List[str]], period: Optional[Dict[str, Any]],
) -> Dict[str, float]:
    query: Dict[str, Any] = {"org_id": org_id, "category": {"$regex": "^Energy$", "$options": "i"}, **ELIGIBLE_RECORD_FILTER}
    if scope_type == "facility" and facility_ids:
        query["facility_id"] = {"$in": facility_ids}
    if period:
        query.update(build_period_filter(**{k: v for k, v in period.items() if k != "reporting_year_type"}))

    total = renewable = 0.0
    count = 0
    async for rec in db.environment_records.find(query, {"_id": 0, "subcategory": 1, "sub_subcategory": 1, "field_values": 1}):
        energy = _record_energy(rec)
        if energy and (energy["total"] > 0 or energy["renewable"] > 0):
            total += energy["total"]
            renewable += energy["renewable"]
            count += 1
    return {"total": round(total, 4), "renewable": round(renewable, 4),
            "non_renewable": round(max(total - renewable, 0.0), 4), "record_count": count}


async def calculate_total_energy(
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Total energy consumption (GJ) = sum of Energy records' `quantity`."""
    t = await _energy_totals(org_id, scope_type, facility_ids, period)
    return format_result(
        value=t["total"] if t["record_count"] > 0 else None,
        unit="GJ",
        record_count=t["record_count"],
        aggregation_type="sum",
        metadata={"kpi_id": "energy_total_consumption", "kpi_name": "Total Energy Consumption",
                  "source_collection": "environment_records", "query_period": period},
    )


async def calculate_renewable_energy(
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Total renewable energy (GJ): renewable electricity / heating / cooling / steam fields."""
    t = await _energy_totals(org_id, scope_type, facility_ids, period)
    return format_result(
        value=t["renewable"] if t["record_count"] > 0 else None,
        unit="GJ",
        record_count=t["record_count"],
        aggregation_type="sum",
        metadata={"kpi_id": "energy_renewable_total", "kpi_name": "Total Renewable Energy Consumption"},
    )


async def calculate_non_renewable_energy(
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Total non-renewable energy (GJ) = total - renewable."""
    t = await _energy_totals(org_id, scope_type, facility_ids, period)
    return format_result(
        value=t["non_renewable"] if t["record_count"] > 0 else None,
        unit="GJ",
        record_count=t["record_count"],
        aggregation_type="sum",
        metadata={"kpi_id": "energy_non_renewable_total", "kpi_name": "Total Non-Renewable Energy Consumption"},
    )


def is_energy_kpi(kpi_id: str) -> bool:
    """Check if a KPI ID is an energy KPI."""
    return kpi_id in ("energy_total_consumption", "energy_total",
                      "energy_renewable_total", "energy_non_renewable_total")
