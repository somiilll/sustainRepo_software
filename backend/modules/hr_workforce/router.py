"""
HR & Workforce Module API
Consolidated BRSR workforce disclosures

Architecture: 1-document-per-year
- When viewing FY 2025-26, data for current/previous/priorToPrevious years
  is stored in separate documents (2025-26, 2024-25, 2023-24)
- Fetch merges them back with suffixes for frontend compatibility
- Save splits them into separate year documents
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel
import re

from core_platform.auth import get_current_user
from shared.database import get_database

router = APIRouter(prefix="/hr-workforce", tags=["HR & Workforce"])


class HRWorkforceData(BaseModel):
    financial_year: str
    facility_id: Optional[str] = None
    data: Dict[str, Any]


def parse_fy(fy_string: str) -> int:
    """Parse FY string to get start year. E.g., 'FY 2025-26' -> 2025"""
    match = re.match(r'FY (\d{4})-(\d{2})', fy_string)
    if match:
        return int(match.group(1))
    return datetime.now().year


def format_fy(start_year: int) -> str:
    """Format start year to FY string. E.g., 2025 -> 'FY 2025-26'"""
    return f"FY {start_year}-{str(start_year + 1)[-2:]}"


def get_fy_years(selected_fy: str) -> dict:
    """Get the 3 FY strings for current, previous, and prior-to-previous years"""
    start_year = parse_fy(selected_fy)
    return {
        'current': format_fy(start_year),
        'previous': format_fy(start_year - 1),
        'priorToPrevious': format_fy(start_year - 2)
    }


def split_data_by_year(data: Dict[str, Any]) -> tuple:
    """
    Split data into 3 year documents.
    
    Input: { "demographics": { "employees": { "permanent_male_current": 10, "permanent_male_previous": 8, ... }}}
    Output: (current_data, previous_data, prior_data)
    
    Where current_data = { "demographics": { "employees": { "permanent_male": 10 }}}
    """
    current_data = {}
    previous_data = {}
    prior_data = {}
    
    for section_key, section_value in data.items():
        if not isinstance(section_value, dict):
            # Non-nested value goes to current
            current_data[section_key] = section_value
            continue
        
        current_section = {}
        previous_section = {}
        prior_section = {}
        
        for sub_key, sub_value in section_value.items():
            if isinstance(sub_value, dict):
                # Nested dict (e.g., demographics.employees.{fields})
                current_sub = {}
                previous_sub = {}
                prior_sub = {}
                
                for field_key, field_value in sub_value.items():
                    base_key, year_type = parse_field_suffix(field_key)
                    if year_type == 'current':
                        current_sub[base_key] = field_value
                    elif year_type == 'previous':
                        previous_sub[base_key] = field_value
                    elif year_type == 'priorToPrevious':
                        prior_sub[base_key] = field_value
                    else:
                        # No suffix - goes to current
                        current_sub[field_key] = field_value
                
                if current_sub:
                    current_section[sub_key] = current_sub
                if previous_sub:
                    previous_section[sub_key] = previous_sub
                if prior_sub:
                    prior_section[sub_key] = prior_sub
            else:
                # Direct field with suffix
                base_key, year_type = parse_field_suffix(sub_key)
                if year_type == 'current':
                    current_section[base_key] = sub_value
                elif year_type == 'previous':
                    previous_section[base_key] = sub_value
                elif year_type == 'priorToPrevious':
                    prior_section[base_key] = sub_value
                else:
                    current_section[sub_key] = sub_value
        
        if current_section:
            current_data[section_key] = current_section
        if previous_section:
            previous_data[section_key] = previous_section
        if prior_section:
            prior_data[section_key] = prior_section
    
    return current_data, previous_data, prior_data


def parse_field_suffix(field_key: str) -> tuple:
    """
    Parse field key to extract base name and year type.
    
    Examples:
      "permanent_male_current" -> ("permanent_male", "current")
      "permanent_male_previous" -> ("permanent_male", "previous")
      "permanent_male_priorToPrevious" -> ("permanent_male", "priorToPrevious")
      "other_scheme_name" -> ("other_scheme_name", None)
    """
    if field_key.endswith('_current'):
        return field_key[:-8], 'current'
    elif field_key.endswith('_previous'):
        return field_key[:-9], 'previous'
    elif field_key.endswith('_priorToPrevious'):
        return field_key[:-16], 'priorToPrevious'
    return field_key, None


def merge_year_data(current_data: dict, previous_data: dict, prior_data: dict) -> dict:
    """
    Merge 3 year documents back into frontend format with suffixes.
    
    Input: 3 separate year dicts with base field names
    Output: Single dict with _current, _previous, _priorToPrevious suffixes
    """
    merged = {}
    all_sections = set(current_data.keys()) | set(previous_data.keys()) | set(prior_data.keys())
    
    for section_key in all_sections:
        curr_section = current_data.get(section_key, {})
        prev_section = previous_data.get(section_key, {})
        prior_section = prior_data.get(section_key, {})
        
        if not isinstance(curr_section, dict) and not isinstance(prev_section, dict) and not isinstance(prior_section, dict):
            # Simple value
            merged[section_key] = curr_section or prev_section or prior_section
            continue
        
        merged_section = {}
        all_sub_keys = set(curr_section.keys() if isinstance(curr_section, dict) else []) | \
                       set(prev_section.keys() if isinstance(prev_section, dict) else []) | \
                       set(prior_section.keys() if isinstance(prior_section, dict) else [])
        
        for sub_key in all_sub_keys:
            curr_sub = curr_section.get(sub_key, {}) if isinstance(curr_section, dict) else {}
            prev_sub = prev_section.get(sub_key, {}) if isinstance(prev_section, dict) else {}
            prior_sub = prior_section.get(sub_key, {}) if isinstance(prior_section, dict) else {}
            
            if isinstance(curr_sub, dict) or isinstance(prev_sub, dict) or isinstance(prior_sub, dict):
                # Nested dict
                merged_sub = {}
                all_fields = set(curr_sub.keys() if isinstance(curr_sub, dict) else []) | \
                            set(prev_sub.keys() if isinstance(prev_sub, dict) else []) | \
                            set(prior_sub.keys() if isinstance(prior_sub, dict) else [])
                
                for field_key in all_fields:
                    # Check if field already has suffix (backward compatibility)
                    if field_key.endswith(('_current', '_previous', '_priorToPrevious')):
                        if field_key in (curr_sub if isinstance(curr_sub, dict) else {}):
                            merged_sub[field_key] = curr_sub[field_key]
                    else:
                        if isinstance(curr_sub, dict) and field_key in curr_sub:
                            merged_sub[f"{field_key}_current"] = curr_sub[field_key]
                        if isinstance(prev_sub, dict) and field_key in prev_sub:
                            merged_sub[f"{field_key}_previous"] = prev_sub[field_key]
                        if isinstance(prior_sub, dict) and field_key in prior_sub:
                            merged_sub[f"{field_key}_priorToPrevious"] = prior_sub[field_key]
                
                if merged_sub:
                    merged_section[sub_key] = merged_sub
            else:
                # Direct values with suffixes
                if curr_sub:
                    merged_section[f"{sub_key}_current"] = curr_sub
                if prev_sub:
                    merged_section[f"{sub_key}_previous"] = prev_sub
                if prior_sub:
                    merged_section[f"{sub_key}_priorToPrevious"] = prior_sub
        
        if merged_section:
            merged[section_key] = merged_section
    
    return merged


@router.get("/data")
async def get_hr_workforce_data(
    financial_year: str,
    facility_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """
    Get HR & Workforce data for a financial year.
    
    Fetches 3 year documents and merges them with suffixes for frontend.
    """
    org_id = current_user.get("organization_id")
    fy_years = get_fy_years(financial_year)
    
    # Fetch all 3 year documents
    async def fetch_year(fy: str) -> dict:
        query = {
            "org_id": org_id,
            "financial_year": fy,
            "facility_id": facility_id if facility_id else None
        }
        record = await db.hr_workforce_data.find_one(query, {"_id": 0})
        return record.get("data", {}) if record else {}
    
    current_data = await fetch_year(fy_years['current'])
    previous_data = await fetch_year(fy_years['previous'])
    prior_data = await fetch_year(fy_years['priorToPrevious'])
    
    # Merge with suffixes
    merged_data = merge_year_data(current_data, previous_data, prior_data)
    
    return {"data": merged_data}


@router.post("/data")
async def save_hr_workforce_data(
    payload: HRWorkforceData,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """
    Save HR & Workforce data for a financial year.
    
    Splits data into 3 separate year documents.
    """
    org_id = current_user.get("organization_id")
    fy_years = get_fy_years(payload.financial_year)
    now = datetime.now(timezone.utc)
    
    # Split data into 3 years
    current_data, previous_data, prior_data = split_data_by_year(payload.data)
    
    async def save_year(fy: str, data: dict):
        if not data:
            return None
        
        query = {
            "org_id": org_id,
            "financial_year": fy,
            "facility_id": payload.facility_id
        }
        
        # Deep merge with existing data
        existing = await db.hr_workforce_data.find_one(query)
        if existing:
            merged = deep_merge(existing.get("data", {}), data)
        else:
            merged = data
        
        update_data = {
            **query,
            "data": merged,
            "updated_at": now,
            "updated_by": current_user.get("id")
        }
        
        result = await db.hr_workforce_data.update_one(
            query,
            {"$set": update_data, "$setOnInsert": {"created_at": now}},
            upsert=True
        )
        return result
    
    # Save to each year's document
    await save_year(fy_years['current'], current_data)
    await save_year(fy_years['previous'], previous_data)
    await save_year(fy_years['priorToPrevious'], prior_data)
    
    return {"success": True, "message": f"Data saved to {fy_years['current']}, {fy_years['previous']}, {fy_years['priorToPrevious']}"}


def deep_merge(base: dict, update: dict) -> dict:
    """Deep merge two dictionaries."""
    result = base.copy()
    for key, value in update.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


@router.post("/migrate")
async def migrate_hr_workforce_data(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """
    Migrate existing HR Workforce data from old format (all years in one doc)
    to new format (1 doc per year).
    
    This is a one-time migration endpoint.
    """
    org_id = current_user.get("organization_id")
    
    # Find all existing documents for this org
    cursor = db.hr_workforce_data.find({"org_id": org_id})
    documents = await cursor.to_list(length=100)
    
    migrated_count = 0
    
    for doc in documents:
        old_data = doc.get("data", {})
        financial_year = doc.get("financial_year")
        facility_id = doc.get("facility_id")
        
        if not financial_year or not old_data:
            continue
        
        # Check if data has old format (fields with _current/_previous suffixes)
        has_old_format = False
        for section_value in old_data.values():
            if isinstance(section_value, dict):
                for sub_value in section_value.values():
                    if isinstance(sub_value, dict):
                        for field_key in sub_value.keys():
                            if field_key.endswith(('_current', '_previous', '_priorToPrevious')):
                                has_old_format = True
                                break
        
        if not has_old_format:
            continue  # Already in new format
        
        # Split and save to separate documents
        fy_years = get_fy_years(financial_year)
        current_data, previous_data, prior_data = split_data_by_year(old_data)
        now = datetime.now(timezone.utc)
        
        async def save_migrated(fy: str, data: dict):
            if not data:
                return
            query = {"org_id": org_id, "financial_year": fy, "facility_id": facility_id}
            await db.hr_workforce_data.update_one(
                query,
                {"$set": {"data": data, "updated_at": now, "migrated_from": financial_year}},
                upsert=True
            )
        
        await save_migrated(fy_years['current'], current_data)
        await save_migrated(fy_years['previous'], previous_data)
        await save_migrated(fy_years['priorToPrevious'], prior_data)
        
        migrated_count += 1
    
    return {"success": True, "migrated_documents": migrated_count}
