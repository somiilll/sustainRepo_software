/**
 * ScopeTrendChart — area chart of emissions over time per scope.
 *
 * Smooth gradients, no clutter. Hides Scope 3 series when org doesn't
 * have scope-3 access.
 */
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const SCOPE_COLORS = {
  scope1: '#10B981',
  scope2: '#3B82F6',
  scope3: '#8B5CF6',
  biogenic: '#F59E0B',
};

function GradientDef({ id, color }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={color} stopOpacity={0.4} />
      <stop offset="95%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

export default function ScopeTrendChart({ data = [], hasScope3 = false, height = 280 }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-stone-400" data-testid="scope-trend-empty">
        No emissions trend data
      </div>
    );
  }

  return (
    <div data-testid="scope-trend-chart">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
          <defs>
            <GradientDef id="grad-s1" color={SCOPE_COLORS.scope1} />
            <GradientDef id="grad-s2" color={SCOPE_COLORS.scope2} />
            <GradientDef id="grad-s3" color={SCOPE_COLORS.scope3} />
            <GradientDef id="grad-bio" color={SCOPE_COLORS.biogenic} />
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
          <XAxis dataKey="period" stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #E7E5E4',
              boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
            formatter={(v) => `${Number(v).toFixed(2)} tCO₂e`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          <Area type="monotone" dataKey="scope1" name="Scope 1" stroke={SCOPE_COLORS.scope1} fill="url(#grad-s1)" strokeWidth={2.2} />
          <Area type="monotone" dataKey="scope2" name="Scope 2" stroke={SCOPE_COLORS.scope2} fill="url(#grad-s2)" strokeWidth={2.2} />
          {hasScope3 && (
            <Area type="monotone" dataKey="scope3" name="Scope 3" stroke={SCOPE_COLORS.scope3} fill="url(#grad-s3)" strokeWidth={2.2} />
          )}
          <Area type="monotone" dataKey="biogenic" name="Biogenic" stroke={SCOPE_COLORS.biogenic} fill="url(#grad-bio)" strokeWidth={2.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
