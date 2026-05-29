/**
 * EmissionCategoriesChart — stacked horizontal bars showing category
 * breakdown by scope (visual diversity from the vertical facility bars).
 */
import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const SCOPE_COLORS = {
  scope1: '#10B981',
  scope2: '#3B82F6',
  scope3: '#8B5CF6',
  biogenic: '#F59E0B',
};

export default function EmissionCategoriesChart({ data = [], height = 370 }) {
  const chartData = useMemo(() => {
    // pivot per-category, value goes into the matching scope key
    return (data || []).map((c) => ({
      name: c.name,
      [c.scope?.toLowerCase()]: c.value,
    }));
  }, [data]);

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-stone-400" data-testid="categories-empty">
        No category data
      </div>
    );
  }

  return (
    <div data-testid="emission-categories-chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} layout="vertical" barSize={45} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
          <XAxis type="number" stroke="#A8A29E" fontSize={10} tickLine={false} axisLine={false} padding={{ right: 0 }}/>
          <YAxis
            dataKey="name"
            type="category"
            width={70}
            tickLine={false}
            axisLine={false}
            stroke="#A8A29E"
            fontSize={10}
            tickFormatter={(v) =>
              v.length > 38 ? v.slice(0, 38) + '…' : v
            }
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #E7E5E4', boxShadow: '0 6px 14px rgba(0,0,0,0.08)', fontSize: 12 }}
            formatter={(v) => `${Number(v).toFixed(2)} tCO₂e`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          <Bar dataKey="scope1" stackId="a" name="Scope 1" fill={SCOPE_COLORS.scope1} radius={[0, 4, 4, 0]} />
          <Bar dataKey="scope2" stackId="a" name="Scope 2" fill={SCOPE_COLORS.scope2} radius={[0, 4, 4, 0]} />
          <Bar dataKey="scope3" stackId="a" name="Scope 3" fill={SCOPE_COLORS.scope3} radius={[0, 4, 4, 0]} />
          <Bar dataKey="biogenic" stackId="a" name="Biogenic" fill={SCOPE_COLORS.biogenic} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
