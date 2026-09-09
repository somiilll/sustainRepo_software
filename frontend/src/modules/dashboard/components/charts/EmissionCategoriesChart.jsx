/**
 * EmissionCategoriesChart — stacked horizontal bars showing category
 * breakdown by scope (visual diversity from the vertical facility bars).
 */
import React, { useMemo } from 'react';
import ChartEmptyState from '../shared/ChartEmptyState';

const SCOPE_COLORS = {
  scope1: '#10B981',
  scope2: '#3B82F6',
  scope3: '#8B5CF6',
  biogenic: '#F59E0B',
};

export default function EmissionCategoriesChart({ data = [] }) {
  const chartData = useMemo(() => {
    const total = data.reduce((sum, category) => sum + Number(category.value || 0), 0);
    return [...data]
      .filter((category) => Number(category.value || 0) > 0)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .slice(0, 6)
      .map((category) => ({ ...category, share: total > 0 ? (Number(category.value || 0) / total) * 100 : 0 }));
  }, [data]);

  if (!chartData.length) {
    return (
      <ChartEmptyState testId="categories-empty" title="No emission categories to rank" description="No non-zero category values are available in the selected reporting window." />
    );
  }

  return (
    <div className="space-y-4" data-testid="emission-categories-chart">
      {chartData.map((category, index) => (
        <div key={`${category.scope}-${category.name}`} data-testid={`category-ranking-row-${index + 1}`}>
          <div className="mb-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-5 text-stone-800" data-testid={`category-ranking-name-${index + 1}`}>{category.name}</p>
            </div>
            <p className="shrink-0 text-xs font-semibold tabular-nums text-stone-900" data-testid={`category-ranking-value-${index + 1}`}>{Number(category.value).toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e <span className="text-stone-500" data-testid={`category-ranking-share-${index + 1}`}>({category.share.toFixed(1)}%)</span></p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${category.share}%`, backgroundColor: SCOPE_COLORS[category.scope] || '#78716C' }} /></div>
        </div>
      ))}
    </div>
  );
}
