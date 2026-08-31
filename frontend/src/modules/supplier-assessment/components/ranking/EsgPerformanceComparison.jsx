import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { hasValue, scoreText } from './rankingUtils';

const DIMENSIONS = [
  { key: 'environment', label: 'Environmental' },
  { key: 'social', label: 'Social' },
  { key: 'governance', label: 'Governance' },
];

export const EsgPerformanceComparison = ({ averages, suppliers }) => <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="esg-performance-comparison-card">
  <CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base text-stone-900">E / S / G performance comparison</CardTitle><p className="mt-1 text-xs text-stone-500">See where the supplier base is strongest and needs attention.</p></CardHeader>
  <CardContent className="p-0"><div className="divide-y divide-stone-100"><div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 bg-stone-50 px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500"><span>Dimension</span><span>Avg. score</span><span>Suppliers assessed</span></div>{DIMENSIONS.map((dimension) => { const average = averages?.[dimension.key]; const assessed = suppliers.filter((supplier) => hasValue(supplier[`${dimension.key}_score`])).length; return <div key={dimension.key} className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-3 px-5 py-3.5 text-center" data-testid={`esg-performance-comparison-${dimension.key}`}><span className="text-sm font-semibold text-stone-800">{dimension.label}</span><span className="text-sm font-semibold text-stone-950" data-testid={`esg-performance-average-${dimension.key}`}>{hasValue(average) ? `${scoreText(average)}%` : '—'}</span><span className="text-sm text-stone-600" data-testid={`esg-performance-assessed-${dimension.key}`}>{assessed}</span></div>; })}</div></CardContent>
</Card>;