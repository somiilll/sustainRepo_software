import React from 'react';
import { ChevronDown, ChevronUp, ArrowRight, Building2, Calendar, MoreVertical, History, Edit2, Copy, Archive, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { HEALTH, STATUS_PILL, TARGET_TYPE_LABELS, TRACKING_MODE_LABELS, fmt, fmtSigned, periodText } from './targetUtils';
import { StaticTargetBody } from './StaticTargetBody';
import { PeriodicTargetBody, enrichPeriods, periodTotals } from './PeriodicTargetBody';

const Tag = ({ children, icon: Icon, tone = 'bg-stone-100 text-stone-700' }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${tone}`}>{Icon && <Icon className="h-3.5 w-3.5" />}{children}</span>
);

function progressOf(target, chart) {
  if (chart && chart.chart_type !== 'static' && chart.data) {
    const t = periodTotals(enrichPeriods(chart));
    const pct = t.count && t.target ? (t.actual / t.target) * 100 : null;
    const bad = pct != null && (chart.goal_type === 'lower_limit' ? pct < 100 : pct > 100);
    return { label: 'Year to date', value: pct == null ? '—' : `${fmt(pct, 0)}%`, tone: pct == null ? null : bad ? 'text-red-700' : 'text-emerald-700' };
  }
  const p = chart?.progress_percentage ?? target.progress_percentage;
  return { label: 'Progress', value: p == null ? '—' : `${fmtSigned(p, 0)}%`, tone: null };
}

function Body({ target }) {
  const chart = target.chart;
  if (target.status === 'expired') return <p className="py-4 text-sm text-stone-500">This target has expired, so progress is no longer calculated.</p>;
  if (!target.kpi_id) return <p className="py-4 text-sm text-stone-500">No KPI is linked to this target, so progress cannot be calculated.</p>;
  if (!chart || chart.chart_type === 'none' || chart.chart_type === 'unknown') return <p className="py-4 text-sm text-stone-500" data-testid="target-no-chart">No chart is available for this tracking mode yet.</p>;
  if (chart.chart_type === 'static') return <StaticTargetBody target={target} chart={chart} health={target.health} />;
  return <PeriodicTargetBody target={target} chart={chart} />;
}

export function TargetCard({ target, expanded, onToggle, isAdmin, actions }) {
  const h = HEALTH[target.health || 'no_data'];
  const st = STATUS_PILL[target.status] || STATUS_PILL.draft;
  const prog = progressOf(target, target.chart);
  const scope = target.scope_type === 'organization' ? 'Organization' : target.facility_names?.join(', ') || `${target.facility_ids?.length || 0} facilities`;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm" data-testid={`target-row-${target.id}`}>
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <button type="button" onClick={onToggle} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50" aria-label={expanded ? 'Collapse target' : 'Expand target'} data-testid={`target-toggle-${target.id}`}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1 basis-72">
          <h3 className="text-lg font-semibold tracking-tight text-stone-900" data-testid={`target-title-${target.id}`}>{target.kpi_name || target.metric_label || target.metric_key || target.target_name}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-stone-500">{target.category}<ArrowRight className="h-3.5 w-3.5" />{target.subcategory}</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Tag tone="bg-sky-50 text-sky-800">{TARGET_TYPE_LABELS[target.target_type] || target.target_type}</Tag>
            <Tag>{TRACKING_MODE_LABELS[target.tracking_mode] || target.tracking_mode} tracking</Tag>
            <Tag icon={Building2}>{scope}</Tag>
            <Tag icon={Calendar}>{periodText(target.reporting_period)}</Tag>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{prog.label}</div>
            <div className={`text-2xl font-semibold tracking-tight ${prog.tone || h.text}`} data-testid={`target-progress-${target.id}`}>{prog.value}</div>
          </div>
          {target.health && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${h.pill}`} data-testid={`target-health-${target.id}`}>
              {target.health === 'on_track' ? <CheckCircle2 className="h-4 w-4" /> : target.health === 'no_data' ? <i className={`h-2 w-2 rounded-full ${h.dot}`} /> : <AlertTriangle className="h-4 w-4" />}{h.label}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${st.cls}`} data-testid={`target-status-${target.id}`}><i className={`h-2 w-2 rounded-full ${st.dot}`} />{st.label}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" data-testid={`target-menu-${target.id}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => actions.history(target)}><History className="mr-2 h-4 w-4" />View History</DropdownMenuItem>
              {isAdmin && <>
                <DropdownMenuItem onClick={() => actions.edit(target)}><Edit2 className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.duplicate(target)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.archive(target)}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.remove(target)} className="text-red-600 focus:text-red-600"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {expanded && <div className="border-t border-stone-100 p-4 sm:p-5"><Body target={target} /></div>}
    </div>
  );
}
