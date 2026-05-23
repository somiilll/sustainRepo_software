/**
 * GaugeCard — speedometer for "Reduction Target Achieved".
 *
 * Pure SVG arc (no chart lib needed). Supports a target-selector when
 * multiple targets exist; empty-state CTA when none configured.
 */
import React, { useState } from 'react';
import { Target as TargetIcon, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../components/ui/button';
import AnimatedNumber from '../shared/AnimatedNumber';

function GaugeArc({ pct = 0, size = 160, stroke = 14 }) {
  const clamp = Math.max(0, Math.min(100, pct));
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;
  // semicircle from 180° to 360° (top-half)
  const startAngle = Math.PI;          // left
  const endAngle = 2 * Math.PI;        // right
  const sweep = endAngle - startAngle; // π
  const valueAngle = startAngle + sweep * (clamp / 100);

  const polarX = (angle) => cx + radius * Math.cos(angle);
  const polarY = (angle) => cy + radius * Math.sin(angle);

  const bgPath = `M ${polarX(startAngle)} ${polarY(startAngle)} A ${radius} ${radius} 0 0 1 ${polarX(endAngle)} ${polarY(endAngle)}`;
  const valuePath = `M ${polarX(startAngle)} ${polarY(startAngle)} A ${radius} ${radius} 0 ${clamp > 50 ? 1 : 0} 1 ${polarX(valueAngle)} ${polarY(valueAngle)}`;

  // color: red → amber → emerald
  const color = clamp < 33 ? '#EF4444' : clamp < 66 ? '#F59E0B' : '#10B981';

  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62 + 10}`} className="overflow-visible">
      <defs>
        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#EF4444" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <filter id="gauge-glow" x="-30%" y="-50%" width="160%" height="200%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <path d={bgPath} fill="none" stroke="#E7E5E4" strokeWidth={stroke} strokeLinecap="round" />
      <path
        d={valuePath}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        opacity="0.95"
        filter="url(#gauge-glow)"
      />
      {/* tick marks */}
      {[0, 25, 50, 75, 100].map((t) => {
        const a = startAngle + sweep * (t / 100);
        const x1 = cx + (radius + 4) * Math.cos(a);
        const y1 = cy + (radius + 4) * Math.sin(a);
        const x2 = cx + (radius + 10) * Math.cos(a);
        const y2 = cy + (radius + 10) * Math.sin(a);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#A8A29E" strokeWidth="1" />;
      })}
    </svg>
  );
}

export default function GaugeCard({
  targets = [],
  baseYearTotal = 0,
  currentTotal = 0,
}) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(targets[0]?.id || '');

  // No targets configured → empty state CTA.
  if (!targets.length) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm p-5 flex flex-col" data-testid="kpi-card-reduction-target-achieved">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 opacity-70" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-2">Reduction Target Achieved</p>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-3">
          <TargetIcon className="w-7 h-7 text-amber-500" />
          <p className="text-xs text-stone-600">No reduction targets configured</p>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            onClick={() => navigate('/base-year-emissions')}
            data-testid="kpi-add-target-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Emission Reduction Targets
          </Button>
        </div>
      </div>
    );
  }

  const target = targets.find((t) => t.id === selectedId) || targets[0];
  // Progress = (reduction so far) / (target reduction).
  // For mode=total absolute: target = baseYearTotal × (percent/100), OR a flat absolute_value.
  const cfg = target.target_configuration || {};
  const canComputeProgress = baseYearTotal > 0;
  let targetReduction = 0;
  const achievedReduction = baseYearTotal - currentTotal;
  if (target.target_mode === 'total' && canComputeProgress) {
    if (cfg.target_type === 'percentage' && cfg.value != null) {
      targetReduction = (baseYearTotal * Number(cfg.value)) / 100;
    } else if (cfg.target_type === 'absolute' && cfg.value != null) {
      targetReduction = Number(cfg.value);
    }
  }
  const pct = targetReduction > 0 ? (achievedReduction / targetReduction) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));

  if (!canComputeProgress) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm p-5 flex flex-col" data-testid="kpi-card-reduction-target-achieved">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 opacity-70" />
        <div className="flex items-start justify-between mb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Reduction Target Achieved</p>
          {targets.length > 1 && (
            <select
              value={target.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="text-[10px] border border-stone-200 rounded-md px-1.5 py-0.5 bg-white max-w-[110px]"
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
            onClick={() => navigate('/base-year-emissions')}
            data-testid="kpi-set-base-year-btn"
          >
            Set Base Year
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col" data-testid="kpi-card-reduction-target-achieved">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 opacity-70" />
      <div className="flex items-start justify-between mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Reduction Target Achieved</p>
        {targets.length > 1 && (
          <select
            value={target.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-[10px] border border-stone-200 rounded-md px-1.5 py-0.5 bg-white max-w-[110px]"
            title="Switch target"
            data-testid="kpi-target-selector"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center justify-center -mt-1">
        <GaugeArc pct={clamped} />
      </div>
      <div className="-mt-6 text-center">
        <div className="text-2xl font-bold text-stone-900 tabular-nums">
          <AnimatedNumber value={clamped} decimals={1} suffix="%" />
        </div>
        <div className="text-[10px] text-stone-500 mt-0.5 truncate" title={target.name}>{target.name}</div>
      </div>
    </div>
  );
}
