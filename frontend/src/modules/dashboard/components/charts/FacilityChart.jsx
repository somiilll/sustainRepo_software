import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const SCOPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'scope1', label: 'Scope 1' },
  { id: 'scope2', label: 'Scope 2' },
  { id: 'scope3', label: 'Scope 3' },
];

const ALL_BARS = [
  { key: 'total', label: 'Total', color: '#0F766E' },
  { key: 'scope1', label: 'Scope 1', color: '#059669' },
  { key: 'scope2', label: 'Scope 2', color: '#2563EB' },
  { key: 'scope3', label: 'Scope 3', color: '#7C3AED' },
];

const CATEGORY_COLORS = ['#0F766E', '#14B8A6', '#2563EB', '#7C3AED', '#D97706', '#DB2777', '#64748B', '#0891B2', '#65A30D', '#EA580C', '#BE123C', '#4F46E5', '#0D9488', '#9333EA', '#CA8A04'];

const formatEmissions = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function FacilityTooltip({ active, payload, label, activeScope }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const scopeName = activeScope.replace('scope', 'Scope ');
  const total = Number(row[activeScope] || 0);
  if (activeScope !== 'all' && total <= 0) return null;

  return (
    <div className="min-w-[190px] rounded-lg border border-stone-200 bg-white p-3 shadow-lg" data-testid="facility-emissions-tooltip">
      <p className="text-xs font-semibold text-stone-800">{label}</p>
      {activeScope !== 'all' && total > 0 && <p className="mt-1 border-b border-stone-100 pb-2 text-xs font-bold text-emerald-700">Total {scopeName}: {formatEmissions(total)} tCO₂e</p>}
      <div className="mt-2 space-y-1">
        {payload.filter((item) => Number(item.value || 0) > 0).map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4 text-[11px] text-stone-600">
            <span className="truncate">{item.name}</span><span className="shrink-0 font-semibold text-stone-800">{formatEmissions(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FacilityChart({ facilities = [], height = 400, className = '', showScope3 = true }) {
  const [activeScope, setActiveScope] = useState('all');
  const tabs = showScope3 ? SCOPE_TABS : SCOPE_TABS.filter((tab) => tab.id !== 'scope3');
  const isFluid = height === '100%';

  const selectedScopeData = useMemo(() => {
    if (activeScope === 'all') return { rows: facilities.slice(0, 10), categoryKeys: [] };

    const categoryTotals = new Map();
    facilities.forEach((facility) => {
      (facility.scopeCategories?.[activeScope] || []).forEach((category) => {
        categoryTotals.set(category.name, (categoryTotals.get(category.name) || 0) + Number(category.value || 0));
      });
    });
    const rankedCategories = [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name], index) => ({ name, key: `category_${index}`, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }));

    return {
      categoryKeys: rankedCategories,
      rows: facilities.slice(0, 10).map((facility) => {
        const categoryValues = facility.scopeCategories?.[activeScope] || [];
        const valuesByName = new Map(categoryValues.map((category) => [category.name, Number(category.value || 0)]));
        const row = { ...facility };
        rankedCategories.forEach((category) => { row[category.key] = valuesByName.get(category.name) || 0; });
        return row;
      }),
    };
  }, [activeScope, facilities]);

  if (!facilities.length) {
    return <div className="flex h-48 items-center justify-center text-sm text-stone-400" data-testid="facility-empty">No facility data</div>;
  }

  const visibleAllBars = showScope3 ? ALL_BARS : ALL_BARS.filter((bar) => bar.key !== 'scope3');

  return (
    <div className={`flex min-h-0 w-full flex-col ${className}`} data-testid="facility-chart">
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Facility emissions scope filter">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeScope === tab.id} onClick={() => setActiveScope(tab.id)} data-testid={`facility-emissions-filter-${tab.id}`} className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${activeScope === tab.id ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-emerald-300 hover:text-emerald-800'}`}>{tab.label}</button>
        ))}
      </div>
      <div className={isFluid ? 'min-h-[350px] flex-1' : ''}>
        <ResponsiveContainer width="100%" height={isFluid ? '100%' : height}>
          <BarChart data={selectedScopeData.rows} margin={{ top: 10, right: 10, left: 0, bottom: 40 }} barGap={5}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
            <XAxis dataKey="name" stroke="#A8A29E" fontSize={10} tickLine={false} axisLine={false} angle={-30} textAnchor="end" interval={0} />
            <YAxis stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', offset: 15, style: { textAnchor: 'middle', fill: '#78716C', fontSize: 10, fontWeight: 600 } }} />
            <Tooltip content={<FacilityTooltip activeScope={activeScope} />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {activeScope === 'all' ? visibleAllBars.map((bar) => <Bar key={bar.key} dataKey={bar.key} name={bar.label} fill={bar.color} radius={[4, 4, 0, 0]} />) : <>
              {selectedScopeData.categoryKeys.map((category) => <Bar key={category.key} dataKey={category.key} name={category.name} stackId="categories" fill={category.color} radius={[2, 2, 0, 0]} />)}
            </>}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}