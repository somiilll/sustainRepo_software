import React from 'react';
import { Calculator } from 'lucide-react';

const formatValue = (value) => {
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return value ?? '—';
};

const displayUnit = (unit) => (unit && unit !== '1' ? unit : '');

const buildFallbackOutputs = (calculation) => [
  { label: 'CO₂', value: calculation.co2Emissions, unit: calculation.co2OutputUnit || 'tCO₂' },
  { label: 'CH₄', value: calculation.ch4Emissions, unit: calculation.ch4OutputUnit || 'tCH₄' },
  { label: 'N₂O', value: calculation.n2oEmissions, unit: calculation.n2oOutputUnit || 'tN₂O' },
  { label: 'CO₂e', value: calculation.co2eEmissions, unit: calculation.co2eOutputUnit || 'tCO₂e' },
].filter((output) => output.value !== undefined && output.value !== null);

export default function EmissionCalculationTrace({ calculation, isCalculating }) {
  const auditLog = Array.isArray(calculation.auditLog) ? calculation.auditLog : [];
  const inputs = auditLog.filter((entry) => entry.step === 'input' || entry.step === 'resolve_property');
  const formulaSteps = auditLog.filter((entry) => entry.step === 'formula_step');
  const auditOutputs = auditLog.find((entry) => entry.step === 'outputs')?.outputs;
  const outputs = auditOutputs
    ? Object.entries(auditOutputs).map(([label, output]) => ({
        label: label.toUpperCase(),
        value: output?.value,
        unit: output?.unit,
      }))
    : buildFallbackOutputs(calculation);

  return (
    <section className="border border-primary/20 bg-primary/[0.03]" data-testid="edit-calculation-trace">
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 px-4 py-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-text-secondary">Calculation trail</h3>
        </div>
        {isCalculating ? <span className="text-xs text-amber-700" data-testid="edit-calculation-updating">Updating…</span> : null}
      </div>

      <div className="grid divide-y divide-primary/15 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <div className="p-4" data-testid="edit-calculation-inputs">
          <p className="text-xs font-semibold uppercase text-stone-500">1. Inputs applied</p>
          {inputs.length > 0 ? (
            <dl className="mt-3 space-y-2">
              {inputs.map((entry, index) => {
                const label = entry.variable_label || entry.property_label || entry.variable || entry.property || 'Input';
                const unit = displayUnit(entry.unit);
                return (
                  <div className="flex items-baseline justify-between gap-3 text-sm" key={`${label}-${index}`}>
                    <dt className="text-stone-600">{label}</dt>
                    <dd className="font-medium text-stone-900" data-testid={`edit-calculation-input-${index}`}>
                      {formatValue(entry.value)} {unit}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : <p className="mt-3 text-sm text-stone-500">Saved inputs are unavailable for this legacy calculation.</p>}
        </div>

        <div className="p-4" data-testid="edit-calculation-formula">
          <p className="text-xs font-semibold uppercase text-stone-500">2. Formula applied</p>
          <p className="mt-3 text-sm font-medium text-stone-900">{calculation.appliedFormulaName || 'Configured calculation formula'}</p>
          {formulaSteps.length > 0 ? (
            <div className="mt-3 space-y-3">
              {formulaSteps.map((step, index) => (
                <div className="text-sm text-stone-700" key={`${step.name || 'formula'}-${index}`}>
                  <p>{step.expression_readable || step.expression || step.name}</p>
                  {step.output !== undefined ? <p className="mt-1 font-semibold text-primary">= {formatValue(step.output)}</p> : null}
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-stone-500">Formula steps will appear after the record is recalculated.</p>}
        </div>

        <div className="p-4" data-testid="edit-calculation-output">
          <p className="text-xs font-semibold uppercase text-stone-500">3. Final output</p>
          <dl className="mt-3 space-y-2">
            {outputs.map((output, index) => (
              <div className="flex items-baseline justify-between gap-3 text-sm" key={`${output.label}-${index}`}>
                <dt className="text-stone-600">{output.label}</dt>
                <dd className="font-semibold text-primary" data-testid={`edit-calculation-output-${index}`}>
                  {formatValue(output.value)} {displayUnit(output.unit)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}