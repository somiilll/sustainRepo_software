import React from 'react';
import { CalendarClock, Mail, Send, ShieldCheck } from 'lucide-react';

const metrics = [
  { key: 'active_schedules', label: 'Active schedules', detail: 'Reports currently scheduled', icon: CalendarClock, tone: 'text-emerald-800 bg-emerald-50' },
  { key: 'reports_delivered', label: 'Reports delivered', detail: 'This month', icon: Send, tone: 'text-blue-800 bg-blue-50' },
  { key: 'recipients', label: 'Recipients', detail: 'Across all configurations', icon: Mail, tone: 'text-amber-800 bg-amber-50' },
  { key: 'success_rate', label: 'Success rate', detail: 'Delivery success', icon: ShieldCheck, tone: 'text-violet-800 bg-violet-50' },
];

export default function MISOverview({ overview }) {
  return <section data-testid="mis-overview"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="mis-overview-metrics">{metrics.map(({ key, label, detail, icon: Icon, tone }) => <article key={key} className="border border-emerald-950/10 bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5" data-testid={`mis-overview-card-${key}`}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{label}</p><p className="mt-4 font-mono text-3xl font-semibold text-stone-950" data-testid={`mis-overview-value-${key}`}>{key === 'success_rate' ? `${overview?.[key] || 0}%` : overview?.[key] || 0}</p></div><span className={`flex h-9 w-9 items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span></div><p className="mt-4 text-sm text-stone-500">{detail}</p></article>)}</div></section>;
}