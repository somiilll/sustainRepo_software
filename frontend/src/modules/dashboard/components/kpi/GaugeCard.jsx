/**
 * GaugeCard — speedometer for "Reduction Target Achieved".
 *
 * Pure SVG arc (no chart lib needed). Supports a target-selector when
 * multiple targets exist; empty-state CTA when none configured.
 */
import React from 'react';
import { Target as TargetIcon, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../components/ui/button';
import AnimatedNumber from '../shared/AnimatedNumber';

function GaugeArc({ pct = 0 }) {
  const clamp = Math.max(0, Math.min(100, pct));
  // color: red → amber → emerald
  const color = clamp < 33 ? '#EF4444' : clamp < 66 ? '#F59E0B' : '#10B981';
  return (
    <div className="w-full" data-testid="reduction-target-bar">
      <div className="relative h-2.5 rounded-full bg-stone-200 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${clamp}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-stone-400 mt-1 tabular-nums">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}


export default function GaugeCard({
  targets = [],
  selectedTarget,
  selectedTargetId,
  setSelectedTargetId,
  progressPercentage,
  applicabilityLabel,
  reportingPeriodLabel,
}) {
  const navigate = useNavigate();
  const targetLabel = (target) => target?.name || target?.kpi_name || target?.subcategory || 'Untitled target';
  // No targets configured → empty state CTA.
  if (!targets.length) {
    return (
      <div className="relative flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5" data-testid="kpi-card-reduction-target-achieved">
        <p className="mb-3 text-xs font-semibold text-stone-600">Target progress</p>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-3">
          <TargetIcon className="w-7 h-7 text-amber-500" />
          <p className="text-xs text-stone-600">No active organization-wide or facility-level targets</p>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            onClick={() => navigate('/targets/voluntary/environment')}
            data-testid="kpi-add-target-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Emission Reduction Targets
          </Button>
        </div>
      </div>
    );
  }

  const canComputeProgress = Number.isFinite(Number(progressPercentage));
  const clamped = Math.min(
    100,
    Math.max(0, Number(progressPercentage))
  );

  if (!canComputeProgress) {
    return (
      <div className="relative flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5" data-testid="kpi-card-reduction-target-achieved">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-semibold text-stone-600">Target progress</p>
          {applicabilityLabel && <span className="max-w-24 truncate rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500" title={applicabilityLabel} data-testid="kpi-target-applicability">{applicabilityLabel}</span>}
          {targets.length > 1 && (
            <select
              value={selectedTarget?.id}
              onChange={(e) => setSelectedTargetId(e.target.value)}
              className="ml-auto max-w-[110px] rounded-md border border-stone-200 bg-white py-0.5 pl-1 pr-1.5 text-[10px]"
              data-testid="kpi-target-selector"
            >
              {targets.map((t) => (<option key={t.id} value={t.id}>{targetLabel(t)}</option>))}
            </select>
          )}
        </div>
        {reportingPeriodLabel && <p className="text-[10px] text-stone-400" data-testid="kpi-target-reporting-period">Target period: {reportingPeriodLabel}</p>}
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-2">
          <TargetIcon className="w-7 h-7 text-amber-500" />
          <p className="text-xs text-stone-600 leading-snug">Target progress is not available for this reporting period.</p>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => navigate('/targets/voluntary/environment')}
            data-testid="kpi-set-base-year-btn"
          >
            View Target
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-stone-300 hover:shadow-md sm:p-5" data-testid="kpi-card-reduction-target-achieved">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-semibold text-stone-600">Target progress</p>
        {applicabilityLabel && <span className="max-w-24 truncate rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500" title={applicabilityLabel} data-testid="kpi-target-applicability">{applicabilityLabel}</span>}
        {targets.length > 1 && (
          <select
            value={selectedTarget?.id}
            onChange={(e) => setSelectedTargetId(e.target.value)}
            className="ml-auto max-w-[110px] rounded-md border border-stone-200 bg-white py-0.5 pl-0 pr-1.5 text-[10px]"
            title="Switch target"
            data-testid="kpi-target-selector"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{targetLabel(t)}</option>
            ))}
          </select>
        )}
      </div>
      <div className="font-heading text-3xl font-bold tracking-normal text-stone-900 tabular-nums">
        <AnimatedNumber value={clamped} decimals={1} suffix="%" />
      </div>
      {reportingPeriodLabel && <p className="text-[10px] text-stone-400" data-testid="kpi-target-reporting-period">Target period: {reportingPeriodLabel}</p>}
      <div className="mt-3">
        <GaugeArc pct={clamped} />
      </div>
    </div>
  );
}
