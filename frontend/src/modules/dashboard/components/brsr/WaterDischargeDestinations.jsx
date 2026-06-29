/**
 * WaterDischargeDestinations - Horizontal comparison bars for discharge destinations
 */
import React from 'react';

const DEST_CONFIG = {
  sewer: { label: 'Sewer', color: '#8B5CF6' },
  surface: { label: 'Surface Water', color: '#A855F7' },
  thirdparty: { label: 'Third-party Treatment', color: '#C084FC' },
  groundwater: { label: 'Groundwater', color: '#7C3AED' },
};

export default function WaterDischargeDestinations({ data = {} }) {
  const defaultData = {
    sewer: data.sewer ?? 1400,
    surface: data.surface ?? 850,
    thirdparty: data.thirdparty ?? 550,
    groundwater: data.groundwater ?? 300,
  };

  const total = Object.values(defaultData).reduce((a, b) => a + b, 0) || 1;
  const maxVal = Math.max(...Object.values(defaultData), 1);
  
  const items = Object.entries(defaultData)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      key,
      value,
      pct: (value / total) * 100,
      barWidth: (value / maxVal) * 100,
      ...DEST_CONFIG[key],
    }));

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-wide">
        Discharge Destinations
      </div>
      
      {/* Horizontal Bars */}
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.key} className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-stone-700">{item.label}</span>
              <span className="text-stone-500">
                {item.value.toLocaleString()} KL 
                <span className="text-stone-400 ml-1">({item.pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-4 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out relative"
                style={{ 
                  width: `${item.barWidth}%`,
                  backgroundColor: item.color,
                }}
              >
                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-stone-500 text-right pt-1">
        Total Discharge: {total.toLocaleString()} KL
      </div>
    </div>
  );
}
