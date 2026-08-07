import React from 'react';
import { Calculator } from 'lucide-react';
import { ColourfulEmissionSummary } from './ColourfulEmissionSummary';

const METHODOLOGY_LABELS = {
  using_heat_basis_ncv: 'Heat Basis (NCV)',
  using_qty_basis_ef: 'Quantity Basis EF',
  using_carbon_composition: 'Carbon Composition',
};

const valueFromOutput = (result, outputName, legacyName) => (
  result?.outputs?.[outputName]?.value ?? result?.[legacyName] ?? 0
);

const unitFromOutput = (result, outputName, fallback) => (
  result?.outputs?.[outputName]?.unit || fallback
);

export const CustomFuelLiveCalculation = ({ result, methodology, isCalculating = false }) => {
  if (!result) return null;

  const auditLog = result.audit_log || result.auditLog || [];
  const formulaStep = auditLog.find((entry) => entry.step === 'formula_step');
  const formulaName = result.resolved_formula?.name || result.appliedFormulaName || 'Configured Custom Fuel formula';
  const expression = formulaStep?.expression_readable || formulaStep?.expression;
  const calculation = {
    co2Emissions: valueFromOutput(result, 'co2', 'co2_emissions') || result.co2Emissions,
    ch4Emissions: valueFromOutput(result, 'ch4', 'ch4_emissions') || result.ch4Emissions,
    n2oEmissions: valueFromOutput(result, 'n2o', 'n2o_emissions') || result.n2oEmissions,
    co2eEmissions: valueFromOutput(result, 'co2e', 'co2e_emissions') || result.co2eEmissions,
    co2OutputUnit: unitFromOutput(result, 'co2', result.co2OutputUnit || 'tCO2'),
    ch4OutputUnit: unitFromOutput(result, 'ch4', result.ch4OutputUnit || 'tCH4'),
    n2oOutputUnit: unitFromOutput(result, 'n2o', result.n2oOutputUnit || 'tN2O'),
    co2eOutputUnit: unitFromOutput(result, 'co2e', result.co2eOutputUnit || 'tCO2e'),
    auditLog,
  };

  return (
    <section className="space-y-3" data-testid="custom-fuel-live-calculation">
      <div className="border border-cyan-200 bg-cyan-50 p-3 rounded-lg" data-testid="custom-fuel-applied-formula">
        <div className="flex items-center gap-2 text-cyan-900">
          <Calculator className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase">Applied Custom Fuel Formula</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-cyan-950" data-testid="custom-fuel-formula-name">{formulaName}</p>
        <p className="mt-1 text-xs text-cyan-800" data-testid="custom-fuel-methodology">{METHODOLOGY_LABELS[methodology] || methodology}</p>
        {expression ? <p className="mt-2 text-xs text-cyan-950 break-words" data-testid="custom-fuel-formula-expression">{expression}</p> : null}
      </div>
      <ColourfulEmissionSummary calculation={calculation} isCalculating={isCalculating} isScope3Like={false} />
    </section>
  );
};