/**
 * WaterFlowSankey - Premium water flow visualization
 * Flow: Withdrawal → Consumption → Discharge → Recycled
 */
import React from 'react';

export default function WaterFlowSankey({ 
  withdrawal = 0, 
  consumption = 0, 
  discharge = 0, 
  recycled = 0 
}) {
  const total = withdrawal || 1;
  const consumptionPct = (consumption / total) * 100;
  const dischargePct = (discharge / total) * 100;
  const recycledPct = (recycled / total) * 100;

  return (
    <div className="relative h-48">
      {/* SVG Sankey Flow */}
      <svg viewBox="0 0 400 160" className="w-full h-full">
        <defs>
          <linearGradient id="waterGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="consumeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="dischargeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="recycleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Flow Paths */}
        {/* Withdrawal to Consumption */}
        <path
          d={`M 20,80 C 80,80 80,${40 + (100 - consumptionPct) * 0.4} 140,${40 + (100 - consumptionPct) * 0.4}`}
          fill="none"
          stroke="url(#waterGradient)"
          strokeWidth={Math.max(8, consumptionPct * 0.5)}
          strokeLinecap="round"
          opacity="0.8"
        />
        
        {/* Consumption to Discharge */}
        <path
          d={`M 140,${40 + (100 - consumptionPct) * 0.4} C 200,${40 + (100 - consumptionPct) * 0.4} 200,${50 + (100 - dischargePct) * 0.4} 260,${50 + (100 - dischargePct) * 0.4}`}
          fill="none"
          stroke="url(#consumeGradient)"
          strokeWidth={Math.max(6, dischargePct * 0.4)}
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Discharge to Recycled */}
        <path
          d={`M 260,${50 + (100 - dischargePct) * 0.4} C 320,${50 + (100 - dischargePct) * 0.4} 320,${60 + (100 - recycledPct) * 0.4} 380,${60 + (100 - recycledPct) * 0.4}`}
          fill="none"
          stroke="url(#dischargeGradient)"
          strokeWidth={Math.max(4, recycledPct * 0.3)}
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* Recycled Loop Back */}
        {recycled > 0 && (
          <path
            d="M 380,80 C 380,130 200,140 20,100"
            fill="none"
            stroke="url(#recycleGradient)"
            strokeWidth={Math.max(2, recycledPct * 0.2)}
            strokeLinecap="round"
            strokeDasharray="4,4"
            opacity="0.5"
          />
        )}

        {/* Node Circles */}
        <circle cx="20" cy="80" r="12" fill="#0EA5E9" className="drop-shadow-md" />
        <circle cx="140" cy="70" r="10" fill="#06B6D4" className="drop-shadow-md" />
        <circle cx="260" cy="75" r="8" fill="#14B8A6" className="drop-shadow-md" />
        <circle cx="380" cy="80" r="6" fill="#10B981" className="drop-shadow-md" />

        {/* Labels */}
        <text x="20" y="110" textAnchor="middle" className="text-[9px] fill-stone-600 font-medium">Withdrawal</text>
        <text x="20" y="122" textAnchor="middle" className="text-[10px] fill-stone-800 font-bold">{withdrawal.toLocaleString()}</text>
        
        <text x="140" y="110" textAnchor="middle" className="text-[9px] fill-stone-600 font-medium">Consumption</text>
        <text x="140" y="122" textAnchor="middle" className="text-[10px] fill-stone-800 font-bold">{consumption.toLocaleString()}</text>
        
        <text x="260" y="110" textAnchor="middle" className="text-[9px] fill-stone-600 font-medium">Discharge</text>
        <text x="260" y="122" textAnchor="middle" className="text-[10px] fill-stone-800 font-bold">{discharge.toLocaleString()}</text>
        
        <text x="380" y="110" textAnchor="middle" className="text-[9px] fill-stone-600 font-medium">Recycled</text>
        <text x="380" y="122" textAnchor="middle" className="text-[10px] fill-stone-800 font-bold">{recycled.toLocaleString()}</text>
      </svg>
    </div>
  );
}
