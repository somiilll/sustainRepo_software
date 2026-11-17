import React from 'react';
import { enrichPeriods, periodTotals } from './PeriodicTargetBody';
import { BAND, band, deviation, fmt, periodText } from './targetUtils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const tone = (b) => (b ? BAND[b].text : 'text-stone-400');

const YELLOW = '#e3b73a';
const mix = (a, b, k) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((x, i) => Math.round(x + (pb[i] - x) * k).toString(16).padStart(2, '0')).join('')}`;
};
const colorAt = (ratio, stops) => {
  if (ratio <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    const [r1, c1] = stops[i - 1];
    const [r2, c2] = stops[i];
    if (ratio <= r2) return mix(c1, c2, (ratio - r1) / (r2 - r1));
  }
  return stops[stops.length - 1][1];
};

// Over a limit: green up to the target, then yellow, then red the further past it
function overGradient(c, t) {
  const at = (t / c) * 100;
  const step = (k) => Math.min(100, at + (100 - at) * k);
  return `linear-gradient(to right, ${BAND.on_track.fill} 0%, ${BAND.on_track.fill} ${at}%, ${YELLOW} ${step(0.25)}%, ${BAND.breached.fill} ${step(0.6)}%, ${BAND.breached.fill} 100%)`;
}

// Colour follows the position relative to the target: red fades to yellow then green as it nears a minimum target; green warms to orange as it nears a limit.
function barGradient(c, t, lower) {
  const G = BAND.on_track.fill;
  if (!(c > 0) || !(t > 0)) return G;
  const stops = lower
    ? [[0, BAND.breached.fill], [0.6, BAND.breached.fill], [0.9, YELLOW], [1, G]]
    : [[0, G], [0.8, G], [0.9, YELLOW], [1, BAND.at_risk.fill]];
  const pts = stops.filter(([r]) => r * t <= c).map(([r, col]) => `${col} ${(r * t / c) * 100}%`);
  pts.push(`${colorAt(c / t, stops)} 100%`);
  return `linear-gradient(to right, ${pts.join(', ')})`;
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

const labelAt = (pct) => (pct < 12 ? { left: `max(${pct}%, 14px)` } : pct > 88 ? { left: `${pct}%`, transform: 'translateX(-100%)' } : { left: `${pct}%`, transform: 'translateX(-50%)' });

function SinglePanel({ target, chart }) {
  const lower = chart.goal_type === 'lower_limit';
  const c = chart.current_value;
  const t = chart.target_value;
  const hasBase = target.baseline?.value != null && chart.baseline_value != null;
  const dev = deviation(c, t, lower);
  const gap = c != null && !t ? { diff: Math.abs(c - (t || 0)), word: c > (t || 0) ? 'more than target' : 'less than target', band: band(c, t || 0, lower) } : null;
  const bv = hasBase ? chart.baseline_value : null;
  const max = Math.max(c || 0, t || 0, bv || 0, 1);
  const bp = bv != null ? Math.min(100, (bv / max) * 100) : null;
  const bad = c != null && band(c, t || 0, lower) === 'breached';
  const over = bad && !lower && c > (t || 0);
  const tp = Math.min(100, ((t || 0) / max) * 100);
  const cp = Math.min(100, ((c || 0) / max) * 100);
  const pct = chart.progress_percentage;
  return (
    <>
      <div className="rounded-2xl bg-stone-50 p-5" data-testid="target-card-panel">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-3xl font-semibold tracking-tight text-blue-800" data-testid="target-card-main-value">{c != null ? fmt(c, 2) : 'N/A'}</span>
          <span className="text-sm text-stone-500">current, against a target of <b className={bad ? 'text-stone-900' : 'text-emerald-700'}>{fmt(t, 3)}</b></span>
        </div>
        <div className="relative mt-3 h-4 text-xs font-medium text-blue-800" data-testid="target-card-current-label">
          {c != null && <span className="absolute whitespace-nowrap" style={labelAt(cp)}>Current {fmt(c, 2)}</span>}
        </div>
        <div className="relative mt-1 h-2 rounded-full bg-stone-200/80" data-testid="target-card-bar">
          {c != null && over && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${cp}%`, background: overGradient(c, t || 0) }} data-testid="target-card-bar-over" />}
          {c != null && !over && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${cp}%`, background: barGradient(c, t || 0, lower) }} />}
          <div className={`absolute -top-1 h-4 w-[3px] rounded ${bad ? 'bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]' : 'bg-emerald-700'}`} data-testid="target-card-tick" style={{ left: `${Math.min(100, ((t || 0) / max) * 100)}%` }} />
          {bp != null && <div className="absolute -top-1 h-4 w-[3px] rounded bg-stone-800" style={{ left: `${bp}%` }} data-testid="target-card-baseline-tick" />}
          {c != null && <div className="absolute -top-1 h-4 w-[3px] rounded bg-blue-800" style={{ left: `${cp}%` }} data-testid="target-card-current-tick" />}
        </div>
        <div className={`relative mt-2 text-xs text-stone-500 ${bp != null && Math.abs(bp - tp) < 24 ? 'h-9' : 'h-4'}`} data-testid="target-card-axis">
          {t > 0 && tp > 12 && (bp == null || bp > 12) && <span className="absolute left-0">0</span>}
          {bp != null && <span className="absolute whitespace-nowrap font-medium text-stone-800" style={{ ...labelAt(bp), top: Math.abs(bp - tp) < 24 ? 18 : 0 }} data-testid="target-card-baseline-label">Baseline {fmt(bv, 3)}</span>}
          <span className="absolute whitespace-nowrap" style={!t ? { left: 0 } : labelAt(tp)} data-testid="target-card-target-label">Target {fmt(t, 3)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" data-testid="target-card-progress">
        {dev ? (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Progress</span>
            {dev.pct === 0
              ? <b className="text-2xl font-semibold text-emerald-700" data-testid="target-achieved">Target Achieved</b>
              : <>
                <span><b className={`text-2xl font-semibold ${tone(dev.band)}`}>{fmt(dev.pct, 1)}%</b> <span className="text-stone-600">{dev.word}</span></span>
                <span className="text-stone-500">({fmt(Math.abs(c - t), 2)} {chart.unit})</span>
              </>}
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
