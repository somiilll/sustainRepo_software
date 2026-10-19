"""
Water Metrics Service - Fetches water-related data from environment_records
Subcategories: Consumption, Withdrawal, Discharge
"""
from typing import Optional, List, Dict, Any
from .date_utils import build_date_filter
from .unit_utils import to_kilolitres


class WaterMetricsService:
    CATEGORY = "Water"
    SUBCATEGORIES = ["Consumption", "Withdrawal", "Discharge"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated water metrics"""
        consumption = await self._get_subcategory_total(org_id, facility_ids, "Consumption", start_date, end_date)
        withdrawal = await self._get_subcategory_total(org_id, facility_ids, "Withdrawal", start_date, end_date)
        discharge = await self._get_subcategory_total(org_id, facility_ids, "Discharge", start_date, end_date)
        recycled = await self._get_recycled_total(org_id, facility_ids, start_date, end_date)
        
        # Calculate recycling percentage
        # total_input = consumption + withdrawal
        # recycling_pct = 0
        # if total_input > 0 and discharge < total_input:
        #     recycling_pct = ((total_input - discharge) / total_input) * 100
        
        return {
            "consumption": round(consumption, 2),
            "withdrawal": round(withdrawal, 2),
            "discharge": round(discharge, 2),
            "totalinput": round(consumption + withdrawal, 2),
            "recycled": round(recycled, 2),
        }

    async def _get_recycled_total(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> float:
        """Get recycled-water quantity in KL from the dedicated Recycle records."""
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "approval_status": {"$in": ["approved", "not_required", None]},
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "subcategory": {"$regex": "^Recycle$", "$options": "i"},
        }
        if facility_ids:
            base_query["facility_id"] = {"$in": facility_ids}

        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            query = {"$and": [base_query, {"$or": date_filter}]} if date_filter else base_query
        else:
            query = base_query

        records = await self.db.environment_records.find(
            query,
            {"_id": 0, "field_values": 1},
        ).to_list(10000)

        total_kl = 0.0
        for record in records:
            field_values = record.get("field_values", {})
            value = field_values.get("total_quantity_of_water_recycled", field_values.get("quantity", 0))
            try:
                amount = float(value or 0)
            except (TypeError, ValueError):
                continue
            total_kl += to_kilolitres(amount, field_values.get("unit"))

        return total_kl
    
    async def _get_subcategory_total(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        subcategory: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> float:
        """Get total quantity for a water subcategory in KL (unit-aware)"""
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "approval_status": {"$in": ["approved", "not_required", None]},
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}
        }
        if facility_ids:
            base_query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [base_query, {"$or": date_filter}]}
            else:
                query = base_query
        else:
            query = base_query
        
        records = await self.db.environment_records.find(
            query, {"_id": 0, "field_values": 1}
        ).to_list(10000)

        total_kl = 0.0
        for record in records:
            fv = record.get("field_values", {})
            try:
                amount = float(fv.get("quantity") or 0)
            except (TypeError, ValueError):
                continue
            total_kl += to_kilolitres(amount, fv.get("unit"))
        return total_kl
    
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        return build_date_filter(start_date, end_date)
