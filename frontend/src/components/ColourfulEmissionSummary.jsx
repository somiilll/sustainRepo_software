import React from 'react';
import { Calculator } from 'lucide-react';

const UNIT_LESS_COUNT_FIELDS = new Set([
  'qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms',
  'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled',
  'working_days', 'units_produced', 'products_expected_usage', 'no_of_employees',
]);

const formatNumber = (value, decimals) => Number(value || 0).toFixed(decimals);

const CARD_TONES = {
  red: { card: 'bg-white/70 border-red-100', label: 'text-red-600', value: 'text-red-700', unit: 'text-red-500' },
  orange: { card: 'bg-white/70 border-orange-100', label: 'text-orange-600', value: 'text-orange-700', unit: 'text-orange-500' },
  amber: { card: 'bg-white/70 border-amber-100', label: 'text-amber-600', value: 'text-amber-700', unit: 'text-amber-500' },
  primary: { card: 'bg-primary/10 border-primary/30', label: 'text-primary', value: 'text-primary', unit: 'text-primary/70' },
};

export const ColourfulEmissionSummary = ({ calculation, isCalculating, isScope3Like }) => {
  const auditLog = calculation.auditLog || [];

  return (
    <section className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20" data-testid="calculated-emissions-summary">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-text-secondary" data-testid="calculated-emissions-heading">Calculated Emissions</span>
        {isCalculating && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1" data-testid="calculated-emissions-updating">Updating...</span>}
        <span className="text-xs text-stone-400 ml-auto" data-testid="calculated-emissions-rounding-note">(Values rounded to 4 decimal places)</span>
      </div>

      {isScope3Like ? (
        <div className="w-full p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20" data-testid="scope3-co2e-summary">
          <p className="text-xs font-medium text-primary/70 uppercase tracking-wide mb-1">Total CO₂e Emissions</p>
          <p className="text-3xl font-bold text-primary" data-testid="scope3-co2e-value">
            {formatNumber(calculation.co2eEmissions, 4)}
            <span className="text-lg font-normal ml-2 text-primary/80">{calculation.co2eOutputUnit || 'tCO₂e'}</span>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['CO₂ Emissions', calculation.co2Emissions, calculation.co2OutputUnit || 'tCO2', 'red', 'co2'],
            ['CH₄ Emissions', calculation.ch4Emissions, calculation.ch4OutputUnit || 'tCH4', 'orange', 'ch4'],
            ['N₂O Emissions', calculation.n2oEmissions, calculation.n2oOutputUnit || 'tN2O', 'amber', 'n2o'],
            ['CO₂e Total', calculation.co2eEmissions, calculation.co2eOutputUnit || 'tCO2e', 'primary', 'co2e'],
          ].map(([label, value, unit, tone, key]) => {
            const classes = CARD_TONES[tone];
            return (
            <div key={key} className={`p-3 rounded-lg border ${classes.card}`} data-testid={`calculated-emissions-${key}-card`}>
              <p className={`text-xs font-medium mb-1 ${classes.label}`}>{label}</p>
              <p className={`text-lg font-bold ${classes.value}`} data-testid={`calculated-emissions-${key}-value`}>{formatNumber(value, 2)}</p>
              <p className={`text-xs ${classes.unit}`}>{unit}</p>
            </div>
            );
          })}
        </div>
      )}

      {auditLog.length > 0 && (
        <div className="mt-4 pt-4 border-t border-primary/20" data-testid="calculation-details">
          <p className="text-xs font-medium text-text-muted mb-2">Calculation Details</p>
          <div className="bg-white/50 p-3 rounded text-xs space-y-2" data-testid="calculation-audit-entries">
            {auditLog.map((entry, index) => {
              if (entry.step === 'input') {
                const finalConvert = entry.variable === 'qty' || entry.variable === 'qty_energy'
                  ? auditLog.find((candidate) => candidate.step === 'convert' && candidate.output?.unit === 'kg' && candidate.output?.value !== entry.value)
                  : null;
                return <div key={index} className="p-2 bg-stone-50 rounded border border-stone-200" data-testid={`calculation-input-entry-${index}`}><span className="font-medium text-stone-700">Input:</span> <span className="text-blue-700">{entry.variable_label || entry.variable}</span> = {entry.value}{!UNIT_LESS_COUNT_FIELDS.has(entry.variable) && entry.unit ? ` ${entry.unit}` : ''}{finalConvert ? <span className="text-emerald-600 ml-2">→ {formatNumber(finalConvert.output.value, 2)} {finalConvert.output.unit}</span> : null}</div>;
              }
              if (entry.step === 'resolve_property') {
                const sourceName = entry.source_name || entry.source || '';
                return <div key={index} className="p-2 bg-amber-50 rounded border border-amber-200 flex justify-between items-center gap-3" data-testid={`calculation-property-entry-${index}`}><span><span className="text-amber-800 font-medium">{entry.property_label || entry.property}</span> = {typeof entry.value === 'number' ? formatNumber(entry.value, 6) : entry.value}{entry.unit && entry.unit !== '1' ? ` ${entry.unit}` : ''}</span>{sourceName ? <span className="text-amber-600 text-xs">(Source - {sourceName})</span> : null}</div>;
              }
              if (entry.step === 'formula_step') {
                const isOutput = ['co2', 'ch4', 'n2o', 'co2e'].includes(entry.name?.toLowerCase());
                return <div key={index} className={`p-2 rounded border ${isOutput ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`} data-testid={`calculation-formula-entry-${index}`}><span className={`font-medium ${isOutput ? 'text-emerald-700' : 'text-blue-700'}`}>{entry.name?.toUpperCase()}:</span> <span className={isOutput ? 'text-emerald-800' : 'text-blue-800'}>{entry.expression_readable || entry.expression}</span><div className={`font-semibold mt-1 ${isOutput ? 'text-emerald-700' : 'text-blue-700'}`}>= {typeof entry.output === 'number' ? formatNumber(entry.output, 6) : entry.output}</div></div>;
              }
              if (entry.step === 'outputs') {
                return <div key={index} className="p-2 bg-emerald-100 rounded border border-emerald-300" data-testid={`calculation-output-entry-${index}`}><span className="font-bold text-emerald-800">Final Outputs:</span><div className="grid grid-cols-2 gap-2 mt-1">{Object.entries(entry.outputs || {}).map(([key, value]) => <div key={key} className="text-emerald-700"><span className="font-medium">{key.toUpperCase()}:</span> {formatNumber(value?.value, 6)} {value?.unit}</div>)}</div></div>;
              }
              return null;
            })}
          </div>
        </div>
      )}
    </section>
  );
};