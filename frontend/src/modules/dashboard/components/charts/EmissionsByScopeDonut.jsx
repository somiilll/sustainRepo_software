/**
 * EmissionsByScopeDonut — thick donut + center metric + legend cards below.
 */
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLOR_MAP = {
  scope1: '#10B981',
  scope2: '#3B82F6',
  scope3: '#8B5CF6',
  biogenic: '#F59E0B',
};

export default function EmissionsByScopeDonut({ data = [], height = 200 }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const total = useMemo(() => data.reduce((s, x) => s + (x.value || 0), 0), [data]);
  const active = hoverIdx != null ? data[hoverIdx] : null;

  if (!total) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-stone-400" data-testid="donut-empty">
        No emissions data
      </div>
    );
  }

  return (
    <div data-testid="emissions-by-scope-donut">
      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={64}
              outerRadius={88}
              paddingAngle={3}
              stroke="none"
              onMouseEnter={(_, idx) => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {data.map((entry) => (
                <Cell key={entry.id} fill={COLOR_MAP[entry.id] || '#A8A29E'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: '1px solid #E7E5E4',
                boxShadow: '0 6px 14px rgba(0,0,0,0.08)',
                fontSize: 12,
              }}
              formatter={(v, _, p) => [`${Number(v).toFixed(2)} tCO₂e (${(p.payload.pct || 0).toFixed(1)}%)`, p.payload.name]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center metric */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-stone-400">{active ? active.name : 'Total'}</div>
            <div className="text-xl font-bold text-stone-900 tabular-nums">
              {(active ? active.value : total).toFixed(2)}
            </div>
            <div className="text-[10px] text-stone-400">tCO₂e</div>
          </div>
        </div>
      </div>

      {/* Legend cards */}
      <div className="grid grid-cols-2 gap-1.5 mt-3">
        {data.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 border border-stone-100 bg-white/60"
            data-testid={`legend-${d.id}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_MAP[d.id] || '#A8A29E' }} />
              <span className="text-[11px] font-medium text-stone-700 whitespace-nowrap">{d.name}</span>
            </div>
            <span className="text-[11px] font-semibold text-stone-900 tabular-nums">{(d.pct || 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
