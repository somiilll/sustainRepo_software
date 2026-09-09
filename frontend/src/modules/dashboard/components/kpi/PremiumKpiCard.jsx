/**
 * PremiumKpiCard — Premium KPI card for BRSR Dashboard
 */
import React from 'react';
import { Target, Minus, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { Card } from '../../../../components/ui/card';
import AnimatedNumber from '../../components/shared/AnimatedNumber';
import TrendArrow from '../../components/shared/TrendArrow';

export default function PremiumKpiCard({
  title,
  value,
  unit,
  intensityValue,
  intensityUnit,
  showIntensity = false,
  yoyChange,
  targetValue,
  baseYearReduction,
  secondaryLabel,
  secondaryValue,
  secondaryUnit = '',
  secondaryTestId,
  sparkData = [],
  icon: Icon,
  accentColor = '#10B981',
  loading = false,
  actionSlot,
  invertedTrend = true,
  featured = false,
  testId,
  className = '',
}) {
  const displayValue = showIntensity && intensityValue != null ? intensityValue : value;
  const displayUnit = showIntensity && intensityUnit ? intensityUnit : unit;

  const trend = yoyChange == null ? 'flat' : Math.abs(yoyChange) < 0.5 ? 'flat' : yoyChange > 0 ? 'up' : 'down';
  const isPositiveTrend = invertedTrend ? trend === 'down' : trend === 'up';
  const trendColor = trend === 'flat' ? 'text-stone-500' : isPositiveTrend ? 'text-emerald-600' : 'text-rose-600';
  const TrendIcon = trend === 'flat' ? Minus : trend === 'up' ? ArrowUpRight : ArrowDownRight;
  
  // TrendArrow color: for emissions, up is bad (red), down is good (green)
  const trendArrowColor = invertedTrend
    ? (trend === 'up' ? '#EF4444' : '#10B981')
    : (trend === 'up' ? '#10B981' : '#EF4444');

  return (
    <Card 
      className={`group relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-stone-300 hover:shadow-md sm:p-5 ${featured ? 'border-emerald-700 bg-emerald-50/50' : 'border-stone-200'} ${className}`}
      data-testid={testId || `kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {actionSlot && (
        <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
          {actionSlot}
        </div>
      )}
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: accentColor }} />}
        <p className={`text-xs font-semibold ${featured ? 'text-emerald-800' : 'text-stone-600'}`}>{title}</p>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          {loading ? (
            <div className="h-9 w-28 bg-stone-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className={`font-heading font-bold tracking-normal text-stone-900 tabular-nums ${featured ? 'text-3xl sm:text-4xl' : 'text-3xl'}`}>
                <AnimatedNumber value={displayValue || 0} decimals={displayValue >= 100 ? 0 : 2} />
              </span>
              <span className="text-sm text-stone-500 font-medium">{displayUnit}</span>
            </div>
          )}
          
          {yoyChange != null && trend !== 'flat' && (
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              <span>{Math.abs(yoyChange).toFixed(1)}%</span>
              <span className="text-stone-400 font-normal">vs prev period</span>
            </div>
          )}
        </div>
        
        {/* TrendArrow on the right */}
        {trend !== 'flat' && (
          <TrendArrow trend={trend} color={trendArrowColor} />
        )}
      </div>

      {targetValue != null && (
        <div className="flex items-center gap-2 text-xs mt-3">
          <Target className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-stone-500">Target:</span>
          <span className="font-semibold text-stone-700">{targetValue.toLocaleString()} {unit}</span>
        </div>
      )}

      {baseYearReduction != null && (
        <div className="flex items-center gap-2 text-xs mt-2">
          <Activity className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-stone-500">vs Base Year:</span>
          <span className={`font-semibold ${baseYearReduction <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {baseYearReduction > 0 ? '+' : ''}{baseYearReduction.toFixed(1)}%
          </span>
        </div>
      )}

      {secondaryLabel && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-3 text-xs">
          <span className="text-stone-500">{secondaryLabel}</span>
          <span className="font-semibold text-stone-800 tabular-nums" data-testid={secondaryTestId}>
            {secondaryValue != null ? Number(secondaryValue).toLocaleString() : '—'} {secondaryUnit}
          </span>
        </div>
      )}
    </Card>
  );
}

/**
 * IntensityToggle — Toggle between revenue and production intensity
 */
export function IntensityToggle({ mode, setMode }) {
  return (
    <div className="inline-flex items-center bg-stone-100 rounded-lg p-0.5 text-xs" data-testid="intensity-toggle">
      <button
        onClick={() => setMode('revenue')}
        className={`px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'revenue' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        By Revenue
      </button>
      <button
        onClick={() => setMode('production')}
        className={`px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'production' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        By Production
      </button>
    </div>
  );
}
