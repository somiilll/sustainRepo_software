/**
 * WaterSourcesTreemap - Premium treemap for water sources
 */
import React from 'react';

const SOURCE_CONFIG = {
  groundwater: { label: 'Groundwater', color: '#0EA5E9' },
  surface: { label: 'Surface Water', color: '#06B6D4' },
  municipal: { label: 'Municipal Supply', color: '#0891B2' },
  rainwater: { label: 'Rainwater', color: '#14B8A6' },
  recycled: { label: 'Recycled Water', color: '#10B981' },
};

export default function WaterSourcesTreemap({ data = {} }) {
  const defaultData = {
    groundwater: data.groundwater ?? 3200,
    surface: data.surface ?? 2100,
    municipal: data.municipal ?? 1800,
    rainwater: data.rainwater ?? 650,
    recycled: data.recycled ?? 750,
  };

  const total = Object.values(defaultData).reduce((a, b) => a + b, 0) || 1;
  
  const items = Object.entries(defaultData)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      key,
      value,
      pct: (value / total) * 100,
      ...SOURCE_CONFIG[key],
    }));

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-wide">
        Water Sources
      </div>
      
      {/* Treemap Grid */}
      <div className="grid grid-cols-3 gap-1.5 h-32">
        {items.slice(0, 2).map((item) => (
          <div
            key={item.key}
            className="col-span-1 row-span-2 rounded-lg p-2.5 flex flex-col justify-between transition-transform hover:scale-[1.02] cursor-default"
            style={{ backgroundColor: item.color }}
          >
            <div className="text-white/90 text-[10px] font-medium">{item.label}</div>
            <div>
              <div className="text-white text-lg font-bold">{item.value.toLocaleString()}</div>
              <div className="text-white/70 text-[9px]">{item.pct.toFixed(1)}%</div>
            </div>
          </div>
        ))}
        
        <div className="col-span-1 grid grid-rows-2 gap-1.5">
          {items.slice(2, 4).map((item) => (
            <div
              key={item.key}
              className="rounded-lg p-2 flex flex-col justify-between transition-transform hover:scale-[1.02] cursor-default"
              style={{ backgroundColor: item.color }}
            >
              <div className="text-white/90 text-[9px] font-medium truncate">{item.label}</div>
              <div className="text-white text-sm font-bold">{item.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Additional sources as pills */}
      {items.length > 4 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.slice(4).map((item) => (
            <div
              key={item.key}
              className="px-2 py-1 rounded-md text-white text-[9px] font-medium"
              style={{ backgroundColor: item.color }}
            >
              {item.label}: {item.value.toLocaleString()} KL
            </div>
          ))}
        </div>
      )}

      <div className="text-[9px] text-stone-500 text-right">
        Total: {total.toLocaleString()} KL
      </div>
    </div>
  );
}
