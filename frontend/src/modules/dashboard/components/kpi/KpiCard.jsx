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
  featured = false,
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
      className={`relative overflow-hidden rounded-lg border bg-white p-4 shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-stone-300 hover:shadow-md sm:p-5 ${featured ? 'border-emerald-700 bg-emerald-50/50' : 'border-stone-200'}`}
      data-testid={`kpi-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={ariaLabel || title}
    >
      <div className="mb-3 flex items-start justify-between">
        <p className={`text-xs font-semibold ${featured ? 'text-emerald-800' : 'text-stone-600'}`}>{title}</p>
        {rightSlot}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className={`flex items-baseline gap-1 font-heading font-bold tracking-normal text-stone-900 tabular-nums ${featured ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'}`} data-testid={`kpi-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {loading ? (
              <span className="inline-block h-8 w-24 bg-stone-200 rounded animate-pulse" />
            ) : (
              <AnimatedNumber value={value} decimals={decimals} />
            )}
            <span className="text-xs font-medium text-stone-500 sm:text-sm" data-testid={`kpi-unit-${title.toLowerCase().replace(/\s+/g, '-')}`}>{unit}</span>
          </div>
        </div>
      </div>
      {(deltaPct != null || comparisonLabel) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid={`kpi-comparison-row-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {deltaPct != null && <span className={`flex items-center gap-1 font-medium ${trendColor}`} data-testid={`kpi-comparison-delta-${title.toLowerCase().replace(/\s+/g, '-')}`}><TrendIcon className="h-3.5 w-3.5" /><span>{Math.abs(deltaPct).toFixed(1)}% change</span></span>}
          {comparisonLabel && <span className="text-xs leading-4 text-stone-500" data-testid={`kpi-comparison-window-${title.toLowerCase().replace(/\s+/g, '-')}`}>{comparisonLabel}</span>}
        </div>
      )}
    </div>
  );
}

export { TrendingUp, TrendingDown };
