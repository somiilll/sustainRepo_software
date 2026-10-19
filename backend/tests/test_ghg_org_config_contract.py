"""Validation contract for persisted, presentation-only GHG organization controls."""
import pytest
from pydantic import ValidationError

from modules.sustainability_config.contracts import OrganizationConfigUpdate


def test_ghg_overrides_accept_supported_visibility_controls_only():
    payload = OrganizationConfigUpdate.model_validate({
        "ghg_overrides": {
            "disabledCategories": ["process_emissions"],
            "capabilityOverrides": {"customFuel": False},
            "processTypeOptions": ["venting", "ch4_overall_combustion"],
        },
    })
    assert payload.ghg_overrides.processTypeOptions == ["venting", "ch4_overall_combustion"]


@pytest.mark.parametrize("override", [
    {"processTypeOptions": ["calcination"]},
    {"processTypeOptions": []},
    {"processTypeOptions": ["venting", "venting"]},
    {"capabilityOverrides": {"customFuel": True}},
    {"formulaOverrides": {"venting": "unsafe"}},
])
def test_ghg_overrides_reject_unknown_or_calculation_controls(override):
    with pytest.raises(ValidationError):
        OrganizationConfigUpdate.model_validate({"ghg_overrides": override})