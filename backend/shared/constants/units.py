"""
Unit normalization constants.

Extracted so that sub-routers split out of `server.py` can reference these
lookup tables without re-importing `server` (which would create a circular
import — `server.py` includes the routers at app-startup time).

Values mirror the definitions in `server.py` (DEFAULT_UNITS @ ~L799,
UNIT_CLASSIFICATIONS @ ~L837, QUANTITY_TO_KG_CONVERSIONS @ ~L844,
NCV_TO_TJ_PER_KG @ ~L871, EF_TO_KG_PER_TJ @ ~L883, DENSITY_CONVERSIONS @ ~L894).
Keep these in sync with `server.py` until that file is fully dismantled.
"""

# Default units to seed the database
DEFAULT_UNITS = [
    # Mass units (base: kg)
    {"name": "Kilogram", "symbol": "kg", "unit_type": "mass", "aliases": ["kilogram", "kilograms", "KG", "Kg"], "is_base_unit": True},
    {"name": "Gram", "symbol": "g", "unit_type": "mass", "aliases": ["gram", "grams", "G"], "is_base_unit": False},
    {"name": "Tonne", "symbol": "t", "unit_type": "mass", "aliases": ["tonne", "tonnes", "ton", "tons", "T", "metric ton"], "is_base_unit": False},
    {"name": "Pound", "symbol": "lb", "unit_type": "mass", "aliases": ["pound", "pounds", "lbs", "LB"], "is_base_unit": False},
    # Volume units (base: L)
    {"name": "Litre", "symbol": "L", "unit_type": "volume", "aliases": ["litre", "litres", "liter", "liters", "l"], "is_base_unit": True},
    {"name": "Millilitre", "symbol": "mL", "unit_type": "volume", "aliases": ["millilitre", "millilitres", "milliliter", "milliliters", "ml", "ML"], "is_base_unit": False},
    {"name": "Kilolitre", "symbol": "kL", "unit_type": "volume", "aliases": ["kilolitre", "kilolitres", "kiloliter", "kiloliters", "kl", "KL"], "is_base_unit": False},
    {"name": "Cubic Metre", "symbol": "m³", "unit_type": "volume", "aliases": ["cubic metre", "cubic meter", "cubic metres", "cubic meters", "m3", "M3"], "is_base_unit": False},
    {"name": "Gallon (US)", "symbol": "gal", "unit_type": "volume", "aliases": ["gallon", "gallons", "us gallon", "us gallons", "GAL"], "is_base_unit": False},
    {"name": "Cubic Feet", "symbol": "ft³", "unit_type": "volume", "aliases": ["cubic foot", "cubic feet", "ft3", "FT3"], "is_base_unit": False},
    # Energy units (base: kWh)
    {"name": "Kilowatt-hour", "symbol": "kWh", "unit_type": "energy", "aliases": ["kilowatt-hour", "kilowatt hour", "kwh", "KWH"], "is_base_unit": True},
    {"name": "Megawatt-hour", "symbol": "MWh", "unit_type": "energy", "aliases": ["megawatt-hour", "megawatt hour", "mwh", "MWH"], "is_base_unit": False},
    {"name": "Gigawatt-hour", "symbol": "GWh", "unit_type": "energy", "aliases": ["gigawatt-hour", "gigawatt hour", "gwh", "GWH"], "is_base_unit": False},
    {"name": "Terajoule", "symbol": "TJ", "unit_type": "energy", "aliases": ["terajoule", "terajoules", "tj"], "is_base_unit": False},
    {"name": "Gigajoule", "symbol": "GJ", "unit_type": "energy", "aliases": ["gigajoule", "gigajoules", "gj"], "is_base_unit": False},
    {"name": "Megajoule", "symbol": "MJ", "unit_type": "energy", "aliases": ["megajoule", "megajoules", "mj"], "is_base_unit": False},
]

# Unit Classifications
UNIT_CLASSIFICATIONS = {
    "mass_units": ["kg", "g", "tonne", "t", "lb", "ton"],
    "volume_units_liquid": ["litre", "L", "kilolitre", "kL", "millilitre", "mL", "gallon", "gal"],
    "volume_units_cubic": ["m3", "m³", "cm3", "cm³", "ft3", "ft³"],
}

# Quantity to kg Conversion Rules
QUANTITY_TO_KG_CONVERSIONS = {
    # Mass units → kg
    "kg": 1,
    "g": 0.001,
    "tonne": 1000,
    "t": 1000,
    "lb": 0.453592,
    "ton": 907.185,  # US short ton
    # Volume liquid units → requires density (kg/L)
    "litre": "density_kg_per_L",
    "L": "density_kg_per_L",
    "kilolitre": "1000 * density_kg_per_L",
    "kL": "1000 * density_kg_per_L",
    "millilitre": "0.001 * density_kg_per_L",
    "mL": "0.001 * density_kg_per_L",
    "gallon": "3.78541 * density_kg_per_L",
    "gal": "3.78541 * density_kg_per_L",
    # Volume cubic units → requires density (kg/m³)
    "m3": "density_kg_per_m3",
    "m³": "density_kg_per_m3",
    "cm3": "0.000001 * density_kg_per_m3",
    "cm³": "0.000001 * density_kg_per_m3",
    "ft3": "0.0283168 * density_kg_per_m3",
    "ft³": "0.0283168 * density_kg_per_m3",
}

# NCV Unit Conversions to TJ/kg
NCV_TO_TJ_PER_KG = {
    "TJ/Gg": 0.001,      # 1 TJ/Gg = 0.001 TJ/kg (since 1 Gg = 1000 t = 1,000,000 kg)
    "TJ/kg": 1,
    "GJ/t": 0.001,       # 1 GJ/t = 0.001 TJ/kg
    "GJ/kg": 0.001,
    "MJ/kg": 0.000001,   # 1 MJ/kg = 0.000001 TJ/kg
    "MJ/L": "0.000001 / density_kg_per_L",  # Needs density
    "kJ/kg": 0.000000001,
    "BTU/lb": 0.000000001055 / 0.453592,  # Convert BTU to TJ and lb to kg
}

# Emission Factor Unit Conversions to kg/TJ
EF_TO_KG_PER_TJ = {
    "kg/TJ": 1,
    "kg/GJ": 1000,       # 1 kg/GJ = 1000 kg/TJ
    "g/MJ": 1,           # 1 g/MJ = 1 kg/TJ (1000g/1000MJ)
    "t/TJ": 1000,        # 1 t/TJ = 1000 kg/TJ
    "kg CO2/TJ": 1,
    "kg CH4/TJ": 1,
    "kg N2O/TJ": 1,
}

# Density Unit Conversions
DENSITY_CONVERSIONS = {
    "kg/L": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "kg/m3": {"to_kg_per_L": 0.001, "to_kg_per_m3": 1},
    "kg/m³": {"to_kg_per_L": 0.001, "to_kg_per_m3": 1},
    "g/mL": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "g/cm3": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "g/cm³": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "lb/gal": {"to_kg_per_L": 0.119826, "to_kg_per_m3": 119.826},
    "t/m3": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
    "t/m³": {"to_kg_per_L": 1, "to_kg_per_m3": 1000},
}
