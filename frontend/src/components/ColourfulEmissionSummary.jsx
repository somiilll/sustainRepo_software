import React from 'react';
import {
  ArrowUpFromLine,
  Calculator,
  CheckCircle2,
  Cloud,
  Dna,
  Flame,
  FlaskConical,
  Info,
  Leaf,
  RefreshCcw,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

const UNIT_LESS_COUNT_FIELDS = new Set([
  'qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms',
  'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled',
  'working_days', 'units_produced', 'products_expected_usage', 'no_of_employees',
]);

const formatNumber = (value, decimals) => Number(value || 0).toFixed(decimals);

const emissionCards = (calculation) => [
  { key: 'co2', label: 'CO₂ Emissions', value: calculation.co2Emissions, unit: calculation.co2OutputUnit || 'tCO₂', Icon: Cloud, classes: 'border-red-100 bg-red-50/70 text-red-800', icon: 'text-red-500', muted: 'text-red-600' },
  { key: 'ch4', label: 'CH₄ Emissions', value: calculation.ch4Emissions, unit: calculation.ch4OutputUnit || 'tCH₄', Icon: Dna, classes: 'border-orange-100 bg-orange-50/70 text-orange-800', icon: 'text-orange-500', muted: 'text-orange-600' },
  { key: 'n2o', label: 'N₂O Emissions', value: calculation.n2oEmissions, unit: calculation.n2oOutputUnit || 'tN₂O', Icon: RefreshCcw, classes: 'border-yellow-200 bg-yellow-50/80 text-yellow-800', icon: 'text-yellow-600', muted: 'text-yellow-700' },
  { key: 'co2e', label: 'CO₂e Total', value: calculation.co2eEmissions, unit: calculation.co2eOutputUnit || 'tCO₂e', Icon: Leaf, classes: 'border-emerald-200 bg-emerald-50/80 text-emerald-900', icon: 'text-emerald-600', muted: 'text-emerald-700' },
];

const propertyPresentation = (entry) => {
  const label = (entry.property_label || entry.property || '').toLowerCase();
  if (label.includes('density')) return { Icon: FlaskConical, iconClass: 'text-orange-500' };
  if (label.includes('calorific') || label.includes('heat') || label.includes('ncv')) return { Icon: Flame, iconClass: 'text-yellow-600' };
  return { Icon: Calculator, iconClass: 'text-purple-500' };
};

const SourceBadge = ({ source }) => source ? (
  <span className="ml-auto shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700" data-testid="calculation-source-badge">
    Source · {source}
  </span>
) : null;

export const ColourfulEmissionSummary = ({ calculation, isCalculating, isScope3Like }) => {
  const auditLog = calculation.auditLog || [];

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="calculated-emissions-summary">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Leaf className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        <span className="text-sm font-semibold text-stone-800" data-testid="calculated-emissions-heading">Calculated Emissions</span>
        {isCalculating && <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700" data-testid="calculated-emissions-updating">Updating…</span>}
        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-500" data-testid="calculated-emissions-rounding-note">
          Values rounded to 4 decimal places <Info className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
        </span>
      </div>

      {isScope3Like ? (
        <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-emerald-900 transition-transform duration-200 hover:-translate-y-px hover:shadow-sm" data-testid="scope3-co2e-summary">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white"><Leaf className="h-5 w-5 text-emerald-600" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700">Total CO₂e Emissions</p>
            <p className="mt-1 text-3xl font-bold" data-testid="scope3-co2e-value">{formatNumber(calculation.co2eEmissions, 4)} <span className="text-base font-medium text-emerald-700">{calculation.co2eOutputUnit || 'tCO₂e'}</span></p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {emissionCards(calculation).map(({ key, label, value, unit, Icon, classes, icon, muted }) => (
            <div key={key} className={`flex min-h-24 items-center gap-3 rounded-lg border p-3 transition-transform duration-200 hover:-translate-y-px hover:shadow-sm ${classes}`} data-testid={`calculated-emissions-${key}-card`}>
              <Icon className={`h-5 w-5 shrink-0 ${icon}`} aria-hidden="true" />
              <div>
                <p className={`text-xs font-medium ${muted}`}>{label}</p>
                <p className="mt-1 text-lg font-bold" data-testid={`calculated-emissions-${key}-value`}>{formatNumber(value, 2)}</p>
                <p className={`text-xs ${muted}`}>{unit}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {auditLog.length > 0 && (
        <Accordion type="single" collapsible className="mt-5 border-t border-stone-100" data-testid="calculation-details">
          <AccordionItem value="calculation-details" className="border-0">
            <AccordionTrigger className="py-4 no-underline hover:no-underline" data-testid="calculation-details-toggle">
              <span className="flex items-center gap-2 text-sm font-semibold text-stone-800"><Calculator className="h-4 w-4 text-purple-500" aria-hidden="true" />Calculation Details</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-lg border border-stone-200 bg-white px-4" data-testid="calculation-audit-entries">
                {auditLog.map((entry, index) => {
                  if (entry.step === 'input') {
                    const finalConvert = entry.variable === 'qty' || entry.variable === 'qty_energy'
                      ? auditLog.find((candidate) => candidate.step === 'convert' && candidate.output?.unit === 'kg' && candidate.output?.value !== entry.value)
                      : null;
                    return <div key={index} className="flex items-start gap-3 border-b border-stone-100 py-3 last:border-0" data-testid={`calculation-input-entry-${index}`}><ArrowUpFromLine className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" /><p className="text-sm text-stone-700"><span className="font-medium">Input:</span> <span className="text-blue-700">{entry.variable_label || entry.variable}</span> = {entry.value}{!UNIT_LESS_COUNT_FIELDS.has(entry.variable) && entry.unit ? ` ${entry.unit}` : ''}{finalConvert ? <span className="ml-2 text-emerald-700">→ {formatNumber(finalConvert.output.value, 2)} {finalConvert.output.unit}</span> : null}</p></div>;
                  }
                  if (entry.step === 'resolve_property') {
                    const { Icon, iconClass } = propertyPresentation(entry);
                    const sourceName = entry.source_name || entry.source || '';
                    return <div key={index} className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-0" data-testid={`calculation-property-entry-${index}`}><Icon className={`h-4 w-4 shrink-0 ${iconClass}`} aria-hidden="true" /><p className="text-sm text-stone-700"><span className="font-medium">{entry.property_label || entry.property}</span> = {typeof entry.value === 'number' ? formatNumber(entry.value, 6) : entry.value}{entry.unit && entry.unit !== '1' ? ` ${entry.unit}` : ''}</p><SourceBadge source={sourceName} /></div>;
                  }
                  if (entry.step === 'formula_step') {
                    const isOutput = ['co2', 'ch4', 'n2o', 'co2e'].includes(entry.name?.toLowerCase());
                    return <div key={index} className={isOutput ? 'my-2 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-800' : 'flex items-start gap-3 border-b border-stone-100 py-3 last:border-0'} data-testid={`calculation-formula-entry-${index}`}><CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${isOutput ? 'text-emerald-600' : 'text-purple-500'}`} aria-hidden="true" /><div className="min-w-0 text-sm"><span className="font-semibold">{entry.name?.toUpperCase()}:</span> <span>{entry.expression_readable || entry.expression}</span><div className="mt-1 font-semibold">= {typeof entry.output === 'number' ? formatNumber(entry.output, 6) : entry.output}</div></div></div>;
                  }
                  if (entry.step === 'outputs') {
                    return <div key={index} className="my-2 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-800" data-testid={`calculation-output-entry-${index}`}><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /><div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="font-semibold">Final Outputs</span>{Object.entries(entry.outputs || {}).map(([key, value]) => <span key={key}><span className="font-medium">{key.toUpperCase()}:</span> {formatNumber(value?.value, 6)} {value?.unit}</span>)}</div></div>;
                  }
                  return null;
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </section>
  );
};