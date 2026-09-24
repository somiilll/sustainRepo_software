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
  icon: Icon,
  rightSlot = null,
  loading = false,
  ariaLabel,
  comparisonLabel,
  emptyLabel = 'Not available',
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
      className="relative overflow-hidden rounded-2xl border border-stone-200/70 bg-white/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 p-4 group"
      data-testid={`kpi-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={ariaLabel || title}
    >
      {/* gradient stripe */}
      <div
        className="absolute inset-x-0 top-0 h-[3px] opacity-80"
        style={{ background: `linear-gradient(90deg, ${sparkColor}40 0%, ${sparkColor} 50%, ${sparkColor}40 100%)` }}
      />
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${sparkColor}15` }}><Icon className="h-4 w-4" style={{ color: sparkColor }} aria-hidden="true" /></div>}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{title}</p>
        </div>
        {rightSlot}
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className="min-w-0">
          <div className="text-3xl font-bold text-stone-900 tracking-tight tabular-nums" data-testid={`kpi-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {loading ? (
              <span className="inline-block h-8 w-24 bg-stone-200 rounded animate-pulse" />
            ) : value == null || !Number.isFinite(Number(value)) ? (
              <span className="text-base font-medium text-stone-400">{emptyLabel}</span>
            ) : (
              <AnimatedNumber value={value} decimals={decimals} />
            )}
          </div>
        </div>
        {!loading && value != null && Number.isFinite(Number(value)) && <span className="text-[11px] font-medium text-stone-500">{unit}</span>}
      </div>
      {deltaPct != null && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendColor}`} data-testid={`kpi-comparison-delta-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{Math.abs(deltaPct).toFixed(1)}%</span>
          <span className="font-normal text-stone-400">{comparisonLabel ? `vs ${comparisonLabel.replace(/^Compared with\s*/i, '')}` : 'vs previous period'}</span>
        </div>
      )}
    </div>
  );
}

export { TrendingUp, TrendingDown };
