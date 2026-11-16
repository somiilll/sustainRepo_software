import React from 'react';

const CARDS = [
  { key: 'total', label: 'Total targets', dot: 'bg-stone-400', num: 'text-stone-900', box: 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600/30' },
  { key: 'active', label: 'Active', dot: 'bg-emerald-700', num: 'text-emerald-800', box: 'border-stone-200 bg-white' },
  { key: 'on_track', label: 'On track', dot: 'bg-emerald-500', num: 'text-emerald-700', box: 'border-stone-200 bg-white' },
  { key: 'at_risk', label: 'At risk', dot: 'bg-amber-500', num: 'text-amber-700', box: 'border-stone-200 bg-white' },
  { key: 'breached', label: 'Off track', dot: 'bg-red-600', num: 'text-red-700', box: 'border-stone-200 bg-white' },
];

export function summarize(targets) {
  const n = (fn) => targets.filter(fn).length;
  return {
    total: targets.length,
    active: n((t) => t.status === 'active'),
    on_track: n((t) => t.health === 'on_track'),
    at_risk: n((t) => t.health === 'at_risk'),
    breached: n((t) => t.health === 'breached'),
  };
}

export function TargetSummaryCards({ counts }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="target-summary-cards">
      {CARDS.map((c) => (
        <div key={c.key} className={`rounded-xl border p-3.5 shadow-sm ${c.box}`} data-testid={`target-summary-${c.key}`}>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-600"><span className={`h-2 w-2 rounded-full ${c.dot}`} />{c.label}</div>
          <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${c.num}`}>{counts[c.key]}</div>
        </div>
      ))}
    </div>
  );
}
