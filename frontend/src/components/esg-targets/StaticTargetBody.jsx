import React from 'react';
import { HEALTH, fmt, fmtSigned, niceMax, periodText } from './targetUtils';

const Stat = ({ label, value, sub, tone, testId }) => (
  <div className={`rounded-xl border p-4 ${tone}`} data-testid={testId}>
    <div className="text-xs font-medium text-stone-600">{label}</div>
    <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    <div className="mt-1 text-xs text-stone-500">{sub}</div>
  </div>
);

const labelPos = (pct) => (pct < 8 ? { left: `${pct}%` } : pct > 92 ? { right: `${100 - pct}%` } : { left: `${pct}%`, transform: 'translateX(-50%)' });

function Scale({ b, c, t, hasBase, wrong, unit }) {
  const max = niceMax(Math.max(...[b, c, t].filter((v) => v != null), 0) * 1.02);
  const pos = (v) => Math.max(0, Math.min(100, (v / max) * 100));
  const pc = c != null ? pos(c) : null;
  const from = hasBase ? pos(b) : 0;
  const left = pc != null ? Math.min(from, pc) : 0;
  const width = pc != null ? Math.abs(pc - from) : 0;
  const dir = pc != null && pc < from ? 'to left' : 'to right';
  const grad = wrong ? `linear-gradient(${dir}, #e9b9b3, #b4443c)` : `linear-gradient(${dir}, #c4e6d3, #2f7a56)`;
  return (
    <div data-testid="target-scale">
      <div className="text-sm font-semibold text-stone-900">Where you are on the scale</div>
      <div className="relative mt-3 h-24">
        <div className="absolute inset-x-0 top-10 h-3 rounded-full bg-stone-200/70" />
        {pc != null && <div className="absolute top-10 h-3 rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: grad }} />}
        <div className="absolute top-8 h-7 w-[3px] rounded bg-emerald-700" style={{ left: `${pos(t)}%` }} />
        <span className="absolute top-0 text-xs font-semibold text-emerald-700" style={labelPos(pos(t))}>Target {fmt(t, 3)}</span>
        {hasBase && <><div className="absolute top-8 h-7 w-[3px] rounded bg-stone-900" style={{ left: `${pos(b)}%` }} />
          <span className="absolute top-[68px] text-xs font-semibold text-stone-900" style={labelPos(pos(b))}>Baseline {fmt(b, 3)}</span></>}
        {pc != null && <>
          <div className="absolute top-[34px] h-5 w-5 -translate-x-1/2 rounded-full border-[5px] border-blue-800 bg-white shadow" style={{ left: `${pc}%` }} />
          <span className="absolute top-0 text-xs font-semibold text-blue-800" style={labelPos(pc)}>Current {fmt(c, 2)}</span></>}
      </div>
      <div className="flex justify-between text-xs text-stone-500"><span>0</span><span>{fmt(max, 0)} {unit}</span></div>
    </div>
  );
}

export function StaticTargetBody({ target, chart, health }) {
  const h = HEALTH[health || 'no_data'];
  const { baseline_value: bv, current_value: c, target_value: t, unit } = chart;
  const hasBase = target.baseline?.value != null && bv != null;
  const b = hasBase ? bv : null;
  const reduction = hasBase ? t < b : target.goal_type !== 'lower_limit';
  const reached = c != null && (reduction ? c <= t : c >= t);
  const wrong = c != null && hasBase && (reduction ? c > b : c < b);
  const gap = c != null ? Math.abs(c - t) : null;
  const pct = chart.progress_percentage;
  const chg = hasBase && c != null && b ? (Math.abs(c - b) / Math.abs(b)) * 100 : null;
  const verb = reduction ? 'cut' : 'added';

  let banner;
  if (c == null) banner = <span>No activity data for the current period yet. Progress appears once records are entered.</span>;
  else if (!hasBase) banner = null;
  else banner = (
    <span>
      <b>Achievement {fmtSigned(pct)}%.</b> The current value is {fmt(chg, 1)}% {(c > b) ? 'above' : 'below'} the baseline{wrong ? ', so progress shows as negative' : ''}.{' '}
      {reached ? 'The target has been reached.' : `About ${fmt(gap)} ${unit} must be ${verb} to reach the target.`}
    </span>
  );

  return (
    <div className="space-y-5" data-testid="static-target-body">
      {banner && (
        <div className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-2.5 text-sm text-stone-800 ${h.banner}`} data-testid="target-achievement-banner">
          {banner}{unit && <span className="shrink-0 text-stone-500">Unit: {unit}</span>}
        </div>
      )}
      <div className={`grid gap-4 ${hasBase ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {hasBase && <Stat label="Baseline" value={fmt(b, 3)} sub={periodText(chart.baseline_period)} tone="border-stone-200 bg-white" testId="target-baseline-card" />}
        <Stat label="Current" tone="border-sky-200 bg-sky-50/60 text-blue-800" testId="target-current-card"
          value={c != null ? fmt(c, 2) : 'N/A'}
          sub={<>{periodText(chart.current_period)}{hasBase && c != null && <> · <span className={wrong ? 'font-medium text-red-700' : 'font-medium text-emerald-700'}>{c >= b ? '▲' : '▼'} {fmt(Math.abs(c - b), 2)} vs baseline</span></>}</>} />
        <Stat label="Target" tone="border-emerald-200 bg-emerald-50/60 text-emerald-800" testId="target-target-card" value={fmt(t, 3)}
          sub={<>{periodText(chart.target_period)}{c != null && <> · <span className="font-medium text-emerald-700">{reached ? 'Target reached' : `${fmt(gap)} to ${reduction ? 'cut' : 'add'}`}</span></>}</>} />
      </div>
      <Scale b={b} c={c} t={t} hasBase={hasBase} wrong={wrong} unit={unit} />
    </div>
  );
}
