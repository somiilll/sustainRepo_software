/**
 * FacilityChart — vertical bars per facility w/ a tiny glow sparkline on the
 * card next to each bar (matches the screenshot reference: a green-glow
 * trend arrow icon at the top-right of each row).
 */
import React, { useMemo } from 'react';
import ChartEmptyState from '../shared/ChartEmptyState';

export default function FacilityChart({ facilities = [] }) {
  const data = useMemo(() => {
    const total = facilities.reduce((sum, facility) => sum + Number(facility.total || 0), 0);
    return [...facilities]
      .filter((facility) => Number(facility.total || 0) > 0)
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
      .slice(0, 6)
      .map((facility) => ({ ...facility, share: total > 0 ? (Number(facility.total || 0) / total) * 100 : 0 }));
  }, [facilities]);

  if (!data.length) {
    return (
      <ChartEmptyState testId="facility-empty" title="No facility emissions to rank" description="No facilities have non-zero emissions in the selected reporting window." />
    );
  }

  return (
    <div className="space-y-5" data-testid="facility-chart">
      {data.map((facility, index) => (
        <div key={facility.id || facility.name} data-testid={`facility-ranking-row-${index + 1}`}>
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-stone-400" data-testid={`facility-ranking-rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              <p className="text-xs font-semibold leading-5 text-stone-800" data-testid={`facility-ranking-name-${index + 1}`}>{facility.name || 'Unnamed facility'}</p>
            </div>
            <p className="shrink-0 text-xs font-semibold tabular-nums text-stone-900" data-testid={`facility-ranking-value-${index + 1}`}>{Number(facility.total).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e <span className="text-stone-500" data-testid={`facility-ranking-share-${index + 1}`}>({facility.share.toFixed(1)}%)</span></p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${facility.share}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
