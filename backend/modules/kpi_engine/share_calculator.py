"""
KPI Engine - Share (%) Calculator

Turns a subset KPI into its percentage share of a "Total" KPI at calculation time,
e.g. Renewable Energy / Total Energy, Male Employees / Total Employees.
No KPI definitions are created: the pairing is a static map keyed by KPI metric_name.

Reusable by Targets, Dashboards and Reports:
    from modules.kpi_engine.share_calculator import share_denominator, calculate_share, calculate_share_parts
"""

from typing import Any, Dict, List, Optional
from shared.database.mongo import db
from .calculator import kpi_calculator
from .utils import format_result

ENERGY_TOTAL_KPI_ID = "energy_total_consumption"
ENERGY_RENEWABLE_KPI_ID = "energy_renewable_total"

# subset metric_name -> total metric_name (explicit pairs)
SHARE_DENOMINATORS: Dict[str, str] = {
    "Water Consumption in Water-stress Areas": "Water Consumption (Total)",
    "Water Withdrawal in Water-stress Areas (Total)": "Water Withdrawal (Total)",
    "Water Discharge to Water-stress Areas (Total)": "Water Discharge (Total)",
    "Water Discharge - Untreated discharge": "Water Discharge (Total)",
    "Water Discharge - Treated discharge": "Water Discharge (Total)",
    "Hazardous Waste Disposed (Total)": "Waste Disposed (Total)",
    "Non-hazardous Waste Disposed (Total)": "Waste Disposed (Total)",
    "Hazardous Waste Recovered (Total)": "Waste Recovered (Total)",
    "Non-hazardous Waste Recovered (Total)": "Waste Recovered (Total)",
    "Hazardous Waste Generated (Total)": "Waste Generated (Total)",
    "Non-hazardous Waste Generated (Total)": "Waste Generated (Total)",
    "Internal Complaints - Conflict of Interest (Total)": "Internal Complaints (Total)",
    "Data-breach Incidents - Involving Customer PII": "Data-breach Incidents (Total)",
}

# (metric_name prefix, total metric_name): any KPI starting with the prefix other than the total itself
SHARE_PREFIX_RULES: List[tuple] = [
    ("Employee Diversity - ", "Employee Diversity - Total Employees"),
    ("Workers Diversity - ", "Workers Diversity - Total Workers"),
    ("Board of Directors Diversity - ", "Board of Directors Diversity - Board of Directors (Total)"),
    ("Key Management Personnel Diversity - ", "Key Management Personnel Diversity - Key Management Personnel (Total)"),
    ("Internal Complaints - ", "Internal Complaints (Total)"),
    ("Consumer Complaints - ", "Consumer Complaints (Total)"),
    ("Trainings - ", "Trainings Completed (Total)"),
]

ENERGY_SHARE_NAMES = ("Renewable Energy Consumption (Total)",)


def share_denominator(metric_name: Optional[str]) -> Optional[str]:
    """Metric name of the Total KPI this KPI is a share of, or None if it has no share mapping."""
    if not metric_name:
        return None
    if metric_name in ENERGY_SHARE_NAMES:
        return "__energy_total__"
    if metric_name in SHARE_DENOMINATORS:
        return SHARE_DENOMINATORS[metric_name]
    for prefix, total in SHARE_PREFIX_RULES:
        if metric_name.startswith(prefix) and metric_name != total:
            return total
    return None


def share_label(metric_name: Optional[str]) -> Optional[str]:
    """Display name of the Total KPI, or None if the KPI is not share-mapped."""
    total = share_denominator(metric_name)
    return "Total Energy Consumption" if total == "__energy_total__" else total


async def _kpi_meta(kpi_id: str) -> Optional[Dict[str, Any]]:
    if kpi_id == ENERGY_RENEWABLE_KPI_ID:
        return {"metric_name": ENERGY_SHARE_NAMES[0]}
    return await db.esg_kpi_definitions.find_one({"id": kpi_id}, {"_id": 0, "metric_name": 1})


async def resolve_share(kpi_id: str) -> Optional[Dict[str, str]]:
    """{'denominator_kpi_id', 'denominator_name'} when the KPI is share-mapped, else None."""
    meta = await _kpi_meta(kpi_id)
    total_name = share_denominator(meta.get("metric_name") if meta else None)
    if not total_name:
        return None
    if total_name == "__energy_total__":
        return {"denominator_kpi_id": ENERGY_TOTAL_KPI_ID, "denominator_name": "Total Energy Consumption"}
    den = await db.esg_kpi_definitions.find_one({"metric_name": total_name, "status": "active"}, {"_id": 0, "id": 1})
    return {"denominator_kpi_id": den["id"], "denominator_name": total_name} if den else None


def share_percentage(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    """numerator / denominator * 100; None when the total has no data or is 0."""
    if denominator is None or denominator <= 0:
        return None
    return (numerator or 0) / denominator * 100


async def calculate_share_parts(
    kpi_id: str, org_id: str, scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None, period: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Raw numerator/denominator for one period (so callers can add parts across months before dividing). None if not share-mapped."""
    share = await resolve_share(kpi_id)
    if not share:
        return None
    kw = dict(org_id=org_id, scope_type=scope_type, facility_ids=facility_ids, period=period)
    num = await kpi_calculator.calculate(kpi_id=kpi_id, **kw)
    den = await kpi_calculator.calculate(kpi_id=share["denominator_kpi_id"], **kw)
    return {"numerator": num.get("value"), "denominator": den.get("value"),
            "record_count": num.get("record_count", 0), "denominator_name": share["denominator_name"]}


async def calculate_share(
    kpi_id: str, org_id: str, scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None, period: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Drop-in for kpi_calculator.calculate returning the % share as `value`. None if the KPI is not share-mapped."""
    parts = await calculate_share_parts(kpi_id, org_id, scope_type, facility_ids, period)
    if parts is None:
        return None
    value = share_percentage(parts["numerator"], parts["denominator"])
    return format_result(
        value=round(value, 4) if value is not None else None,
        unit="%",
        record_count=parts["record_count"],
        metadata={"share_of": parts["denominator_name"], "numerator": parts["numerator"], "denominator": parts["denominator"]},
    )
