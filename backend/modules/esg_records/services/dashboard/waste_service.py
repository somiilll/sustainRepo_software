"""
Waste Metrics Service - Fetches waste-related data from environment_records
Subcategories: Generated, Recovered, Disposal

IMPORTANT: This service uses the same calculation logic as environment_detail_service.py
to ensure consistency across Dashboard and Peer Benchmarking.

Calculation logic:
- Uses specific fields (hazardous_waste_generated, non_hazardous_waste_generated, etc.)
  when available, otherwise falls back to generic 'quantity' field.
"""
from typing import Optional, List, Dict, Any
from .date_utils import build_date_filter


# Field mappings for hazardous/non-hazardous breakdown
WASTE_FIELD_MAP = {
    "hazardous_waste_generated": ("hazardous", "generated"),
    "non_hazardous_waste_generated": ("non_hazardous", "generated"),
    "hazardous_waste_disposed": ("hazardous", "disposed"),
    "non_hazardous_waste_disposed": ("non_hazardous", "disposed"),
    "hazardous_waste_recovered": ("hazardous", "recovered"),
    "non_hazardous_waste_recovered": ("non_hazardous", "recovered"),
}


class WasteMetricsService:
    CATEGORY = "Waste"
    SUBCATEGORIES = ["Generated", "Recovered", "Disposal"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get aggregated waste metrics.
        
        Uses the same logic as environment_detail_service.py:
        - First checks for specific fields (hazardous_waste_recovered, etc.)
        - Falls back to generic 'quantity' field with waste_type classification
        """
        waste_data = await self._get_all_waste_data(org_id, facility_ids, start_date, end_date)
        
        generated = waste_data["hazardous"]["generated"] + waste_data["non_hazardous"]["generated"]
        recovered = waste_data["hazardous"]["recovered"] + waste_data["non_hazardous"]["recovered"]
        disposal = waste_data["hazardous"]["disposed"] + waste_data["non_hazardous"]["disposed"]
        
        # Calculate recovery percentage
        recovery_pct = 0
        if generated > 0:
            recovery_pct = (recovered / generated) * 100
        
        return {
            "generated": round(generated, 2),
            "recovered": round(recovered, 2),
            "disposal": round(disposal, 2),
            "total": round(generated, 2),
            "recovery_pct": round(min(recovery_pct, 100), 2),
            # Additional breakdown for detailed views
            "hazardous_generated": round(waste_data["hazardous"]["generated"], 2),
            "non_hazardous_generated": round(waste_data["non_hazardous"]["generated"], 2),
            "hazardous_recovered": round(waste_data["hazardous"]["recovered"], 2),
            "non_hazardous_recovered": round(waste_data["non_hazardous"]["recovered"], 2),
        }
    
    async def _get_all_waste_data(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Dict[str, float]]:
        """
        Get all waste data using the same logic as environment_detail_service.py.
        
        Returns:
            {
                "hazardous": {"generated": X, "recovered": Y, "disposed": Z},
                "non_hazardous": {"generated": X, "recovered": Y, "disposed": Z}
            }
        """
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "approval_status": {"$in": ["approved", "not_required", None]}
        }
        if facility_ids:
            base_query["facility_id"] = {"$in": facility_ids}
        
        # Build final query with optional date filter
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [base_query, {"$or": date_filter}]}
            else:
                query = base_query
        else:
            query = base_query
        
        records = await self.db.environment_records.find(
            query,
            {"_id": 0, "subcategory": 1, "field_values": 1}
        ).to_list(10000)
        
        hazardous_waste = {"generated": 0.0, "recovered": 0.0, "disposed": 0.0}
        non_hazardous_waste = {"generated": 0.0, "recovered": 0.0, "disposed": 0.0}
        
        for rec in records:
            fv = rec.get("field_values") or {}
            found_mapped = False
            
            # First try specific field mappings (same as environment_detail_service.py)
            for field_key, (waste_type, metric) in WASTE_FIELD_MAP.items():
                val = fv.get(field_key)
                if val is not None and val != "":
                    try:
                        val_float = float(val)
                        if val_float > 0:
                            target = hazardous_waste if waste_type == "hazardous" else non_hazardous_waste
                            target[metric] += val_float
                            found_mapped = True
                    except (ValueError, TypeError):
                        pass
            
            # Fallback: if no mapped keys found, try subcategory + quantity
            if not found_mapped:
                sub = (rec.get("subcategory") or "").lower()
                qty = fv.get("quantity")
                if qty is not None and qty != "":
                    try:
                        qty_float = float(qty)
                        if qty_float > 0:
                            # Determine if hazardous or not
                            waste_type_str = str(fv.get("waste_type") or "").lower()
                            is_haz = "hazardous" in waste_type_str and "non" not in waste_type_str
                            target = hazardous_waste if is_haz else non_hazardous_waste
                            
                            if "generated" in sub:
                                target["generated"] += qty_float
                            elif "recovered" in sub or "diverted" in sub:
                                target["recovered"] += qty_float
                            elif "disposal" in sub or "disposed" in sub:
                                target["disposed"] += qty_float
                    except (ValueError, TypeError):
                        pass
        
        return {
            "hazardous": hazardous_waste,
            "non_hazardous": non_hazardous_waste
        }
    
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        return build_date_filter(start_date, end_date)
