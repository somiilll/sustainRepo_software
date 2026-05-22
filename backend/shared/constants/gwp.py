"""GWP (Global Warming Potential) constants — IPCC AR6 100-year values.

These are *defaults* — actual values come from DB (`gwp_configs` collection).
Used as fallback in calculation paths and seeding flows.

Phase B9: extracted from server.py to be shared cleanly between
server.py (legacy) and modules/superadmin/router.py.
"""

GWP_VALUES = {
    "CO2": 1,
    "CH4": 27.9,  # AR6 value (was 28 in AR5)
    "N2O": 273,   # AR6 value (same as AR5)
}

# Default GWP source label.
GWP_DEFAULT_SOURCE = "IPCC AR6"

__all__ = ["GWP_VALUES", "GWP_DEFAULT_SOURCE"]
