"""
KPI Engine - API Router

Exposes KPI calculation endpoints for:
- Single KPI calculations
- Batch calculations
- Dimension-based calculations (for charts)

All endpoints require authentication.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user
from .calculator import kpi_calculator


router = APIRouter(prefix="/kpi-engine", tags=["KPI Engine"])


# =============================================================================
# Request/Response Models
# =============================================================================

class CalculateRequest(BaseModel):
    """Request body for single KPI calculation."""
    kpi_id: Optional[str] = None
    metric_code: Optional[str] = None
    scope_type: str = "organization"
    facility_ids: Optional[List[str]] = None
    period: Optional[Dict[str, Any]] = None
    additional_filters: Optional[List[Dict[str, Any]]] = None


class BatchCalculateRequest(BaseModel):
    """Request body for batch KPI calculation."""
    kpi_ids: List[str]
    scope_type: str = "organization"
    facility_ids: Optional[List[str]] = None
    period: Optional[Dict[str, Any]] = None


class DimensionCalculateRequest(BaseModel):
    """Request body for dimension-based KPI calculation."""
    kpi_id: str
    dimension: str  # Field to group by (e.g., "facility_id", "month", "subcategory")
    scope_type: str = "organization"
    facility_ids: Optional[List[str]] = None
    period: Optional[Dict[str, Any]] = None


class CalculationResult(BaseModel):
    """Standard calculation result."""
    value: Optional[float] = None
    unit: Optional[str] = None
    record_count: int = 0
    aggregation_type: str = "sum"
    calculated_at: str
    metadata: Dict[str, Any] = {}


# =============================================================================
# API Endpoints
# =============================================================================

@router.post("/calculate", response_model=CalculationResult)
async def calculate_kpi(
    request: CalculateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate a single KPI value.
    
    Provide either `kpi_id` or `metric_code` to identify the KPI.
    
    **Parameters:**
    - `kpi_id`: KPI definition ID
    - `metric_code`: Unique metric code (e.g., ENV_WATER_CONSUMPTION)
    - `scope_type`: "organization" or "facility"
    - `facility_ids`: List of facility IDs (for facility scope)
    - `period`: Period filter (year, month, quarter)
    - `additional_filters`: Runtime filters to apply
    
    **Returns:** Calculated value with metadata
    """
    org_id = current_user.get("organization_id") or current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")
    
    if not request.kpi_id and not request.metric_code:
        raise HTTPException(status_code=400, detail="Either kpi_id or metric_code is required")
    
    if request.kpi_id:
        result = await kpi_calculator.calculate(
            kpi_id=request.kpi_id,
            org_id=org_id,
            scope_type=request.scope_type,
            facility_ids=request.facility_ids,
            period=request.period,
            additional_filters=request.additional_filters,
        )
    else:
        result = await kpi_calculator.calculate_by_code(
            metric_code=request.metric_code,
            org_id=org_id,
            scope_type=request.scope_type,
            facility_ids=request.facility_ids,
            period=request.period,
            additional_filters=request.additional_filters,
        )
    
    # Check for errors
    if result.get("metadata", {}).get("error"):
        raise HTTPException(status_code=404, detail=result["metadata"]["error"])
    
    return result


@router.post("/calculate/batch")
async def calculate_batch(
    request: BatchCalculateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate multiple KPIs in a single request.
    
    **Parameters:**
    - `kpi_ids`: List of KPI definition IDs
    - `scope_type`: "organization" or "facility"
    - `facility_ids`: List of facility IDs
    - `period`: Period filter
    
    **Returns:** Dict mapping kpi_id to calculation result
    """
    org_id = current_user.get("organization_id") or current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")
    
    if not request.kpi_ids:
        raise HTTPException(status_code=400, detail="kpi_ids list cannot be empty")
    
    results = await kpi_calculator.calculate_batch(
        kpi_ids=request.kpi_ids,
        org_id=org_id,
        scope_type=request.scope_type,
        facility_ids=request.facility_ids,
        period=request.period,
    )
    
    return results


@router.post("/calculate/dimension")
async def calculate_with_dimension(
    request: DimensionCalculateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate a KPI grouped by a dimension.
    Useful for dashboard charts.
    
    **Parameters:**
    - `kpi_id`: KPI definition ID
    - `dimension`: Field to group by (e.g., "facility_id", "month", "subcategory")
    - `scope_type`: "organization" or "facility"
    - `facility_ids`: List of facility IDs
    - `period`: Period filter
    
    **Returns:** Dict mapping dimension values to calculation results
    """
    org_id = current_user.get("organization_id") or current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User not associated with an organization")
    
    results = await kpi_calculator.calculate_with_dimensions(
        kpi_id=request.kpi_id,
        org_id=org_id,
        dimension=request.dimension,
        scope_type=request.scope_type,
        facility_ids=request.facility_ids,
        period=request.period,
    )
    
    # Check for error
    if "_error" in results:
        raise HTTPException(status_code=404, detail=results["_error"].get("error", "Unknown error"))
    
    return results


@router.get("/health")
async def health_check():
    """
    Health check endpoint for the KPI engine.
    """
    return {
        "status": "healthy",
        "engine": "kpi_engine",
        "version": "1.0.0",
    }
