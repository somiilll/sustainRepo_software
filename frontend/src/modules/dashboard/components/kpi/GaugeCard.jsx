/**
 * GaugeCard — speedometer for "Reduction Target Achieved".
 *
 * Pure SVG arc (no chart lib needed). Supports a target-selector when
 * multiple targets exist; empty-state CTA when none configured.
 */
import React, {useState} from 'react';
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
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${clamp}%`,
            background: `linear-gradient(90deg, ${color}cc 0%, ${color} 100%)`,
            boxShadow: `0 0 6px ${color}55`,
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
  baseYearTotal = 0,
  currentTotal = 0,
  targetReduction = 0,
  reductionAchievedPct = 0,
}) {
  const navigate = useNavigate();
  // No targets configured → empty state CTA.
  if (!targets.length) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm p-4 flex flex-col" data-testid="kpi-card-reduction-target-achieved">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 opacity-70" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-2">Reduction Target Achieved</p>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-3">
          <TargetIcon className="w-7 h-7 text-amber-500" />
          <p className="text-xs text-stone-600">No reduction targets configured</p>
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

  const canComputeProgress = baseYearTotal > 0;
  const clamped = Math.min(
    100,
    Math.max(0, reductionAchievedPct || 0)
  );

  if (!canComputeProgress) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm p-4 flex flex-col" data-testid="kpi-card-reduction-target-achieved">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 opacity-70" />
        <div className="flex items-start justify-between mb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Reduction Target Achieved</p>
          {targets.length > 1 && (
            <select
              value={selectedTarget?.id}
              onChange={(e) => setSelectedTargetId(e.target.value)}
              className="text-[10px] border border-stone-200 rounded-md pr-1.5 pl-1 py-0.5 bg-white max-w-[110px]"
              data-testid="kpi-target-selector"
            >
              {targets.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-2">
          <TargetIcon className="w-7 h-7 text-amber-500" />
          <p className="text-xs text-stone-600 leading-snug">Configure a <span className="font-semibold">Base Year</span> to compute target progress.</p>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => navigate('/targets/voluntary/environment')}
            data-testid="kpi-set-base-year-btn"
          >
            Set Base Year
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 p-4 flex flex-col" data-testid="kpi-card-reduction-target-achieved">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 opacity-70" />
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Reduction Target Achieved</p>
        {targets.length > 1 && (
          <select
            value={selectedTarget?.id}
            onChange={(e) => setSelectedTargetId(e.target.value)}
            className="text-[10px] border border-stone-200 rounded-md pr-1.5 pl-0 py-0.5 bg-white max-w-[110px]"
            title="Switch target"
            data-testid="kpi-target-selector"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="text-3xl font-bold text-stone-900 tracking-tight tabular-nums">
        <AnimatedNumber value={clamped} decimals={1} suffix="%" />
      </div>
      {/* <div className="text-[11px] text-stone-500 mt-0.5 truncate" title={selectedTarget?.name}>{selectedTarget?.name}</div> */}
      <div className="mt-3">
        <GaugeArc pct={clamped} />
      </div>
    </div>
  );
}
