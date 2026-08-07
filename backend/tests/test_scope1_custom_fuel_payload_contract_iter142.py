"""
# Module: Scope1 create/edit custom-fuel payload contract + edit hydration precedence
# Feature: per-month Step 3 persistence shape and qty.unit-first hydration fallbacks
"""

from pathlib import Path


SCOPE1_CREATE_PATH = Path("/app/frontend/src/modules/emissions/categories/shared/Scope1Create.js")
SCOPE1_EDIT_PATH = Path("/app/frontend/src/modules/emissions/categories/shared/Scope1Edit.js")
EMISSIONS_PATH = Path("/app/frontend/src/pages/Emissions.js")
ENTRY_FORM_PATH = Path("/app/frontend/src/components/EmissionEntryForm.js")


def _read(path: Path) -> str:
    assert path.exists(), f"File missing: {path}"
    return path.read_text(encoding="utf-8")


class TestScope1CreateCustomFuelContract:
    def test_build_dynamic_field_values_includes_required_custom_fuel_fields(self):
        content = _read(SCOPE1_CREATE_PATH)

        assert "if (ctx.useCustomFuel)" in content
        assert "out.qty = { value: parseValue(quantity), unit: quantityUnit };" in content
        assert "const quantityUnit = data.custom_qty_unit || data.qty_unit || data.quantity_unit || data.unit || ctx.defaultUnit || 'kg';" in content

        assert "out.custom_ef = { value: parseValue(data.custom_ef), unit: data.custom_ef_unit || '' };" in content
        assert "out.custom_cv = { value: parseValue(data.custom_cv), unit: data.custom_cv_unit || '' };" in content
        assert "out.custom_carbon_content = { value: parseValue(data.custom_carbon_content), unit: '%' };" in content
        assert "out.custom_oxidation_factor = { value: parseValue(data.custom_oxidation_factor), unit: '' };" in content
        assert "out.density = { value: parseValue(data.density), unit: data.density_unit || 'kg/L' };" in content
        assert "out.calculation_methodology = { value: calculationMethodology, unit: '' };" in content

    def test_build_dynamic_field_values_uses_decision_input_fallback_for_methodology(self):
        content = _read(SCOPE1_CREATE_PATH)
        assert "const decisionInputs = ctx.buildDecisionInputs?.(data) || {};" in content
        assert "const calculationMethodology = data.calculation_methodology" in content
        assert "|| decisionInputs.calculation_methodology" in content
        assert "|| 'using_heat_basis_ncv';" in content


class TestScope1EditCustomFuelContract:
    def test_build_dynamic_values_includes_required_custom_fuel_fields(self):
        content = _read(SCOPE1_EDIT_PATH)

        assert "if (ctx.editUseCustomFuel)" in content
        assert "dynamicValues.qty = { value: parseValue(quantity), unit: quantityUnit };" in content
        assert "const quantityUnit = dynamicFieldValues.custom_qty_unit" in content
        assert "|| dynamicFieldValues.qty_unit" in content
        assert "|| dynamicFieldValues.quantity_unit" in content

        assert "dynamicValues.custom_ef = { value: parseValue(dynamicFieldValues.custom_ef), unit: dynamicFieldValues.custom_ef_unit || '' };" in content
        assert "dynamicValues.custom_cv = { value: parseValue(dynamicFieldValues.custom_cv), unit: dynamicFieldValues.custom_cv_unit || '' };" in content
        assert "dynamicValues.custom_carbon_content = { value: parseValue(dynamicFieldValues.custom_carbon_content), unit: '%' };" in content
        assert "dynamicValues.custom_oxidation_factor = { value: parseValue(dynamicFieldValues.custom_oxidation_factor), unit: '' };" in content
        assert "dynamicValues.density = { value: parseValue(dynamicFieldValues.density), unit: dynamicFieldValues.density_unit || 'kg/L' };" in content
        assert "dynamicValues.calculation_methodology = { value: calculationMethodology, unit: '' };" in content

    def test_build_dynamic_values_accepts_object_or_string_methodology(self):
        content = _read(SCOPE1_EDIT_PATH)
        assert "const savedCalculationMethodology = dynamicFieldValues.calculation_methodology;" in content
        assert "const calculationMethodology = (typeof savedCalculationMethodology === 'object'" in content
        assert "? savedCalculationMethodology?.value" in content
        assert ": savedCalculationMethodology)" in content


class TestCustomFuelEditHydrationPriority:
    def test_emissions_hydration_prefers_dynamic_field_values_qty_unit_with_legacy_fallbacks(self):
        content = _read(EMISSIONS_PATH)
        assert "const savedQty = savedDynamicValues.qty;" in content
        assert "const savedQtyUnit = typeof savedQty === 'object' ? savedQty.unit : '';" in content
        assert "values.custom_qty_unit = savedQtyUnit" in content
        assert "|| editingEmission.unit" in content
        assert "|| editingEmission.quantity_unit" in content

    def test_entry_form_hydration_prefers_dynamic_field_values_qty_unit_with_legacy_fallbacks(self):
        content = _read(ENTRY_FORM_PATH)
        assert "const savedQty = dfv.qty;" in content
        assert "const savedQtyUnit = typeof savedQty === 'object' ? savedQty.unit : '';" in content
        assert "monthData.custom_qty_unit = savedQtyUnit" in content
        assert "yearData.custom_qty_unit = savedQtyUnit" in content
        assert "|| editingEmission.unit" in content
        assert "|| editingEmission.quantity_unit" in content
