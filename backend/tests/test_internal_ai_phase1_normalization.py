import pytest

from modules.internal_data_ai.data_normalization import resolve_emission_unit, resolve_record_quantity
from modules.internal_data_ai.entity_resolution import resolve_fuel_entity
from modules.internal_data_ai.reporting_periods import ResolvedPeriod, resolve_record_period_match


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _length):
        return self.rows


class _FuelDatabase:
    def __init__(self, rows):
        self.rows = rows

    def find(self, *_args):
        return _Cursor(self.rows)


class _DB:
    def __init__(self, fuels):
        self.fuel_database = _FuelDatabase(fuels)


class TestQuantityNormalization:
    def test_dynamic_quantity_has_priority(self):
        result = resolve_record_quantity({
            "quantity": 100,
            "quantity_unit": "kg",
            "dynamic_field_values": {"qty": {"value": "200", "unit": "L"}},
        })
        assert result == {"value": 200, "unit": "L", "source": "dynamic_field_values.qty"}

    def test_legacy_quantity_is_supported(self):
        assert resolve_record_quantity({"quantity": "12000.2", "quantity_unit": "kWh"}) == {
            "value": 12000.2,
            "unit": "kWh",
            "source": "legacy_quantity",
        }

    def test_missing_quantity_is_explicit(self):
        assert resolve_record_quantity({}) == {"value": None, "unit": None, "source": "unavailable"}


class TestUnitResolution:
    def test_audit_unit_has_priority_over_formula_and_record(self):
        result = resolve_emission_unit(
            {"co2e_unit": "kgCO2e"},
            formula_definition={"outputs": [{"variable": "co2e", "unit": "tCO2e"}]},
            calculation_audit={"outputs": {"co2e": {"unit": "MtCO2e"}}},
        )
        assert result == {"unit": "MtCO2e", "source": "calculation_audit"}

    def test_formula_unit_is_used_when_audit_is_unavailable(self):
        assert resolve_emission_unit(
            {}, formula_definition={"outputs": [{"variable": "co2e", "unit": "tCO2e"}]}
        ) == {"unit": "tCO2e", "source": "formula_definition"}


class TestFuelResolution:
    @pytest.mark.asyncio
    async def test_canonical_and_approved_diesel_aliases_resolve(self):
        db = _DB([{"fuel_name": "Diesel"}, {"fuel_name": "Crude Oil"}])
        for requested in ("Diesel", "diesel", "HSD", "High Speed Diesel", "High-Speed Diesel"):
            result = await resolve_fuel_entity(db, requested)
            assert result["status"] == "RESOLVED"
            assert result["canonical_value"] == "Diesel"

    @pytest.mark.asyncio
    async def test_unknown_fuel_does_not_guess(self):
        result = await resolve_fuel_entity(_DB([{"fuel_name": "Diesel"}]), "Mystery Fuel")
        assert result == {"status": "NOT_FOUND", "canonical_value": None, "matches": []}


class TestPeriodEvidence:
    def test_monthly_and_annual_periods_are_distinguished(self):
        july = ResolvedPeriod("2026-07", "2026-07", "July 2026", "explicit", fiscal_start_month=4)
        assert resolve_record_period_match("2026-07", july) == {"period_match": "EXACT", "allocation_factor": 1.0}
        assert resolve_record_period_match("FY 2026-27", july) == {
            "period_match": "ANNUAL_VALUE_ALLOCATED_TO_MONTH",
            "allocation_factor": pytest.approx(1 / 12),
        }
        assert resolve_record_period_match("FY 2025-26", july) == {"period_match": "MISMATCH", "allocation_factor": 0.0}