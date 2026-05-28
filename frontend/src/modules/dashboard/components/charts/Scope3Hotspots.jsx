/**
 * Scope3Hotspots — radial bar chart (concentric segments) for top scope-3
 * categories. Small categories grouped into "Others".
 */
import React, { useMemo } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, Tooltip, Legend } from 'recharts';

const PALETTE = ['#F97316', '#EF4444', '#EC4899', '#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4', '#10B981'];

export default function Scope3Hotspots({ data = [], height = 320 }) {
  const chartData = useMemo(() => {
    if (!data.length) return [];
    const total = data.reduce((s, x) => s + (x.value || 0), 0);
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 7);
    const others = sorted.slice(7);
    if (others.length) {
      const othersValue = others.reduce((s, x) => s + (x.value || 0), 0);
      top.push({ id: 'Others', name: 'Others', value: othersValue });
    }
    return top.map((d, i) => ({
      ...d,
      fill: PALETTE[i % PALETTE.length],
      pct: total > 0 ? (d.value / total) * 100 : 0,
    }));
  }, [data]);

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-stone-400" data-testid="hotspots-empty">
        No Scope 3 data
      </div>
    );
  }

  return (
    <div data-testid="scope3-hotspots">
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart innerRadius="22%" outerRadius="92%" data={chartData} startAngle={90} endAngle={-270}>
          <RadialBar minAngle={4} clockWise dataKey="value" cornerRadius={8} background={{ fill: '#F5F5F4' }} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #E7E5E4', boxShadow: '0 6px 14px rgba(0,0,0,0.08)', fontSize: 12 }}
            formatter={(v, _, p) => [`${Number(v).toFixed(2)} tCO₂e (${(p.payload.pct || 0).toFixed(1)}%)`, p.payload.name]}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 mt-2">
        {chartData.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[11px] text-stone-600" data-testid={`hotspot-legend-${c.id}`}>
            <span className="w-2 h-2 rounded-full" style={{ background: c.fill }} />
            <span>{c.name}</span>
            <span className="text-stone-400">· {c.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
