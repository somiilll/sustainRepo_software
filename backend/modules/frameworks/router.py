"""
Frameworks Router

API endpoints for retrieving framework information.
Read-only endpoints - framework registration happens at module import time.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user, get_super_admin_user
from modules.frameworks.registry import framework_registry, FrameworkStatus


class FrameworkResponse(BaseModel):
    """API response model for framework information."""
    id: str
    name: str
    version: str
    description: str
    status: str
    disclosure_categories: List[str]
    metadata: dict


router = APIRouter(prefix="/frameworks", tags=["Frameworks"])


@router.get("", response_model=List[FrameworkResponse])
async def list_all_frameworks(
    current_user: dict = Depends(get_current_user)
):
    """
    List all registered ESG frameworks.
    Available to all authenticated users.
    """
    frameworks = framework_registry.list_all()
    return [
        FrameworkResponse(
            id=f.id,
            name=f.name,
            version=f.version,
            description=f.description,
            status=f.status.value,
            disclosure_categories=f.disclosure_categories,
            metadata=f.metadata,
        )
        for f in frameworks
    ]


@router.get("/available", response_model=List[FrameworkResponse])
async def list_available_frameworks(
    current_user: dict = Depends(get_current_user)
):
    """
    List frameworks that are currently available for use.
    """
    frameworks = framework_registry.list_available()
    return [
        FrameworkResponse(
            id=f.id,
            name=f.name,
            version=f.version,
            description=f.description,
            status=f.status.value,
            disclosure_categories=f.disclosure_categories,
            metadata=f.metadata,
        )
        for f in frameworks
    ]


@router.get("/coming-soon", response_model=List[FrameworkResponse])
async def list_coming_soon_frameworks(
    current_user: dict = Depends(get_current_user)
):
    """
    List frameworks that are coming soon.
    """
    frameworks = framework_registry.list_coming_soon()
    return [
        FrameworkResponse(
            id=f.id,
            name=f.name,
            version=f.version,
            description=f.description,
            status=f.status.value,
            disclosure_categories=f.disclosure_categories,
            metadata=f.metadata,
        )
        for f in frameworks
    ]


@router.get("/{framework_id}", response_model=FrameworkResponse)
async def get_framework(
    framework_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get details of a specific framework.
    """
    framework = framework_registry.get(framework_id)
    if not framework:
        raise HTTPException(status_code=404, detail=f"Framework '{framework_id}' not found")
    
    return FrameworkResponse(
        id=framework.id,
        name=framework.name,
        version=framework.version,
        description=framework.description,
        status=framework.status.value,
        disclosure_categories=framework.disclosure_categories,
        metadata=framework.metadata,
    )


@router.get("/{framework_id}/mappings")
async def get_framework_data_mappings(
    framework_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Get data mapping configuration for a framework.
    Super Admin only - reveals internal data structure.
    """
    framework = framework_registry.get(framework_id)
    if not framework:
        raise HTTPException(status_code=404, detail=f"Framework '{framework_id}' not found")
    
    return {
        "framework_id": framework_id,
        "mappings": framework.data_mappings,
    }
