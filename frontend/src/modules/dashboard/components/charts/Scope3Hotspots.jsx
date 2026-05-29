import React, { useMemo } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, Tooltip } from 'recharts';

const PALETTE = ['#F59E0B', '#F43F5E', '#8B5CF6', '#3B82F6'];

export default function Scope3Hotspots({ data = [], height = 320 }) {
  const chartData = useMemo(() => {
    const total = data.reduce((s, x) => s + (x.value || 0), 0);
    return data.map((d, i) => ({
      ...d,
      fill: PALETTE[i % PALETTE.length],
      // This is the value we want to display (0-100)
      percentage: total > 0 ? (d.value / total) * 100 : 0,
    }));
  }, [data]);

  const formatLabel = (name, max = 20) =>
    name.length > max ? name.slice(0, max) + '…' : name;

  return (
    <div data-testid="scope3-hotspots">
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart 
          innerRadius="40%" 
          outerRadius="80%" 
          data={chartData} 
          startAngle={90} 
          endAngle={-270}
        >
          {/* CRITICAL: Define the scale as 0 to 100 */}
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          
          <RadialBar 
            dataKey="percentage" 
            clockWise 
            cornerRadius={8} 
            background={{ fill: '#F5F5F4' }} 
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Contribution']}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      
      <div className="flex flex-wrap justify-center gap-4 mt-2">
        {[...chartData].reverse().map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-[11px] text-stone-600">
            <span className="w-2 h-2 rounded-full" style={{ background: c.fill }} />
            <span>{formatLabel(c.name)}</span>
            <span className="text-stone-400 font-medium">{c.percentage.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}