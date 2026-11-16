export const fmt = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }));
export const fmtSigned = (v, d = 1) => (v == null ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: d })}`);
export const periodText = (p) => String(p || '').replace(/(\d)-(\d)/g, '$1–$2');

export const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export const HEALTH = {
  on_track: { label: 'On track', pill: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-600', text: 'text-emerald-700', banner: 'border-emerald-200 bg-emerald-50/70' },
  at_risk: { label: 'At risk', pill: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', text: 'text-amber-700', banner: 'border-amber-200 bg-amber-50/70' },
  breached: { label: 'Off track', pill: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-600', text: 'text-red-700', banner: 'border-red-200 bg-red-50/70' },
  no_data: { label: 'No data', pill: 'border-stone-200 bg-stone-50 text-stone-600', dot: 'bg-stone-400', text: 'text-stone-500', banner: 'border-stone-200 bg-stone-50' },
};

export const STATUS_PILL = {
  draft: { label: 'Draft', cls: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  active: { label: 'Active', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-600' },
  completed: { label: 'Completed', cls: 'border-sky-200 bg-sky-50 text-sky-800', dot: 'bg-sky-600' },
  cancelled: { label: 'Cancelled', cls: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-600' },
  archived: { label: 'Archived', cls: 'border-stone-200 bg-stone-50 text-stone-600', dot: 'bg-stone-400' },
  expired: { label: 'Expired', cls: 'border-stone-200 bg-stone-50 text-stone-600', dot: 'bg-stone-400' },
};

export function deviation(actual, goal, lower) {
  if (actual == null || !goal) return null;
  const dev = ((actual - goal) / goal) * 100;
  const pct = Math.round(Math.abs(dev) * 10) / 10;
  return { pct, word: pct === 0 ? 'on target' : dev < 0 ? 'below target' : 'above target', good: lower ? actual >= goal : actual <= goal };
}
