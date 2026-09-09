/**
 * FacilityChart — vertical bars per facility w/ a tiny glow sparkline on the
 * card next to each bar (matches the screenshot reference: a green-glow
 * trend arrow icon at the top-right of each row).
 */
import React, { useMemo } from 'react';

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
      <div className="flex items-center justify-center h-48 text-sm text-stone-400" data-testid="facility-empty">
        No facility data
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="facility-chart">
      {data.map((facility, index) => (
        <div key={facility.id || facility.name} data-testid={`facility-ranking-row-${index + 1}`}>
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-5 text-stone-800" data-testid={`facility-ranking-name-${index + 1}`}>{facility.name || 'Unnamed facility'}</p>
              <p className="text-[10px] text-stone-500" data-testid={`facility-ranking-share-${index + 1}`}>{facility.share.toFixed(1)}% of selected emissions</p>
            </div>
            <p className="shrink-0 text-xs font-semibold tabular-nums text-stone-900" data-testid={`facility-ranking-value-${index + 1}`}>{Number(facility.total).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${facility.share}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
