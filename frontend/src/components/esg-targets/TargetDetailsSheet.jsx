import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { StaticTargetBody } from './StaticTargetBody';
import { PeriodicTargetBody } from './PeriodicTargetBody';
import { periodText } from './targetUtils';

function Body({ target }) {
  const chart = target.chart;
  if (target.status === 'expired') return <p className="py-4 text-sm text-stone-500">This target has expired, so progress is no longer calculated.</p>;
  if (!target.kpi_id) return <p className="py-4 text-sm text-stone-500">No KPI is linked to this target, so progress cannot be calculated.</p>;
  if (!chart || chart.chart_type === 'none' || chart.chart_type === 'unknown') return <p className="py-4 text-sm text-stone-500" data-testid="target-no-chart">No chart is available for this tracking mode yet.</p>;
  if (chart.chart_type === 'static') return <StaticTargetBody target={target} chart={chart} health={target.health} />;
  return <PeriodicTargetBody target={target} chart={chart} />;
}

export function TargetDetailsSheet({ target, onClose }) {
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-white sm:w-1/2 sm:max-w-none" data-testid="target-details-sheet">
        {target && (
          <>
            <SheetHeader className="pr-8 text-left">
              <SheetTitle className="text-lg" data-testid="target-details-title">{target.kpi_name || target.metric_label || target.metric_key}</SheetTitle>
              <p className="text-sm text-stone-500">{target.scope_type === 'organization' ? 'Organization' : target.facility_names?.join(', ')} · {periodText(target.reporting_period)}</p>
            </SheetHeader>
            <div className="mt-5"><Body target={target} /></div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
