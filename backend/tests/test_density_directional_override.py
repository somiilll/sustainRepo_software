"""Property-conversion contracts for directional user-entered density units."""
import os
import pytest
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from calc_engine import units


class _Conversions:
    def __init__(self, direct_record=None, reverse_record=None):
        self.direct_record = direct_record
        self.reverse_record = reverse_record

    async def find_one(self, query, _projection):
        if query["from_unit"] == "L" and query["to_unit"] == "kg":
            return self.direct_record or self.reverse_record
        return None


class _Db:
    def __init__(self, direct_record=None, reverse_record=None):
        self.ce_unit_conversions = _Conversions(direct_record, reverse_record)


PROPERTY_RECORD = {
    "conversion_type": "property_based",
    "property_key": "density",
}


async def _same_unit_only(_db, value, from_unit, to_unit, **_kwargs):
    if from_unit == to_unit:
        return value, {"factor": 1.0}
    raise ValueError("no compatible compound conversion")


@pytest.mark.asyncio
async def test_volume_to_mass_accepts_directional_mass_per_volume_density(monkeypatch):
    monkeypatch.setattr(units, "convert", _same_unit_only)
    factor, audit = await units._convert_component(
        _Db(direct_record=PROPERTY_RECORD),
        "L",
        "kg",
        user_overrides={"density": {"value": 0.8, "unit": "kg/L"}},
    )
    assert factor == 0.8
    assert audit["method"] == "property_based_user_override"


@pytest.mark.asyncio
async def test_mass_to_volume_accepts_directional_volume_per_mass_density(monkeypatch):
    monkeypatch.setattr(units, "convert", _same_unit_only)
    factor, audit = await units._convert_component(
        _Db(reverse_record=PROPERTY_RECORD),
        "kg",
        "L",
        user_overrides={"density": {"value": 1.25, "unit": "L/kg"}},
    )
    assert factor == 1.25
    assert audit["method"] == "property_based_reverse_user_override"


@pytest.mark.asyncio
async def test_mass_to_volume_keeps_legacy_mass_per_volume_density_compatible(monkeypatch):
    monkeypatch.setattr(units, "convert", _same_unit_only)
    factor, _audit = await units._convert_component(
        _Db(reverse_record=PROPERTY_RECORD),
        "kg",
        "L",
        user_overrides={"density": {"value": 0.8, "unit": "kg/L"}},
    )
    assert factor == 1.25