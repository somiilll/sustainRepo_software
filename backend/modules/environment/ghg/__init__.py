"""
GHG (Greenhouse Gas) Module

Consolidates all GHG-related functionality:
- Emissions (Scope 1, 2, 3, Biogenic)
- Calculations (CalcEngine)
- Data (Fuel Database, Emission Factors, Units, GWP)
- Reports (GHG-specific reporting)

This module re-exports from the existing modules for backward compatibility
while providing a unified namespace for GHG functionality.
"""

# Re-export from existing modules for backward compatibility
# These will be gradually migrated into the ghg namespace

__all__ = []
