"""Pydantic models for Production Quantity management."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ProductionQuantityCreate(BaseModel):
    """Request model for creating a production quantity record."""
    facility_id: Optional[str] = None  # Nullable for organization-level records
    reporting_period: str  # Format: YYYY-MM, FY YYYY-YY, CY YYYY
    quantity: float = Field(..., gt=0, description="Production quantity value")
    unit: str = Field(..., min_length=1, description="Unit of measurement")
    notes: Optional[str] = None


class ProductionQuantityUpdate(BaseModel):
    """Request model for updating a production quantity record."""
    quantity: Optional[float] = Field(None, gt=0)
    unit: Optional[str] = None
    notes: Optional[str] = None


class ProductionQuantityResponse(BaseModel):
    """Response model for production quantity records."""
    id: str
    organization_id: str
    facility_id: Optional[str] = None
    facility_name: Optional[str] = None  # Populated on response
    reporting_period: str
    quantity: float
    unit: str
    notes: Optional[str] = None
    created_at: datetime
    created_by: str
    created_by_name: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None
    version: int = 0


class ProductionQuantityHistoryResponse(BaseModel):
    """Response model for production quantity history entries."""
    id: str
    production_quantity_id: str
    quantity: float
    unit: str
    notes: Optional[str] = None
    changed_at: datetime
    changed_by: str
    changed_by_name: Optional[str] = None
    change_type: str  # 'create', 'update', 'delete'
    version: int
