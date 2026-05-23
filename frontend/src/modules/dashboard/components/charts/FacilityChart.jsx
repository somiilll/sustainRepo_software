/**
 * FacilityChart — vertical bars per facility w/ a tiny glow sparkline on the
 * card next to each bar (matches the screenshot reference: a green-glow
 * trend arrow icon at the top-right of each row).
 */
import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import GlowSparkline from '../shared/GlowSparkline';
import { buildFacilitySparkline } from '../../services/dataTransformers';

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

      {/* Glow trend mini-cards below */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
        {data.slice(0, 5).map((f) => {
          const spark = buildFacilitySparkline(f);
          return (
            <div
              key={f.id}
              className="rounded-xl border border-stone-100 bg-white/70 p-2.5 flex items-center gap-2"
              data-testid={`facility-mini-${f.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-stone-500 truncate" title={f.name}>{f.name}</div>
                <div className="text-sm font-semibold text-stone-900 tabular-nums">{f.total.toFixed(1)}</div>
              </div>
              {/* glowy sparkline like the screenshot reference */}
              <div className="rounded-lg bg-emerald-50/80 p-1.5">
                <GlowSparkline data={spark} width={42} height={20} stroke="#10B981" trend="up" showArrow />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
