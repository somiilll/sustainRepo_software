/**
 * KpiCard — premium card with title, animated value, trend % vs previous period.
 *
 * Variant `gauge` swaps the sparkline for a speedometer (used by Reduction Target).
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import AnimatedNumber from '../shared/AnimatedNumber';
import GlowSparkline from '../shared/GlowSparkline';
import TrendArrow from '../shared/TrendArrow';

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
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{title}</p>
        {rightSlot}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-3xl font-bold text-stone-900 tracking-tight tabular-nums" data-testid={`kpi-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {loading ? (
              <span className="inline-block h-8 w-24 bg-stone-200 rounded animate-pulse" />
            ) : (
              <AnimatedNumber value={value} decimals={decimals} />
            )}
          </div>
          <div className="text-[11px] text-stone-500 mt-0.5">{unit}</div>
        </div>
        {/* {sparkData.length > 1 && (
          <GlowSparkline data={sparkData} stroke={sparkColor} width={90} height={36} trend={trend} showArrow />
        )} */}
        {trend !== 'flat' && (
          <TrendArrow
            trend={trend}
            color={trend === 'up' ? '#EF4444' : '#10B981'}
          />
        )}
      </div>
      {deltaPct != null && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{Math.abs(deltaPct).toFixed(1)}%</span>
          <span className="text-stone-400 font-normal">vs previous period</span>
        </div>
      )}
    </div>
  );
}

export { TrendingUp, TrendingDown };
