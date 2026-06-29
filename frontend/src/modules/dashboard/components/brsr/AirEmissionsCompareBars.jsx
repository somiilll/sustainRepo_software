/**
 * AirEmissionsCompareBars - Horizontal comparative bars for air emissions
 * Regulatory/compliance-oriented visualization
 * Tracks: NOx, SOx, PM, VOC, HAP, Other
 */
import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

const EMISSIONS_CONFIG = {
  NOx: { 
    label: 'NOx (Nitrogen Oxides)', 
    color: '#EF4444',
    limit: 100, // Example regulatory limit
  },
  SOx: { 
    label: 'SOx (Sulfur Oxides)', 
    color: '#F97316',
    limit: 80,
  },
  PM: { 
    label: 'PM (Particulate Matter)', 
    color: '#EAB308',
    limit: 50,
  },
  VOC: { 
    label: 'VOC (Volatile Organic)', 
    color: '#22C55E',
    limit: 60,
  },
  HAP: { 
    label: 'HAP (Hazardous Air)', 
    color: '#3B82F6',
    limit: 30,
  },
  Other: { 
    label: 'Other Pollutants', 
    color: '#8B5CF6',
    limit: 40,
  },
};

export default function AirEmissionsCompareBars({ 
  data = {},
  showLimits = true,
}) {
  const defaultData = {
    NOx: data.NOx ?? 45,
    SOx: data.SOx ?? 32,
    PM: data.PM ?? 28,
    VOC: data.VOC ?? 18,
    HAP: data.HAP ?? 12,
    Other: data.Other ?? 8,
  };

  const total = Object.values(defaultData).reduce((a, b) => a + b, 0);
  const maxVal = Math.max(...Object.values(defaultData), 1);

  const items = Object.entries(EMISSIONS_CONFIG).map(([key, config]) => {
    const value = defaultData[key] || 0;
    const pctOfMax = (value / maxVal) * 100;
    const isOverLimit = showLimits && value > config.limit;
    const pctOfLimit = showLimits ? (value / config.limit) * 100 : 0;
    
    return {
      key,
      value,
      pctOfMax,
      pctOfLimit,
      isOverLimit,
      ...config,
    };
  }).filter(item => item.value > 0 || true); // Show all categories

  return (
    <div className="space-y-4">
      {/* Header with total */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-stone-500 font-medium uppercase tracking-wide">Total Air Emissions</div>
          <div className="text-2xl font-bold text-stone-800">{total.toLocaleString()} <span className="text-sm font-medium text-stone-500">tonnes</span></div>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-3 h-3" /> Within limit
          </span>
          <span className="flex items-center gap-1 text-rose-600">
            <AlertTriangle className="w-3 h-3" /> Exceeds limit
          </span>
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.key} className="space-y-1.5">
            {/* Label Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-sm" 
                  style={{ backgroundColor: item.color }} 
                />
                <span className="text-[11px] font-medium text-stone-700">{item.label}</span>
                {item.isOverLimit && (
                  <AlertTriangle className="w-3 h-3 text-rose-500" />
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-stone-800">{item.value.toLocaleString()}</span>
                <span className="text-[10px] text-stone-500 ml-1">tonnes</span>
                {showLimits && (
                  <span className={`text-[9px] ml-2 ${item.isOverLimit ? 'text-rose-500' : 'text-stone-400'}`}>
                    (limit: {item.limit})
                  </span>
                )}
              </div>
            </div>
            
            {/* Bar */}
            <div className="relative h-5 bg-stone-100 rounded-lg overflow-hidden">
              {/* Limit marker */}
              {showLimits && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-stone-400 z-10"
                  style={{ left: `${Math.min((item.limit / maxVal) * 100, 100)}%` }}
                />
              )}
              
              {/* Value bar */}
              <div
                className="h-full rounded-lg transition-all duration-500 ease-out relative"
                style={{ 
                  width: `${item.pctOfMax}%`,
                  backgroundColor: item.color,
                  minWidth: item.value > 0 ? '8px' : '0',
                }}
              >
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0" />
                
                {/* Value inside bar if wide enough */}
                {item.pctOfMax > 25 && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-white text-[10px] font-bold">
                    {item.value}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Compliance Summary */}
      <div className="flex items-center justify-between pt-2 border-t border-stone-100">
        <div className="text-[10px] text-stone-500">
          Pollutants within limits: <span className="font-semibold text-emerald-600">{items.filter(i => !i.isOverLimit).length}/{items.length}</span>
        </div>
        <div className="text-[10px] text-stone-500">
          Compliance Status: 
          <span className={`font-semibold ml-1 ${items.some(i => i.isOverLimit) ? 'text-rose-600' : 'text-emerald-600'}`}>
            {items.some(i => i.isOverLimit) ? 'Action Required' : 'Compliant'}
          </span>
        </div>
      </div>
    </div>
  );
}
