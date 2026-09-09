/**
 * KpiCard — premium card with title, animated value, trend % vs previous period.
 *
 * Variant `gauge` swaps the sparkline for a speedometer (used by Reduction Target).
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import AnimatedNumber from '../shared/AnimatedNumber';

export default function KpiCard({
  title,
  value,
  unit = 'tCO₂e',
  decimals = 2,
  deltaPct = null,           // % change vs previous period
  invertedColor = false,     // for "Total Sinks" — positive delta is GOOD (green up arrow ok)
  sparkData = [],
  sparkColor = '#10B981',
  rightSlot = null,
  loading = false,
  ariaLabel,
  comparisonLabel,
}) {
  const trend =
    deltaPct == null ? 'flat' :
    Math.abs(deltaPct) < 0.5 ? 'flat' :
    deltaPct > 0 ? 'up' : 'down';

  // For emissions, going UP is bad (red); for sinks/reductions, up is good.
  const isPositiveTrend = invertedColor ? trend === 'up' : trend === 'down';
  const trendColor =
    trend === 'flat' ? 'text-stone-500' :
    isPositiveTrend ? 'text-emerald-600' : 'text-rose-600';

  const TrendIcon = trend === 'flat' ? Minus : (trend === 'up' ? ArrowUpRight : ArrowDownRight);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm transition-[box-shadow,border-color] duration-300 hover:border-stone-300 hover:shadow-md p-3 sm:p-4"
      data-testid={`kpi-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={ariaLabel || title}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{title}</p>
        {rightSlot}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-normal tabular-nums" data-testid={`kpi-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {loading ? (
              <span className="inline-block h-8 w-24 bg-stone-200 rounded animate-pulse" />
            ) : (
              <AnimatedNumber value={value} decimals={decimals} />
            )}
          </div>
          <div className="text-[11px] text-stone-500 mt-0.5">{unit}</div>
        </div>
      </div>
      {deltaPct != null && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendColor}`} data-testid={`kpi-comparison-delta-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{Math.abs(deltaPct).toFixed(1)}%</span>
          <span className="text-stone-400 font-normal">change</span>
        </div>
      )}
      {comparisonLabel && (
        <p className="mt-2 text-[10px] leading-4 text-stone-500" data-testid={`kpi-comparison-window-${title.toLowerCase().replace(/\s+/g, '-')}`}>{comparisonLabel}</p>
      )}
    </div>
  );
}

export { TrendingUp, TrendingDown };
