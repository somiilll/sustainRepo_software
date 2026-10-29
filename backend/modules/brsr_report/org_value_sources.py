from typing import Optional

from shared.database.mongo import db
from shared.utils.period_utils import detect_type, extract_year, period_variants

BASE_YEAR_SCOPE_GROUPS = {"scope1": "scope12", "scope2": "scope12", "scope3": "scope3"}


async def base_year_value(org_id: str, scope: str) -> Optional[float]:
    """Base-year tCO2e for a scope from the organization's configured base year record."""
    group = BASE_YEAR_SCOPE_GROUPS.get(scope)
    if not group:
        return None
    record = await db.base_year_emissions.find_one(
        {"organization_id": org_id, "facility_id": None, "scope_group": group}, {"_id": 0, "emissions_data": 1}
    )
    if not record:
        return None
    values = [float(row.get("tco2e") or 0) for row in record.get("emissions_data") or [] if row.get("scope") == scope]
    return round(sum(values), 4) if values else None


async def org_profile_value(org_id: str, field: str, reporting_period: str) -> Optional[float]:
    """Organization Details yearly turnover or production quantity for the reporting period."""
    year = extract_year(reporting_period)
    if not year:
        return None
    variants = period_variants(year, detect_type(reporting_period))
    if field == "turnover":
        doc = await db.organization_financials.find_one({"org_id": org_id, "reporting_year": {"$in": variants}}, {"_id": 0, "turnover": 1})
        raw = doc.get("turnover") if doc else None
    elif field == "production_quantity":
        doc = await db.production_quantities.find_one(
            {"organization_id": org_id, "facility_id": None, "reporting_period": {"$in": variants}, "is_deleted": {"$ne": True}},
            {"_id": 0, "quantity": 1},
        )
        raw = doc.get("quantity") if doc else None
    else:
        return None
    try:
        return float(raw) if raw not in (None, "") else None
    except (TypeError, ValueError):
        return None
