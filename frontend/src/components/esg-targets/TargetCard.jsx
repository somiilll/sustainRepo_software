import React from 'react';
import { ArrowRight, Building2, Calendar, MoreVertical, History, Edit2, Copy, Archive, Trash2, AlertTriangle, CheckCircle2, Repeat, Flag, CalendarRange } from 'lucide-react';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { HEALTH, STATUS_PILL, periodText } from './targetUtils';
import { TargetCardPanel } from './TargetCardPanel';

const MODE_CHIP = {
  monthly: { label: 'Monthly', icon: Repeat, cls: 'bg-sky-50 text-sky-800' },
  single_year: { label: 'Single year', icon: Flag, cls: 'bg-amber-50 text-amber-800' },
  yearly: { label: 'Year-by-year', icon: CalendarRange, cls: 'bg-indigo-50 text-indigo-800' },
};

const Tag = ({ children, icon: Icon }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700">{Icon && <Icon className="h-3.5 w-3.5" />}{children}</span>
);

export function TargetCard({ target, onOpen, isAdmin, actions }) {
  const h = HEALTH[target.health || 'no_data'];
  const st = STATUS_PILL[target.status] || STATUS_PILL.draft;
  const chip = MODE_CHIP[target.tracking_mode] || { label: String(target.tracking_mode || '').replace(/_/g, ' '), icon: Repeat, cls: 'bg-stone-100 text-stone-700' };
  const ChipIcon = chip.icon;
  const scope = target.scope_type === 'organization' ? 'Organization' : target.facility_names?.join(', ') || `${target.facility_ids?.length || 0} facilities`;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" data-testid={`target-row-${target.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${chip.cls}`} data-testid={`target-mode-${target.id}`}><ChipIcon className="h-3.5 w-3.5" />{chip.label}</span>
        <div className="flex items-center gap-2">
          {target.health && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${h.pill}`} data-testid={`target-health-${target.id}`}>
              {target.health === 'on_track' ? <CheckCircle2 className="h-4 w-4" /> : target.health === 'no_data' ? <i className={`h-2 w-2 rounded-full ${h.dot}`} /> : <AlertTriangle className="h-4 w-4" />}{h.label}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${st.cls}`} data-testid={`target-status-${target.id}`}><i className={`h-2 w-2 rounded-full ${st.dot}`} />{st.label}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" data-testid={`target-menu-${target.id}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
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
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-stone-900" data-testid={`target-title-${target.id}`}>{target.kpi_name || target.metric_label || target.metric_key || target.target_name}</h3>
        <p className="mt-0.5 text-sm text-stone-500" data-testid={`target-name-${target.id}`}>{target.target_name}</p>
      </div>
      <div className="flex flex-wrap gap-2"><Tag icon={Building2}>{scope}</Tag><Tag icon={Calendar}>{periodText(target.reporting_period)}</Tag></div>
      <TargetCardPanel target={target} />
      <div className="mt-auto pt-1">
        <Button variant="outline" className="gap-2 rounded-lg" onClick={() => onOpen(target)} data-testid={`target-view-details-${target.id}`}>View details<ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
