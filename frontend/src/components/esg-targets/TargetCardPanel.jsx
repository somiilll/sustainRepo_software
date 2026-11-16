import React from 'react';
import { enrichPeriods, periodTotals } from './PeriodicTargetBody';
import { BAND, band, deviation, fmt } from './targetUtils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const tone = (b) => (b ? BAND[b].text : 'text-stone-400');

function barGradient(c, t, lower) {
  const b = BAND[band(c, t, lower) || 'on_track'];
  return `linear-gradient(to right, ${b.soft}, ${b.fill})`;
}

function Strip({ rows }) {
  const max = Math.max(...rows.map((r) => r.actual || 0), 1);
  const now = rows.findIndex((r) => r.is_current);
  return (
    <div className="min-w-0 flex-1" data-testid="target-mini-bars">
      <div className="flex h-16 items-end gap-1.5">
        {rows.map((r) => (
          <div key={r.label} title={`${r.label}${r.actual != null ? `: ${fmt(r.actual, 2)}` : ''}`} className="flex-1 rounded-sm"
            style={{ height: r.actual != null ? `${Math.max(8, (r.actual / max) * 100)}%` : '6px', background: r.actual == null || !r.band ? '#e7e5e4' : BAND[r.band].fill }} />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-xs text-stone-500">
        <span className="absolute left-0">{rows[0]?.label}</span>
        {now > 0 && now < rows.length - 1 && <span className="absolute -translate-x-1/2" style={{ left: `${((now + 0.5) / rows.length) * 100}%` }}>{rows[now].label}</span>}
        <span className="absolute right-0">{rows[rows.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function PeriodicPanel({ chart }) {
  const lower = chart.goal_type === 'lower_limit';
  const monthly = chart.chart_type === 'monthly';
  const rows = enrichPeriods(chart);
  const tot = periodTotals(rows);
  const last = monthly ? rows.filter((r) => !r.is_current && !r.is_future && r.actual != null && r.target).pop() : null;
  const label = monthly ? `${last ? MONTHS[last.month_num - 1] : 'Monthly'} progress` : 'Year to date';
  const dev = monthly ? deviation(last?.actual, last?.target, lower) : deviation(tot.count ? tot.actual : null, tot.target, lower);
  const within = rows.filter((r) => r.within === true).length;
  const over = rows.filter((r) => r.within === false);
  const awaiting = rows.filter((r) => r.awaiting).length;
  return (
    <>
      <div className="flex items-end gap-6 rounded-2xl bg-stone-50 p-5" data-testid="target-card-panel">
        <div className="shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
          <div className={`mt-1 text-3xl font-semibold tracking-tight ${tone(dev?.band)}`} data-testid="target-card-main-value">{dev ? `${fmt(dev.pct, 1)}%` : '—'}</div>
          <div className="text-sm text-stone-500">{dev ? dev.word : 'No data yet'}</div>
        </div>
        {rows.length > 0 && <Strip rows={rows} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-stone-600" data-testid="target-card-stats">
        <span><b className="text-emerald-700">{within}</b> {lower ? 'met' : 'within'}</span>
        <span><b className="text-red-700">{over.length}</b> {lower ? 'short' : 'over'}</span>
        <span><b className="text-stone-900">{awaiting}</b> awaiting</span>
      </div>
    </>
  );
}

function SinglePanel({ target, chart }) {
  const lower = chart.goal_type === 'lower_limit';
  const c = chart.current_value;
  const t = chart.target_value;
  const hasBase = target.baseline?.value != null && chart.baseline_value != null;
  const dev = deviation(c, t, lower);
  const gap = c != null && !t ? { diff: Math.abs(c - (t || 0)), word: c > (t || 0) ? 'more than target' : 'less than target', band: band(c, t || 0, lower) } : null;
  const max = Math.max(c || 0, t || 0, 1);
  const pct = chart.progress_percentage;
  return (
    <>
      <div className="rounded-2xl bg-stone-50 p-5" data-testid="target-card-panel">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-3xl font-semibold tracking-tight text-blue-800" data-testid="target-card-main-value">{c != null ? fmt(c, 2) : 'N/A'}</span>
          <span className="text-sm text-stone-500">current, against a target of <b className="text-emerald-700">{fmt(t, 3)}</b></span>
        </div>
        <div className="relative mt-4 h-2 rounded-full bg-stone-200/80" data-testid="target-card-bar">
          {c != null && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (c / max) * 100)}%`, background: barGradient(c, t || 0, lower) }} />}
          <div className="absolute -top-1 h-4 w-[3px] rounded bg-emerald-700" style={{ left: `${Math.min(100, ((t || 0) / max) * 100)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-stone-500"><span>Target {fmt(t, 3)}</span>{c != null && <span>Current {fmt(c, 2)}</span>}</div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" data-testid="target-card-progress">
        {dev ? (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Progress</span>
            <span><b className={`text-2xl font-semibold ${tone(dev.band)}`}>{fmt(dev.pct, 1)}%</b> <span className="text-stone-600">{dev.word}</span></span>
            <span className="text-stone-500">({fmt(Math.abs(c - t), 2)} {chart.unit})</span>
          </>
        ) : gap ? (
          <span data-testid="target-card-gap"><b className={`text-2xl font-semibold ${tone(gap.band)}`}>{fmt(gap.diff, 2)}</b> <span className="text-stone-600">{gap.word}</span></span>
        ) : <span className="text-stone-500">No data for the current period yet</span>}
        {hasBase && pct != null && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">{fmt(pct, 0)}% from baseline</span>}
      </div>
    </>
  );
}

export function TargetCardPanel({ target }) {
  const chart = target.chart;
  if (target.status === 'expired') return <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">This target has expired, so progress is no longer calculated.</p>;
  if (!target.kpi_id) return <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">No KPI is linked to this target, so progress cannot be calculated.</p>;
  if (!chart || ['none', 'unknown'].includes(chart.chart_type)) return <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">No chart is available for this tracking mode yet.</p>;
  return chart.chart_type === 'static' ? <SinglePanel target={target} chart={chart} /> : <PeriodicPanel chart={chart} />;
}
