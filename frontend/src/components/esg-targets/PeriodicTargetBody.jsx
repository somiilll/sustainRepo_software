import React from 'react';
import { ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot, ResponsiveContainer, LabelList } from 'recharts';
import { fmt, periodText } from './targetUtils';

const GREEN = '#2f7a56';
const RED = '#b4443c';
const INDIGO = '#4f46a5';

export function enrichPeriods(chart) {
  const lower = chart.goal_type === 'lower_limit';
  return (chart.data || []).map((d) => {
    const has = d.actual != null;
    const hasT = d.target != null;
    const within = has && hasT ? (lower ? d.actual >= d.target : d.actual <= d.target) : null;
    return { ...d, label: d.month || d.year_label, within, diff: has && hasT ? d.actual - d.target : null, awaiting: !has && hasT && !d.is_future, upcoming: !has && d.is_future };
  });
}

export function periodTotals(rows) {
  const done = rows.filter((r) => r.actual != null);
  return { actual: done.reduce((s, r) => s + r.actual, 0), target: done.reduce((s, r) => s + (r.target || 0), 0), from: done[0]?.label, to: done[done.length - 1]?.label, count: done.length };
}

const SummaryCard = ({ label, value, sub, tone, valueTone = '', testId }) => (
  <div className={`rounded-xl border p-4 ${tone}`} data-testid={testId}>
    <div className="text-xs font-medium text-stone-600">{label}</div>
    <div className={`mt-1 text-2xl font-semibold tracking-tight ${valueTone}`}>{value}</div>
    <div className="mt-1 text-xs text-stone-500">{sub}</div>
  </div>
);

const svgText = (props, str) => React.createElement('text', props, str);

const BarLabel = ({ x, y, width, value, index, rows, lower, single }) => {
  const d = rows[index];
  if (value == null || !d) return null;
  const over = d.within === false;
  return (
    <g>
      {svgText({ x: x + width / 2, y: y - 8, textAnchor: 'middle', fontSize: 12, fontWeight: 600, fill: over ? RED : GREEN }, fmt(value, 0))}
      {over && svgText({ x: x + width + 10, y: y + 6, fontSize: 12, fontWeight: 500, fill: RED }, `${d.diff > 0 ? '+' : '−'}${fmt(Math.abs(d.diff), 0)} ${single ? `${lower ? 'below' : 'above'} expected` : `${lower ? 'below' : 'over'} target`}`)}
    </g>
  );
};

export function PeriodChart({ rows, lower, monthly, single = false }) {
  const now = rows.find((r) => r.is_current);
  const tick = ({ x, y, payload }) => svgText({ x, y: y + 18, textAnchor: 'middle', fontSize: 12, fontWeight: payload.value === now?.label ? 700 : 400, fill: payload.value === now?.label ? '#1c1917' : '#78716c' }, String(payload.value));
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4" data-testid="period-chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-base font-semibold text-stone-900">{monthly ? 'Monthly' : 'Yearly'} actual vs {single ? 'expected' : 'target'}</div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600">
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-[3px]" style={{ background: GREEN }} />{lower ? 'Met target' : 'Within target'}</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-[3px]" style={{ background: RED }} />{lower ? 'Below target' : 'Over target'}</span>
          {single
            ? <>
              <span className="flex items-center gap-1.5"><i className="w-5 border-t-2 border-dotted" style={{ borderColor: INDIGO }} />Expected (linear path)</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ borderColor: RED }} />Target</span>
            </>
            : <span className="flex items-center gap-1.5"><i className="w-5 border-t-2 border-dashed" style={{ borderColor: RED }} />{monthly ? 'Monthly' : 'Yearly'} target</span>}
        </div>
      </div>
      <div className="mt-4 h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 36, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="#e7e5e4" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716c' }} tickFormatter={(v) => v.toLocaleString('en-US')} width={56} />
            <Bar dataKey="actual" barSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.label} fill={r.within === false ? RED : GREEN} />)}
              <LabelList dataKey="actual" content={(p) => <BarLabel {...p} rows={rows} lower={lower} single={single} />} />
            </Bar>
            <Line type="monotone" dataKey="target" stroke={single ? INDIGO : RED} strokeWidth={2} strokeDasharray={single ? '2 5' : '6 4'} strokeLinecap="round" dot={single ? false : { r: 4, fill: '#fff', stroke: RED, strokeWidth: 2 }} activeDot={false} isAnimationActive={false} connectNulls={false} />
            {single && <Line type="monotone" dataKey="goal" stroke="none" dot={{ r: 5, fill: '#fff', stroke: RED, strokeWidth: 2 }} activeDot={false} isAnimationActive={false} />}
            {now && <ReferenceLine x={now.label} stroke="#6d5bd0" strokeDasharray="4 4" label={{ value: 'Now', position: 'top', fill: '#4f46a5', fontSize: 12, fontWeight: 600 }} />}
            {now?.awaiting && <ReferenceDot x={now.label} y={0} r={8} fill="#fff" stroke="#a8a29e" strokeWidth={2} label={{ value: 'No data', position: 'right', fill: '#57534e', fontSize: 12, fontWeight: 600 }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PeriodCard({ r, lower, unit }) {
  const state = r.actual != null && r.target == null ? 'notarget' : r.within === true ? 'within' : r.within === false ? 'over' : r.awaiting || (r.is_current && r.actual == null) ? 'nodata' : r.upcoming ? 'upcoming' : 'nodata';
  const style = { within: 'border-emerald-200 bg-emerald-50/60', over: 'border-red-200 bg-red-50', nodata: 'border-stone-200 bg-stone-50', notarget: 'border-stone-200 bg-white', upcoming: 'border-stone-200 bg-white opacity-70' }[state];
  const pill = { within: [lower ? 'Met target' : 'Within target', 'text-emerald-800', 'bg-emerald-600'], over: [lower ? 'Below target' : 'Over target', 'text-red-700', 'bg-red-600'], nodata: ['No data', 'text-stone-500', 'bg-stone-400'], notarget: ['No target', 'text-stone-500', 'bg-stone-400'], upcoming: ['Upcoming', 'text-stone-400', 'bg-stone-300'] }[state];
  const note = r.actual != null && r.target != null
    ? `Target ${fmt(r.target, 0)} · ${fmt(Math.abs(r.diff), 0)} ${r.diff <= 0 ? (lower ? 'short' : 'under') : (lower ? 'above' : 'over')}`
    : r.target == null ? 'No target set' : r.awaiting ? (r.is_current ? "Waiting for this month's entry" : 'Waiting for entry') : `Target ${fmt(r.target, 0)}`;
  return (
    <div className={`rounded-xl border p-3 ${style} ${r.is_current ? 'ring-2 ring-indigo-300' : ''}`} data-testid={`period-card-${r.label}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-stone-900">{r.label}</span>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${pill[1]}`}><i className={`h-2 w-2 rounded-full ${pill[2]}`} />{pill[0]}</span>
      </div>
      <div className="mt-1.5 text-xl font-semibold text-stone-900">{r.actual != null ? fmt(r.actual, 2) : '—'}</div>
      <div className="mt-1 text-xs text-stone-500" title={unit}>{note}</div>
    </div>
  );
}

export function PeriodicTargetBody({ target, chart }) {
  const monthly = chart.chart_type === 'monthly';
  const lower = chart.goal_type === 'lower_limit';
  const rows = enrichPeriods(chart);
  if (!rows.some((r) => r.actual != null || r.target != null)) return <div className="py-6 text-center text-sm text-stone-500" data-testid="period-empty">No tracking values or activity data yet.</div>;
  const within = rows.filter((r) => r.within === true);
  const over = rows.filter((r) => r.within === false);
  const awaiting = rows.filter((r) => r.awaiting);
  const tot = periodTotals(rows);
  const names = (xs) => (xs.length ? xs.map((x) => x.label).join(', ') : '—');
  const unitWord = monthly ? 'months' : 'years';
  return (
    <div className="space-y-5" data-testid="periodic-target-body">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label={lower ? 'Met target' : 'Within target'} value={within.length} sub={unitWord} tone="border-emerald-200 bg-emerald-50/60" valueTone="text-emerald-800" testId="period-within" />
        <SummaryCard label={lower ? 'Below target' : 'Over target'} value={over.length} sub={names(over)} tone="border-red-200 bg-red-50/70" valueTone="text-red-700" testId="period-over" />
        <SummaryCard label="Awaiting data" value={awaiting.length} sub={names(awaiting)} tone="border-stone-200 bg-stone-50" valueTone="text-stone-700" testId="period-awaiting" />
        <SummaryCard label={monthly ? 'Year to date' : 'Total to date'} value={tot.count ? fmt(tot.actual, 2) : '—'} tone="border-stone-200 bg-white" testId="period-ytd"
          sub={tot.count ? `against a target of ${fmt(tot.target, 2)} for ${tot.from}${tot.from !== tot.to ? ` to ${tot.to}` : ''}` : 'No data yet'} />
      </div>
      <PeriodChart rows={rows} lower={lower} monthly={monthly} />
      <div>
        <div className="mb-3 text-base font-semibold text-stone-900">{monthly ? 'Month by month' : 'Year by year'} · {periodText(target.reporting_period)}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{rows.map((r) => <PeriodCard key={r.label} r={r} lower={lower} unit={chart.unit} />)}</div>
      </div>
    </div>
  );
}
