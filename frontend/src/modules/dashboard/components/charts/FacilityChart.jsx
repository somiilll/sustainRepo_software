/**
 * FacilityChart — vertical bars per facility w/ a tiny glow sparkline on the
 * card next to each bar (matches the screenshot reference: a green-glow
 * trend arrow icon at the top-right of each row).
 */
import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

const BAR_GRADIENT_FROM = '#34D399';
const BAR_GRADIENT_TO = '#10B981';

export default function FacilityChart({ facilities = [], height = 320 }) {
  const data = useMemo(() => facilities.slice(0, 10), [facilities]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-stone-400" data-testid="facility-empty">
        No facility data
      </div>
    );
  }

  return (
    <div data-testid="facility-chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
          <defs>
            <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BAR_GRADIENT_FROM} stopOpacity={0.95} />
              <stop offset="100%" stopColor={BAR_GRADIENT_TO} stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
          <XAxis dataKey="name" stroke="#A8A29E" fontSize={10} tickLine={false} axisLine={false} angle={-30} textAnchor="end" interval={0} />
          <YAxis stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #E7E5E4', boxShadow: '0 6px 14px rgba(0,0,0,0.08)', fontSize: 12 }}
            formatter={(v) => [`${Number(v).toFixed(2)} tCO₂e`, 'Total']}
          />
          <Bar dataKey="total" radius={[6, 6, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={entry.id || idx} fill="url(#bar-grad)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
