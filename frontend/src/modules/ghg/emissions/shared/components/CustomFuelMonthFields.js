import React, { useEffect } from 'react';
import { Flame } from 'lucide-react';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import {
  invertDensityUnit,
  resolveDensityRequirement,
} from '../utils/unitHelpers';
import {
  GHG_FIELD_OPTION_KEYS,
  resolveStandardGhgFieldOptions,
} from '../../../config/standardGhgFormConfig';
import { buildNativeOptionsHtml } from '../utils/nativeSelectOptions';

const DEFAULT_FIELD_OPTIONS = resolveStandardGhgFieldOptions();

const MeasurementInput = ({
  label,
  value,
  onChange,
  placeholder,
  unitLabel,
  unitValue,
  onUnitChange,
  unitOptions = [],
  inputTestId,
  unitTestId,
}) => (
  <div className="space-y-1">
    <Label className="text-xs">{label} <span className="text-red-500">*</span></Label>
    <div className="flex overflow-hidden rounded-md border border-stone-200 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
      <Input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-9 flex-1 rounded-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
        data-testid={inputTestId}
      />
      {unitOptions.length > 0 ? (
        <select
          value={unitValue}
          onChange={onUnitChange}
          className="h-9 min-w-24 border-0 border-l border-l-stone-200 bg-transparent px-2 text-sm outline-none"
          data-testid={unitTestId}
          dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(unitOptions) }}
        />
      ) : (
        <div className="flex h-9 min-w-20 items-center border-l border-l-stone-200 bg-stone-50 px-2 text-sm text-stone-600" data-testid={unitTestId}>
          {unitLabel}
        </div>
      )}
    </div>
  </div>
);

/**
 * Per-month custom fuel fields rendered inside Step 3's month accordion.
 * Handles all methodology-specific inputs + density when dimension mismatch detected.
 *
 * Data keys stored in monthlyData[monthKey]:
 *   All:                custom_qty_unit, density, density_unit
 *   Heat Basis:         custom_ef, custom_ef_unit, custom_cv, custom_cv_unit
 *   Qty Basis EF:       custom_ef, custom_ef_unit
 *   Carbon Composition: custom_carbon_content, custom_oxidation_factor
 */
const CustomFuelMonthFields = ({
  monthKey,
  data,
  updateMonthData,
  calculationMethodology,
  fieldOptions = DEFAULT_FIELD_OPTIONS,
  centralizedUnits = [],
  renderFields = true,
  showMethodIndicator = true,
  isFugitiveCustomFuel = false,
}) => {
  const heatEfUnits = fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_EF_UNIT]
    || DEFAULT_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_EF_UNIT];
  const heatCvUnits = fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_CV_UNIT]
    || DEFAULT_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_CV_UNIT];
  const quantityEfUnits = fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QTY_EF_UNIT]
    || DEFAULT_FIELD_OPTIONS[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QTY_EF_UNIT];
  const qtyUnit = data.custom_qty_unit || 'kg';
  const heatCvUnit = data.custom_cv_unit || 'TJ/kg';
  const quantityEfUnit = data.custom_ef_unit || 'kgCO2/kg';
  const referenceUnit = calculationMethodology === 'using_heat_basis_ncv'
    ? heatCvUnit.split('/')[1] || 'kg'
    : calculationMethodology === 'using_qty_basis_ef'
      ? quantityEfUnit.split('/')[1] || 'kg'
      : calculationMethodology === 'using_carbon_composition'
        ? 'kg'
        : '';
  const densityRequirement = resolveDensityRequirement({
    quantityUnit: qtyUnit,
    referenceUnit,
    centralizedUnits,
  });
  const customQuantity = data.qty ?? data.quantity ?? data.custom_qty;
  const hasDensitySourceValue = calculationMethodology === 'using_heat_basis_ncv'
    ? [customQuantity, data.custom_cv, data.custom_ef].some((value) => value !== '' && value !== null && value !== undefined)
    : calculationMethodology === 'using_qty_basis_ef'
      ? [customQuantity, data.custom_ef].some((value) => value !== '' && value !== null && value !== undefined)
      : [customQuantity, data.custom_carbon_content].some((value) => value !== '' && value !== null && value !== undefined);

  useEffect(() => {
    if (isFugitiveCustomFuel) return;
    if (!hasDensitySourceValue || !densityRequirement.required || !densityRequirement.densityUnit) return;
    const currentDensityUnit = data.density_unit || '';
    if (currentDensityUnit === densityRequirement.densityUnit) return;

    const nextData = { density_unit: densityRequirement.densityUnit };
    if (
      currentDensityUnit === invertDensityUnit(densityRequirement.densityUnit)
      && data.density !== undefined
      && data.density !== null
      && data.density !== ''
      && Number(data.density) !== 0
    ) {
      nextData.density = String(1 / Number(data.density));
    }
    Object.entries(nextData).forEach(([key, value]) => updateMonthData(monthKey, key, value));
  }, [data.density, data.density_unit, densityRequirement.densityUnit, densityRequirement.required, hasDensitySourceValue, isFugitiveCustomFuel, monthKey, updateMonthData]);

  if (!renderFields || isFugitiveCustomFuel) return null;

  // Density input — shown only when dimension mismatch detected per-methodology
  const renderDensity = (needed, unitLabel) => {
    if (!needed) return null;
    return (
      <div className="space-y-1">
        <MeasurementInput
          label="Density"
          value={data.density || ''}
          onChange={(event) => updateMonthData(monthKey, 'density', event.target.value)}
          placeholder="e.g. 0.84"
          unitLabel={unitLabel}
          inputTestId={`month-${monthKey}-density`}
          unitTestId={`month-${monthKey}-density-unit`}
        />
        <p className="text-xs text-amber-700" data-testid={`month-${monthKey}-density-conversion-hint`}>
          Conversion required: {qtyUnit} → {referenceUnit}
        </p>
      </div>
    );
  };

  if (calculationMethodology === 'using_heat_basis_ncv') {
    const cvUnit = heatCvUnit;
    return (
      <div className="space-y-3 border-l-2 border-amber-300 pl-3" data-testid={`custom-fuel-fields-${monthKey}`}>
        {showMethodIndicator && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800" data-testid={`custom-fuel-method-indicator-${monthKey}`}>
            <Flame className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            <span>Custom fuel factors · Heat Basis (NCV)</span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MeasurementInput
            label="Emission Factor"
            value={data.custom_ef || ''}
            onChange={(event) => updateMonthData(monthKey, 'custom_ef', event.target.value)}
            placeholder="e.g. 0.074"
            unitValue={data.custom_ef_unit || 'tCO2/TJ'}
            onUnitChange={(event) => updateMonthData(monthKey, 'custom_ef_unit', event.target.value)}
            unitOptions={heatEfUnits}
            inputTestId={`month-${monthKey}-custom-ef`}
            unitTestId={`month-${monthKey}-custom-ef-unit`}
          />
          <MeasurementInput
            label="Calorific Value"
            value={data.custom_cv || ''}
            onChange={(event) => updateMonthData(monthKey, 'custom_cv', event.target.value)}
            placeholder="e.g. 0.0431"
            unitValue={data.custom_cv_unit || 'TJ/kg'}
            onUnitChange={(event) => updateMonthData(monthKey, 'custom_cv_unit', event.target.value)}
            unitOptions={heatCvUnits}
            inputTestId={`month-${monthKey}-custom-cv`}
            unitTestId={`month-${monthKey}-custom-cv-unit`}
          />
        </div>
        {renderDensity(hasDensitySourceValue && densityRequirement.required, densityRequirement.densityUnit)}
      </div>
    );
  }

  if (calculationMethodology === 'using_qty_basis_ef') {
    return (
      <div className="space-y-3 border-l-2 border-amber-300 pl-3" data-testid={`custom-fuel-fields-${monthKey}`}>
        {showMethodIndicator && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800" data-testid={`custom-fuel-method-indicator-${monthKey}`}>
            <Flame className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            <span>Custom fuel factors · Quantity Basis EF</span>
          </div>
        )}
        <MeasurementInput
          label="Emission Factor"
          value={data.custom_ef || ''}
          onChange={(event) => updateMonthData(monthKey, 'custom_ef', event.target.value)}
          placeholder="e.g. 2.68"
          unitValue={data.custom_ef_unit || 'kgCO2/kg'}
          onUnitChange={(event) => updateMonthData(monthKey, 'custom_ef_unit', event.target.value)}
          unitOptions={quantityEfUnits}
          inputTestId={`month-${monthKey}-custom-ef`}
          unitTestId={`month-${monthKey}-custom-ef-unit`}
        />
        {renderDensity(hasDensitySourceValue && densityRequirement.required, densityRequirement.densityUnit)}
      </div>
    );
  }

  if (calculationMethodology === 'using_carbon_composition') {
    return (
      <div className="space-y-3 border-l-2 border-amber-300 pl-3" data-testid={`custom-fuel-fields-${monthKey}`}>
        {showMethodIndicator && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800" data-testid={`custom-fuel-method-indicator-${monthKey}`}>
            <Flame className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            <span>Custom fuel factors · Carbon Composition</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Carbon Content (%) <span className="text-red-500">*</span></Label>
            <Input
              type="number" step="any" min="0" max="100"
              value={data.custom_carbon_content || ''}
              onChange={(e) => updateMonthData(monthKey, 'custom_carbon_content', e.target.value)}
              placeholder="e.g. 85" className="bg-white h-9 text-sm"
              data-testid={`month-${monthKey}-custom-carbon-content`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Oxidation Factor <span className="text-red-500">*</span></Label>
            <Input
              type="number" step="any" min="0" max="1"
              value={data.custom_oxidation_factor || ''}
              onChange={(e) => updateMonthData(monthKey, 'custom_oxidation_factor', e.target.value)}
              placeholder="e.g. 1" className="bg-white h-9 text-sm"
              data-testid={`month-${monthKey}-custom-oxidation-factor`}
            />
          </div>
        </div>
        {renderDensity(hasDensitySourceValue && densityRequirement.required, densityRequirement.densityUnit)}
      </div>
    );
  }

  return null;
};

export default CustomFuelMonthFields;
