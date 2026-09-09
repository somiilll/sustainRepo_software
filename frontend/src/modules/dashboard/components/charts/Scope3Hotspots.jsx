import React, { useMemo } from 'react';

const PALETTE = ['#F59E0B', '#F43F5E', '#8B5CF6', '#3B82F6', '#0EA5E9', '#10B981'];

export default function Scope3Hotspots({ data = [] }) {
  const chartData = useMemo(() => {
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
    return [...data]
      .filter((item) => Number(item.value || 0) > 0)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .slice(0, 6)
      .map((item, index) => ({
        ...item,
        fill: PALETTE[index % PALETTE.length],
        percentage: total > 0 ? (Number(item.value || 0) / total) * 100 : 0,
      }));
  }, [data]);

  if (!chartData.length) {
    return <div className="flex h-48 items-center justify-center text-sm text-stone-500" data-testid="scope3-hotspots-empty">No Scope 3 emissions reported for this window</div>;
  }

  return (
    <div className="space-y-4" data-testid="scope3-hotspots">
      {chartData.map((category, index) => (
        <div key={category.id} data-testid={`scope3-hotspot-row-${index + 1}`}>
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-5 text-stone-800" data-testid={`scope3-hotspot-name-${index + 1}`}>{category.name}</p>
              <p className="text-[10px] text-stone-500" data-testid={`scope3-hotspot-share-${index + 1}`}>{category.percentage.toFixed(1)}% of reported Scope 3</p>
            </div>
            <p className="shrink-0 text-xs font-semibold tabular-nums text-stone-900" data-testid={`scope3-hotspot-value-${index + 1}`}>{Number(category.value).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${category.percentage}%`, backgroundColor: category.fill }} /></div>
        </div>
      ))}
    </div>
  );
}