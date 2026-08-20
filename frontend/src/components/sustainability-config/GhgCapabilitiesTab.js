import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Save } from 'lucide-react';

const PROCESS_TYPES = [
  { value: 'venting', label: 'Venting' },
  { value: 'n2o_overall_combustion', label: 'N2O from Overall Combustion' },
  { value: 'ch4_overall_combustion', label: 'CH4 from Overall Combustion' },
];

const SCOPE3_CATEGORIES = [
  { value: 'purchased_goods_and_services', label: 'C1 — Purchased Goods and Services' },
  { value: 'capital_goods', label: 'C2 — Capital Goods' },
  { value: 'fuel_and_energy_related_activities_not_included_in_scope_1_or_scope_2', label: 'C3 — Fuel and Energy Related Activities' },
  { value: 'upstream_transportation_distribution', label: 'C4 — Upstream Transportation and Distribution' },
  { value: 'waste_generated_in_operations', label: 'C5 — Waste Generated in Operations' },
  { value: 'business_travel', label: 'C6 — Business Travel' },
  { value: 'employee_commuting', label: 'C7 — Employee Commuting' },
  { value: 'upstream_leased_assets', label: 'C8 — Upstream Leased Assets' },
  { value: 'downstream_transportation_and_distribution', label: 'C9 — Downstream Transportation and Distribution' },
  { value: 'processing_of_sold_products', label: 'C10 — Processing of Sold Products' },
  { value: 'use_of_sold_products', label: 'C11 — Use of Sold Products' },
  { value: 'end_of_life_treatment_of_sold_products', label: 'C12 — End-of-Life Treatment of Sold Products' },
  { value: 'downstream_leased_assets', label: 'C13 — Downstream Leased Assets' },
  { value: 'franchises', label: 'C14 — Franchises' },
  { value: 'investments', label: 'C15 — Investments' },
];

const MANAGED_CATEGORY_CODES = ['process_emissions', ...SCOPE3_CATEGORIES.map((category) => category.value)];

export function GhgCapabilitiesTab({ orgConfig, onSave, saving }) {
  const overrides = orgConfig?.ghg_overrides || {};
  const [processEmissionsEnabled, setProcessEmissionsEnabled] = useState(
    !(overrides.disabledCategories || []).includes('process_emissions'),
  );
  const [customFuelEnabled, setCustomFuelEnabled] = useState(
    overrides.capabilityOverrides?.customFuel !== false,
  );
  const [processTypes, setProcessTypes] = useState(
    overrides.processTypeOptions || PROCESS_TYPES.map((option) => option.value),
  );
  const [scope3Categories, setScope3Categories] = useState(
    SCOPE3_CATEGORIES
      .filter((category) => !(overrides.disabledCategories || []).includes(category.value))
      .map((category) => category.value),
  );

  const toggleProcessType = (value) => {
    setProcessTypes((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  };
  const toggleScope3Category = (value) => {
    setScope3Categories((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  };
  const handleSave = () => onSave({
    ghg_overrides: {
      disabledCategories: [
        ...(overrides.disabledCategories || []).filter((category) => !MANAGED_CATEGORY_CODES.includes(category)),
        ...(processEmissionsEnabled ? [] : ['process_emissions']),
        ...SCOPE3_CATEGORIES
          .filter((category) => !scope3Categories.includes(category.value))
          .map((category) => category.value),
      ],
      capabilityOverrides: customFuelEnabled ? {} : { customFuel: false },
      processTypeOptions: processTypes.length ? processTypes : PROCESS_TYPES.map((option) => option.value),
    },
  });

  return (
    <Card className="p-6" data-testid="ghg-capabilities-tab">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">GHG Capabilities</h2>
          <p className="mt-1 text-sm text-stone-500">Control available GHG entry options without changing central calculations.</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving || (processEmissionsEnabled && processTypes.length === 0)} data-testid="save-ghg-capabilities-button">
          <Save className="mr-1 h-4 w-4" /> Save
        </Button>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-6 border-b border-stone-200 pb-5" data-testid="process-emissions-capability-control">
          <div><h3 className="font-medium text-stone-800">Process Emissions</h3><p className="mt-1 text-xs text-stone-500">Allow this category for new Scope 1 entries.</p></div>
          <Switch checked={processEmissionsEnabled} onCheckedChange={setProcessEmissionsEnabled} data-testid="process-emissions-enabled-toggle" />
        </div>

        <div className="border-b border-stone-200 pb-5" data-testid="process-type-options-control">
          <h3 className="font-medium text-stone-800">Available Process Types</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {PROCESS_TYPES.map((option) => (
              <Label key={option.value} className="flex items-center gap-3 border border-stone-200 p-3 text-sm font-normal">
                <Checkbox checked={processTypes.includes(option.value)} disabled={!processEmissionsEnabled} onCheckedChange={() => toggleProcessType(option.value)} data-testid={`process-type-option-${option.value}`} />
                {option.label}
              </Label>
            ))}
          </div>
          {processEmissionsEnabled && processTypes.length === 0 && <p className="mt-2 text-xs text-red-600" data-testid="process-type-options-error">Select at least one Process Type.</p>}
        </div>

        <div className="border-b border-stone-200 pb-5" data-testid="scope3-category-visibility-control">
          <h3 className="font-medium text-stone-800">Scope 3 Categories</h3>
          <p className="mt-1 text-xs text-stone-500">Choose which centrally supported Scope 3 categories are available for new entries.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SCOPE3_CATEGORIES.map((category) => (
              <Label key={category.value} className="flex items-center gap-3 border border-stone-200 p-3 text-sm font-normal">
                <Checkbox
                  checked={scope3Categories.includes(category.value)}
                  onCheckedChange={() => toggleScope3Category(category.value)}
                  data-testid={`scope3-category-option-${category.value}`}
                />
                {category.label}
              </Label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-6" data-testid="custom-fuel-capability-control">
          <div><h3 className="font-medium text-stone-800">Custom Fuel</h3><p className="mt-1 text-xs text-stone-500">Allow the existing Custom Fuel entry option where it is centrally supported.</p></div>
          <Switch checked={customFuelEnabled} onCheckedChange={setCustomFuelEnabled} data-testid="custom-fuel-enabled-toggle" />
        </div>
      </div>
    </Card>
  );
}