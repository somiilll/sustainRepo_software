"""SBTi Targets — Service layer."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from shared.database.mongo import db
from shared.utils.period_utils import extract_year

COLLECTION = "sbti_targets"


async def list_targets(org_id: str, term_type: Optional[str] = None) -> List[Dict]:
    query = {"organization_id": org_id}
    if term_type:
        query["term_type"] = term_type
    return await db[COLLECTION].find(query, {"_id": 0}).sort("created_at", -1).to_list(100)


async def get_target(target_id: str, org_id: str) -> Optional[Dict]:
    return await db[COLLECTION].find_one(
        {"id": target_id, "organization_id": org_id}, {"_id": 0}
    )


async def create_target(org_id: str, data: dict, user_id: str) -> Dict:
    now = datetime.now(timezone.utc).isoformat()
    target = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "term_type": data["term_type"],
        "kpi_id": data["kpi_id"],
        "kpi_name": data.get("kpi_name"),
        "target_name": data["target_name"],
        "description": data.get("description"),
        "base_year": data["base_year"],
        "target_year": data["target_year"],
        "tracking_mode": "static",
        "goal_type": "exact",
        "target_type": data["target_type"],
        "growth_rate": data.get("growth_rate"),
        "reduction_percentage": data.get("reduction_percentage"),
        "base_year_value": data.get("base_year_value"),
        "base_year_intensity": data.get("base_year_intensity"),
        "target_value": data.get("target_value"),
        "target_intensity": data.get("target_intensity"),
        "unit": data.get("unit"),
        "status": "active",
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    await db[COLLECTION].insert_one(target)
    target.pop("_id", None)
    return target


async def update_target(target_id: str, org_id: str, data: dict, user_id: str) -> Optional[Dict]:
    existing = await db[COLLECTION].find_one({"id": target_id, "organization_id": org_id})
    if not existing:
        return None
    update_fields = {k: v for k, v in data.items() if v is not None}
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[COLLECTION].update_one({"id": target_id}, {"$set": update_fields})
    return await db[COLLECTION].find_one({"id": target_id}, {"_id": 0})


async def delete_target(target_id: str, org_id: str) -> bool:
    result = await db[COLLECTION].delete_one({"id": target_id, "organization_id": org_id})
    return result.deleted_count > 0


def compute_percentage_target(base_value: float, growth_rate: float, reduction_pct: float, years: int) -> Dict:
    """Compute projected emissions and target value for percentage reduction."""
    projected = base_value * ((1 + growth_rate / 100) ** years)
    target_value = base_value * (1 - reduction_pct / 100)
    yearly_projections = {}
    for y in range(years + 1):
        yearly_projections[y] = round(base_value * ((1 + growth_rate / 100) ** y), 2)
    return {
        "projected_emissions": round(projected, 2),
        "target_value": round(target_value, 2),
        "yearly_projections": yearly_projections,
    }


def compute_intensity_trajectory(base_intensity: float, target_intensity: float, years: int) -> List[Dict]:
    """Compute linear trajectory for intensity targets (y = mx + c)."""
    if years <= 0:
        return [{"year_offset": 0, "intensity": base_intensity}]
    slope = (target_intensity - base_intensity) / years
    return [
        {"year_offset": i, "intensity": round(base_intensity + slope * i, 4)}
        for i in range(years + 1)
    ]


def compute_achievement(target_type: str, **kwargs) -> Optional[float]:
    """Compute achievement % clamped 0-100."""
    if target_type == "percentage":
        tv = kwargs.get("target_value")
        cv = kwargs.get("current_value")
        bv = kwargs.get("base_value")
        if tv is None or cv is None or bv is None or tv == bv:
            return None
        pct = 100 - ((tv - cv) / (tv - bv)) * 100
    else:
        ti = kwargs.get("target_intensity")
        ci = kwargs.get("current_intensity")
        bi = kwargs.get("base_intensity")
        if ti is None or ci is None or bi is None or ti == bi:
            return None
        pct = 100 - ((ti - ci) / (ti - bi)) * 100
    return max(0.0, min(100.0, round(pct, 1)))
