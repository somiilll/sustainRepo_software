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

const scopeLabel = (scope) => scope.replace('scope', 'Scope ');

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
        const row = { ...facility, scopeTotal: Number(facility[activeScope] || 0) };
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
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E7E5E4', boxShadow: '0 6px 14px rgba(0,0,0,0.08)', fontSize: 12 }} formatter={(value, name) => [`${Number(value).toFixed(2)} tCO₂e`, name]} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {activeScope === 'all' ? visibleAllBars.map((bar) => <Bar key={bar.key} dataKey={bar.key} name={bar.label} fill={bar.color} radius={[4, 4, 0, 0]} />) : <>
              <Bar dataKey="scopeTotal" name={`Total ${scopeLabel(activeScope)}`} fill={ALL_BARS.find((bar) => bar.key === activeScope)?.color} radius={[4, 4, 0, 0]} />
              {selectedScopeData.categoryKeys.map((category) => <Bar key={category.key} dataKey={category.key} name={category.name} stackId="categories" fill={category.color} radius={[2, 2, 0, 0]} />)}
            </>}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}