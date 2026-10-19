/**
 * WaterSourcesBar - Horizontal stacked bar for water sources/destinations
 */
import React from 'react';

const SOURCE_COLORS = {
  groundwater: '#0EA5E9',
  surface: '#06B6D4',
  thirdparty: '#14B8A6',
  seawater: '#0284C7',
  others: '#6B7280',
};

const DEST_COLORS = {
  sewer: '#8B5CF6',
  surface: '#A855F7',
  thirdparty: '#C084FC',
  groundwater: '#7C3AED',
};

export default function WaterSourcesBar({ 
  sources = {}, 
  destinations = {},
  type = 'sources' // 'sources' | 'destinations'
}) {
  const colors = type === 'sources' ? SOURCE_COLORS : DEST_COLORS;
  
  // Default dummy data
  const defaultSources = {
    groundwater: 4500,
    surface: 2800,
    thirdparty: 1200,
    seawater: 300,
    others: 450,
  };
  
  const defaultDest = {
    sewer: 2100,
    surface: 1500,
    thirdparty: 800,
    groundwater: 350,
  };

  const data = type === 'sources' 
    ? { ...defaultSources, ...sources }
    : { ...defaultDest, ...destinations };

  const labels = type === 'sources' 
    ? {
        groundwater: 'Groundwater',
        surface: 'Surface Water',
        thirdparty: 'Third-party Supply',
        seawater: 'Seawater/Desalinated',
        others: 'Others',
      }
    : {
        sewer: 'Sewer',
        surface: 'Surface Water',
        thirdparty: 'Third-party',
        groundwater: 'Groundwater',
      };

  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const items = Object.entries(data)
    .filter(([_, v]) => v > 0)
    .map(([key, value]) => ({
      key,
      value,
      pct: (value / total) * 100,
      color: colors[key] || '#6B7280',
      label: labels[key] || key,
    }));

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-medium text-stone-600 uppercase tracking-wide">
        {type === 'sources' ? 'Water Sources' : 'Discharge Destinations'}
      </div>
      
      {/* Stacked Bar */}
      <div className="h-6 flex rounded-lg overflow-hidden shadow-inner bg-stone-100">
        {items.map((item) => (
          <div
            key={item.key}
            className="h-full transition-all hover:opacity-90"
            style={{
              width: `${item.pct}%`,
              backgroundColor: item.color,
              minWidth: item.pct > 0 ? '4px' : '0',
            }}
            title={`${item.label}: ${item.value.toLocaleString()} KL (${item.pct.toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-1">
            <div 
              className="w-2 h-2 rounded-sm" 
              style={{ backgroundColor: item.color }} 
            />
            <span className="text-[9px] text-stone-600">
              {item.label}: {item.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
