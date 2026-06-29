/**
 * EnergyTreemap - Premium treemap for energy by subcategory
 * Categories: Electricity, Fuel, Renewable, Other
 * Shows renewable share prominently
 */
import React from 'react';
import { Zap, Flame, Leaf, MoreHorizontal } from 'lucide-react';

const ENERGY_CONFIG = {
  electricity: { 
    label: 'Electricity', 
    color: '#3B82F6',
    gradient: 'from-blue-500 to-blue-600',
    icon: Zap 
  },
  fuel: { 
    label: 'Fuel', 
    color: '#F59E0B',
    gradient: 'from-amber-500 to-orange-500',
    icon: Flame 
  },
  renewable: { 
    label: 'Renewable', 
    color: '#10B981',
    gradient: 'from-emerald-500 to-teal-500',
    icon: Leaf 
  },
  other: { 
    label: 'Other Sources', 
    color: '#8B5CF6',
    gradient: 'from-violet-500 to-purple-500',
    icon: MoreHorizontal 
  },
};

export default function EnergyTreemap({ 
  data = {},
  renewablePct = 0,
  totalEnergy = 0,
}) {
  const defaultData = {
    electricity: data.electricity ?? 1250,
    fuel: data.fuel ?? 2800,
    renewable: data.renewable ?? 450,
    other: data.other ?? 380,
  };

  const total = Object.values(defaultData).reduce((a, b) => a + b, 0) || 1;
  const actualRenewablePct = renewablePct || ((defaultData.renewable / total) * 100);
  
  const items = Object.entries(defaultData)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      key,
      value,
      pct: (value / total) * 100,
      ...ENERGY_CONFIG[key],
    }));

  // Find largest two items for main display
  const [largest, secondLargest, ...rest] = items;

  return (
    <div className="space-y-3">
      {/* Renewable Share Highlight */}
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Leaf className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-[10px] text-emerald-700 font-medium uppercase tracking-wide">Renewable Share</div>
            <div className="text-lg font-bold text-emerald-800">{actualRenewablePct.toFixed(1)}%</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-stone-500">Total Energy</div>
          <div className="text-sm font-semibold text-stone-700">{(totalEnergy || total).toLocaleString()} MWh</div>
        </div>
      </div>

      {/* Treemap */}
      <div className="grid grid-cols-3 gap-2 h-44">
        {/* Largest item - spans 2 rows */}
        {largest && (
          <div
            className={`col-span-2 row-span-2 rounded-xl p-4 flex flex-col justify-between bg-gradient-to-br ${largest.gradient} shadow-lg transition-transform hover:scale-[1.01] cursor-default relative overflow-hidden`}
          >
            {/* Shine effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
            
            <div className="relative z-10 flex items-center gap-2">
              <largest.icon className="w-5 h-5 text-white/80" />
              <span className="text-white/90 text-sm font-medium">{largest.label}</span>
            </div>
            <div className="relative z-10">
              <div className="text-white text-3xl font-bold">{largest.value.toLocaleString()}</div>
              <div className="text-white/70 text-xs">MWh · {largest.pct.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {/* Second largest and rest */}
        <div className="col-span-1 row-span-2 flex flex-col gap-2">
          {secondLargest && (
            <div
              className={`flex-1 rounded-xl p-3 flex flex-col justify-between bg-gradient-to-br ${secondLargest.gradient} shadow-md transition-transform hover:scale-[1.02] cursor-default relative overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
              <div className="relative z-10 flex items-center gap-1.5">
                <secondLargest.icon className="w-4 h-4 text-white/80" />
                <span className="text-white/90 text-[11px] font-medium">{secondLargest.label}</span>
              </div>
              <div className="relative z-10">
                <div className="text-white text-xl font-bold">{secondLargest.value.toLocaleString()}</div>
                <div className="text-white/70 text-[10px]">{secondLargest.pct.toFixed(1)}%</div>
              </div>
            </div>
          )}

          {/* Remaining items */}
          {rest.length > 0 && (
            <div className="flex gap-2 flex-1">
              {rest.map((item) => (
                <div
                  key={item.key}
                  className={`flex-1 rounded-xl p-2 flex flex-col justify-between bg-gradient-to-br ${item.gradient} shadow-md transition-transform hover:scale-[1.02] cursor-default relative overflow-hidden`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                  <item.icon className="w-3.5 h-3.5 text-white/80 relative z-10" />
                  <div className="relative z-10">
                    <div className="text-white text-sm font-bold">{item.value.toLocaleString()}</div>
                    <div className="text-white/70 text-[9px]">{item.pct.toFixed(0)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center pt-1">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <div 
              className="w-2.5 h-2.5 rounded-sm" 
              style={{ backgroundColor: item.color }} 
            />
            <span className="text-[10px] text-stone-600 font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
