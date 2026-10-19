/**
 * WasteTreemap - Premium treemap for waste type breakdown
 * Categories: Plastic, E-waste, Bio-medical, Construction, Battery, Radioactive, Hazardous, Non-hazardous
 */
import React from 'react';

const WASTE_COLORS = {
  plastic: '#3B82F6',
  ewaste: '#8B5CF6', 
  biomedical: '#EF4444',
  construction: '#F59E0B',
  battery: '#10B981',
  radioactive: '#EC4899',
  hazardous: '#F97316',
  nonhazardous: '#6B7280',
};

export default function WasteTreemap({ data = {} }) {
  // Default structure with dummy data
  const wasteData = {
    plastic: data.plastic ?? 850,
    ewaste: data.ewaste ?? 420,
    biomedical: data.biomedical ?? 180,
    construction: data.construction ?? 1200,
    battery: data.battery ?? 95,
    radioactive: data.radioactive ?? 0,
    hazardous: data.hazardous ?? 340,
    nonhazardous: data.nonhazardous ?? 2100,
  };

  const total = Object.values(wasteData).reduce((a, b) => a + b, 0) || 1;
  
  // Sort by value descending for treemap layout
  const sortedItems = Object.entries(wasteData)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({
      key,
      value,
      pct: (value / total) * 100,
      color: WASTE_COLORS[key] || '#6B7280',
      label: {
        plastic: 'Plastic',
        ewaste: 'E-waste',
        biomedical: 'Bio-medical',
        construction: 'Construction',
        battery: 'Battery',
        radioactive: 'Radioactive',
        hazardous: 'Hazardous',
        nonhazardous: 'Non-hazardous',
      }[key] || key,
    }));

  // Simple treemap layout - split into rows
  const renderTreemap = () => {
    if (sortedItems.length === 0) return null;

    // Calculate flex basis based on percentage
    return (
      <div className="flex flex-wrap gap-1 h-40">
        {sortedItems.map((item, idx) => {
          const width = Math.max(item.pct, 15); // Min 15% width for visibility
          const isLarge = item.pct > 20;
          
          return (
            <div
              key={item.key}
              className="rounded-lg p-2 flex flex-col justify-between transition-all hover:scale-[1.02] hover:shadow-lg cursor-default"
              style={{
                backgroundColor: item.color,
                flexBasis: `${width}%`,
                flexGrow: 1,
                minWidth: isLarge ? '30%' : '20%',
                maxWidth: idx === 0 ? '50%' : '40%',
              }}
            >
              <div className="text-white/90 text-[10px] font-medium truncate">
                {item.label}
              </div>
              <div>
                <div className="text-white text-sm font-bold">
                  {item.value.toLocaleString()}
                </div>
                <div className="text-white/70 text-[9px]">
                  {item.pct.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {renderTreemap()}
      <div className="text-[10px] text-stone-500 text-center">
        Total: {total.toLocaleString()} MT
      </div>
    </div>
  );
}
