import React from 'react';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import {
  isDensityRequiredForHeatBasis,
  isDensityRequiredForQtyBasis,
  isDensityRequiredForCarbonComposition,
} from '../utils/unitHelpers';

const ENERGY_UNITS = ['TJ', 'MJ'];
const MASS_UNITS = ['kg', 'g', 't'];
const VOLUME_UNITS = ['L', 'kL', 'ml', 'm3', 'cm3'];
const ALL_QTY_UNITS = [...MASS_UNITS, ...VOLUME_UNITS];

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
const CustomFuelMonthFields = ({ monthKey, data, updateMonthData, calculationMethodology }) => {
  const qtyUnit = data.custom_qty_unit || 'kg';

  const qtyUnitSelector = (
    <div className="space-y-1">
      <Label className="text-xs">Quantity Unit <span className="text-red-500">*</span></Label>
      <select
        value={qtyUnit}
        onChange={(e) => updateMonthData(monthKey, 'custom_qty_unit', e.target.value)}
        className="w-full h-9 bg-white border border-stone-200 rounded-lg px-2 text-sm"
        data-testid={`month-${monthKey}-custom-qty-unit`}
      >
        {ALL_QTY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );

  // Density input — shown only when dimension mismatch detected per-methodology
  const renderDensity = (needed, unitLabel) => {
    if (!needed) return null;
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Density <span className="text-red-500">*</span></Label>
          <Input
            type="number" step="any" min="0"
            value={data.density || ''}
            onChange={(e) => updateMonthData(monthKey, 'density', e.target.value)}
            placeholder="e.g. 0.84" className="bg-white h-9 text-sm"
            data-testid={`month-${monthKey}-density`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Density Unit</Label>
          <div className="flex items-center h-9 bg-stone-100 border border-stone-200 rounded-lg px-2 text-sm text-stone-600">
            {unitLabel}
          </div>
        </div>
      </div>
    );
  };

  if (calculationMethodology === 'using_heat_basis_ncv') {
    const cvUnit = data.custom_cv_unit || 'TJ/kg';
    const cvDenom = cvUnit.split('/')[1] || 'kg';
    const needsDensity = isDensityRequiredForHeatBasis(cvUnit, qtyUnit);
    return (
      <div className="space-y-3 p-3 bg-amber-50/60 border border-amber-200 rounded-lg" data-testid={`custom-fuel-fields-${monthKey}`}>
        <p className="text-xs text-amber-700 font-medium">Custom Fuel — Heat Basis (NCV)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Emission Factor <span className="text-red-500">*</span></Label>
            <Input
              type="number" step="any" min="0"
              value={data.custom_ef || ''}
              onChange={(e) => updateMonthData(monthKey, 'custom_ef', e.target.value)}
              placeholder="e.g. 0.074" className="bg-white h-9 text-sm"
              data-testid={`month-${monthKey}-custom-ef`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">EF Unit <span className="text-red-500">*</span></Label>
            <select
              value={data.custom_ef_unit || 'tCO2/TJ'}
              onChange={(e) => updateMonthData(monthKey, 'custom_ef_unit', e.target.value)}
              className="w-full h-9 bg-white border border-stone-200 rounded-lg px-2 text-sm"
              data-testid={`month-${monthKey}-custom-ef-unit`}
            >
              {ENERGY_UNITS.map(u => <option key={u} value={`tCO2/${u}`}>tCO2/{u}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Calorific Value <span className="text-red-500">*</span></Label>
            <Input
              type="number" step="any" min="0"
              value={data.custom_cv || ''}
              onChange={(e) => updateMonthData(monthKey, 'custom_cv', e.target.value)}
              placeholder="e.g. 0.0431" className="bg-white h-9 text-sm"
              data-testid={`month-${monthKey}-custom-cv`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CV Unit <span className="text-red-500">*</span></Label>
            <select
              value={data.custom_cv_unit || 'TJ/kg'}
              onChange={(e) => updateMonthData(monthKey, 'custom_cv_unit', e.target.value)}
              className="w-full h-9 bg-white border border-stone-200 rounded-lg px-2 text-sm"
              data-testid={`month-${monthKey}-custom-cv-unit`}
            >
              {ENERGY_UNITS.flatMap(num =>
                ALL_QTY_UNITS.map(den => (
                  <option key={`${num}/${den}`} value={`${num}/${den}`}>{num}/{den}</option>
                ))
              )}
            </select>
          </div>
        </div>
        {qtyUnitSelector}
        {renderDensity(needsDensity, `kg/${cvDenom}`)}
      </div>
    );
  }

  if (calculationMethodology === 'using_qty_basis_ef') {
    const efUnit = data.custom_ef_unit || 'tCO2/kg';
    const efDenom = efUnit.split('/')[1] || 'kg';
    const needsDensity = isDensityRequiredForQtyBasis(efUnit, [qtyUnit]);
    return (
      <div className="space-y-3 p-3 bg-amber-50/60 border border-amber-200 rounded-lg" data-testid={`custom-fuel-fields-${monthKey}`}>
        <p className="text-xs text-amber-700 font-medium">Custom Fuel — Qty Basis EF</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Emission Factor <span className="text-red-500">*</span></Label>
            <Input
              type="number" step="any" min="0"
              value={data.custom_ef || ''}
              onChange={(e) => updateMonthData(monthKey, 'custom_ef', e.target.value)}
              placeholder="e.g. 2.68" className="bg-white h-9 text-sm"
              data-testid={`month-${monthKey}-custom-ef`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">EF Unit <span className="text-red-500">*</span></Label>
            <select
              value={data.custom_ef_unit || 'tCO2/kg'}
              onChange={(e) => updateMonthData(monthKey, 'custom_ef_unit', e.target.value)}
              className="w-full h-9 bg-white border border-stone-200 rounded-lg px-2 text-sm"
              data-testid={`month-${monthKey}-custom-ef-unit`}
            >
              {ALL_QTY_UNITS.map(u => <option key={u} value={`tCO2/${u}`}>tCO2/{u}</option>)}
            </select>
          </div>
        </div>
        {qtyUnitSelector}
        {renderDensity(needsDensity, `kg/${efDenom}`)}
      </div>
    );
  }

  if (calculationMethodology === 'using_carbon_composition') {
    const needsDensity = isDensityRequiredForCarbonComposition(qtyUnit);
    return (
      <div className="space-y-3 p-3 bg-amber-50/60 border border-amber-200 rounded-lg" data-testid={`custom-fuel-fields-${monthKey}`}>
        <p className="text-xs text-amber-700 font-medium">Custom Fuel — Carbon Composition</p>
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
        {qtyUnitSelector}
        {renderDensity(needsDensity, 'kg/L')}
      </div>
    );
  }

  return null;
};

export default CustomFuelMonthFields;
