"""
ESG Frameworks Module

Provides a pluggable framework architecture for ESG reporting standards:
- BRSR (Business Responsibility and Sustainability Reporting)
- GRI (Global Reporting Initiative) - Future
- SBTi (Science Based Targets initiative) - Future

Each framework can define:
- Disclosure requirements
- Mapping rules to ESG data
- Report templates
- Validation rules
"""

from modules.frameworks.registry import (
    FrameworkRegistry,
    FrameworkConfig,
    framework_registry,
)
from modules.frameworks.router import router

__all__ = [
    "FrameworkRegistry",
    "FrameworkConfig",
    "framework_registry",
    "router",
]
