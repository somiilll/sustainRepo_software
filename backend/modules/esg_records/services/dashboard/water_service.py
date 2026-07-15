"""
Water Metrics Service - Fetches water-related data from environment_records
Subcategories: Consumption, Withdrawal, Discharge
"""
from typing import Optional, List, Dict, Any


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
        
        # hardcoded to kL, need to expand it in future

        return {
            "consumption": round(consumption / 1000, 2),
            "withdrawal": round(withdrawal / 1000, 2),
            "discharge": round(discharge / 1000, 2),
            "totalinput": round((consumption + withdrawal) / 1000, 2),
            "recycled": round(recycled, 2),
            # "recycling_pct": round(recycling_pct, 2),
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

            unit = str(field_values.get("unit") or "litres").lower()
            if "mega" in unit:
                total_kl += amount * 1000
            elif "kilo" in unit or unit == "kl":
                total_kl += amount
            else:
                total_kl += amount / 1000

        return total_kl
    
    async def _get_subcategory_total(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        subcategory: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> float:
        """Get total quantity for a water subcategory"""
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}
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
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "total": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.quantity", 0]}}}
            }}
        ]
        
        result = await self.db.environment_records.aggregate(pipeline).to_list(1)
        return result[0]["total"] if result else 0
    
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        """Build date filter conditions for reporting_period"""
        try:
            start_year, start_month = int(start_date[:4]), int(start_date[5:7])
            end_year, end_month = int(end_date[:4]), int(end_date[5:7])
            
            months = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"]
            
            conditions = []
            for year in range(start_year, end_year + 1):
                for month_idx in range(1, 13):
                    if year == start_year and month_idx < start_month:
                        continue
                    if year == end_year and month_idx > end_month:
                        continue
                    conditions.append({
                        "reporting_period.year": year,
                        "reporting_period.month": {"$in": [months[month_idx - 1], str(month_idx)]}
                    })
            return conditions
        except (TypeError, ValueError, IndexError):
            return []
