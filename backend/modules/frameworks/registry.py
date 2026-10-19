"""
Framework Registry

Pluggable architecture for ESG reporting frameworks.
Frameworks register themselves with the registry at module import time.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from enum import Enum


class FrameworkStatus(str, Enum):
    """Framework implementation status."""
    AVAILABLE = "available"
    COMING_SOON = "coming_soon"
    DEPRECATED = "deprecated"


@dataclass
class FrameworkConfig:
    """
    Configuration for an ESG reporting framework.
    
    Attributes:
        id: Unique framework identifier (e.g., "BRSR", "GRI", "SBTi")
        name: Display name
        version: Framework version (e.g., "2021", "2023")
        description: Brief description
        status: Implementation status
        disclosure_categories: List of disclosure category IDs
        data_mappings: Mapping from framework disclosure IDs to ESG data fields
        report_template: Path or identifier for the report template
        validator: Optional validation function
        metadata: Additional framework-specific metadata
    """
    id: str
    name: str
    version: str
    description: str
    status: FrameworkStatus = FrameworkStatus.AVAILABLE
    disclosure_categories: List[str] = field(default_factory=list)
    data_mappings: Dict[str, Any] = field(default_factory=dict)
    report_template: Optional[str] = None
    validator: Optional[Callable] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class FrameworkRegistry:
    """
    Registry for ESG reporting frameworks.
    
    Usage:
        # Register a framework
        framework_registry.register(FrameworkConfig(
            id="BRSR",
            name="Business Responsibility and Sustainability Reporting",
            version="2021",
            description="SEBI mandated ESG disclosure framework for Indian companies",
            status=FrameworkStatus.AVAILABLE,
        ))
        
        # Get a framework
        brsr = framework_registry.get("BRSR")
        
        # List all available frameworks
        available = framework_registry.list_available()
    """

    def __init__(self):
        self._frameworks: Dict[str, FrameworkConfig] = {}

    def register(self, config: FrameworkConfig) -> None:
        """
        Register a framework configuration.
        
        Args:
            config: Framework configuration to register
            
        Raises:
            ValueError: If framework with same ID already registered
        """
        if config.id in self._frameworks:
            raise ValueError(f"Framework '{config.id}' is already registered")
        self._frameworks[config.id] = config

    def unregister(self, framework_id: str) -> bool:
        """
        Unregister a framework.
        
        Args:
            framework_id: ID of framework to unregister
            
        Returns:
            True if unregistered, False if not found
        """
        if framework_id in self._frameworks:
            del self._frameworks[framework_id]
            return True
        return False

    def get(self, framework_id: str) -> Optional[FrameworkConfig]:
        """
        Get a framework configuration by ID.
        
        Args:
            framework_id: Framework ID to look up
            
        Returns:
            Framework config or None if not found
        """
        return self._frameworks.get(framework_id)

    def has(self, framework_id: str) -> bool:
        """Check if a framework is registered."""
        return framework_id in self._frameworks

    def list_all(self) -> List[FrameworkConfig]:
        """Get all registered frameworks."""
        return list(self._frameworks.values())

    def list_available(self) -> List[FrameworkConfig]:
        """Get all frameworks with AVAILABLE status."""
        return [f for f in self._frameworks.values() if f.status == FrameworkStatus.AVAILABLE]

    def list_coming_soon(self) -> List[FrameworkConfig]:
        """Get all frameworks with COMING_SOON status."""
        return [f for f in self._frameworks.values() if f.status == FrameworkStatus.COMING_SOON]

    def get_for_org(self, enabled_frameworks: List[str]) -> List[FrameworkConfig]:
        """
        Get framework configs for an organization based on their enabled list.
        
        Args:
            enabled_frameworks: List of framework IDs enabled for the org
            
        Returns:
            List of enabled framework configs (only AVAILABLE ones)
        """
        return [
            self._frameworks[fid]
            for fid in enabled_frameworks
            if fid in self._frameworks and self._frameworks[fid].status == FrameworkStatus.AVAILABLE
        ]

    def validate_data(self, framework_id: str, data: Dict[str, Any]) -> List[str]:
        """
        Validate data against a framework's requirements.
        
        Args:
            framework_id: Framework to validate against
            data: Data to validate
            
        Returns:
            List of validation error messages (empty if valid)
        """
        framework = self.get(framework_id)
        if not framework:
            return [f"Framework '{framework_id}' not found"]
        
        if framework.validator:
            return framework.validator(data)
        
        return []

    def get_data_mapping(self, framework_id: str) -> Dict[str, Any]:
        """
        Get data mapping configuration for a framework.
        
        Args:
            framework_id: Framework ID
            
        Returns:
            Data mapping dict or empty dict if not found
        """
        framework = self.get(framework_id)
        if not framework:
            return {}
        return framework.data_mappings


# Global registry instance
framework_registry = FrameworkRegistry()


# ============================================================================
# Default Framework Registrations
# ============================================================================

# BRSR Framework (Available)
framework_registry.register(FrameworkConfig(
    id="BRSR",
    name="Business Responsibility and Sustainability Reporting",
    version="2021",
    description="SEBI mandated ESG disclosure framework for listed companies in India. Covers Environmental, Social, and Governance aspects with both essential and leadership indicators.",
    status=FrameworkStatus.AVAILABLE,
    disclosure_categories=[
        "section_a",  # General Disclosures
        "section_b",  # Management & Process Disclosures
        "section_c",  # Principle-wise Performance Disclosures
    ],
    data_mappings={
        # Environmental mappings (Principle 6)
        "P6.E1": {"module": "ghg", "field": "total_scope1_emissions"},
        "P6.E2": {"module": "ghg", "field": "total_scope2_emissions"},
        "P6.E3": {"module": "ghg", "field": "total_scope3_emissions"},
        "P6.E4": {"module": "ghg", "field": "emission_intensity"},
        # More mappings to be added per disclosure requirement
    },
    metadata={
        "regulator": "SEBI",
        "country": "India",
        "mandatory_for": "Top 1000 listed companies by market capitalization",
    }
))

# GRI Framework (Available)
framework_registry.register(FrameworkConfig(
    id="GRI",
    name="Global Reporting Initiative Standards",
    version="2021",
    description="The world's most widely used sustainability reporting standards. Provides a comprehensive framework for organizations to report their impacts on the economy, environment, and society.",
    status=FrameworkStatus.AVAILABLE,
    disclosure_categories=[
        "universal",   # Universal Standards (GRI 1-3)
        "economic",    # Economic Standards (GRI 200)
        "environmental", # Environmental Standards (GRI 300)
        "social",      # Social Standards (GRI 400)
    ],
    metadata={
        "organization": "Global Reporting Initiative",
        "global_standard": True,
    }
))

# SBTi is managed separately via sbti_targets_enabled (not as an ESG framework)
