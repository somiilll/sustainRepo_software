import React, { useMemo } from 'react';
import ChartEmptyState from '../shared/ChartEmptyState';

const PALETTE = ['#F59E0B', '#F43F5E', '#8B5CF6', '#3B82F6', '#0EA5E9', '#10B981'];

export default function Scope3Hotspots({ data = [] }) {
  const chartData = useMemo(() => {
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
    return [...data]
      .filter((item) => Number(item.value || 0) > 0)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .slice(0, 5)
      .map((item, index) => ({
        ...item,
        fill: PALETTE[index % PALETTE.length],
        percentage: total > 0 ? (Number(item.value || 0) / total) * 100 : 0,
      }));
  }, [data]);

  if (!chartData.length) {
    return <ChartEmptyState testId="scope3-hotspots-empty" title="No Scope 3 hotspots to rank" description="No non-zero Scope 3 category emissions are reported for this window." />;
  }

  return (
    <div className="space-y-6" data-testid="scope3-hotspots">
      {chartData.map((category, index) => (
        <div key={category.id} data-testid={`scope3-hotspot-row-${index + 1}`}>
          <div className="mb-1 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-stone-400" data-testid={`scope3-hotspot-rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              <p className="text-xs font-semibold leading-5 text-stone-800" data-testid={`scope3-hotspot-name-${index + 1}`}>{category.name}</p>
            </div>
            <p className="shrink-0 text-xs font-semibold tabular-nums text-stone-900" data-testid={`scope3-hotspot-value-${index + 1}`}>{Number(category.value).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e <span className="text-stone-500" data-testid={`scope3-hotspot-share-${index + 1}`}>({category.percentage.toFixed(1)}%)</span></p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${category.percentage}%`, backgroundColor: category.fill }} /></div>
        </div>
      ))}
    </div>
  );
}