/**
 * ResourceTrendChart — Area chart for water/waste trends
 */
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const configs = {
  water: {
    keys: ['withdrawn', 'consumed', 'discharged', 'recycled'],
    colors: ['#0EA5E9', '#06B6D4', '#38BDF8', '#10B981'],
    labels: ['Withdrawn', 'Consumed', 'Discharged', 'Recycled']
  },
  waste: {
    keys: ['generated', 'recovered', 'disposed'],
    colors: ['#F43F5E', '#10B981', '#F59E0B'],
    labels: ['Generated', 'Recovered', 'Disposed']
  }
};

export default function ResourceTrendChart({ data = [], type = 'water', height = 220 }) {
  const config = configs[type] || configs.water;

  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-stone-400">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          {config.keys.map((key, idx) => (
            <linearGradient key={key} id={`grad-${type}-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={config.colors[idx]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={config.colors[idx]} stopOpacity={0} />
            </linearGradient>
          ))}
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
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        {config.keys.map((key, idx) => (
          <Area 
            key={key}
            type="monotone" 
            dataKey={key} 
            name={config.labels[idx]}
            stroke={config.colors[idx]} 
            fill={`url(#grad-${type}-${key})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
