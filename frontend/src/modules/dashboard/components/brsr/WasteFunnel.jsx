/**
 * WasteFunnel - Premium waste flow funnel visualization
 * Flow: Generated → Recovered → Disposed (with clear amounts)
 */
import React from 'react';
import { ArrowDown } from 'lucide-react';

export default function WasteFunnel({ 
  generated = 0, 
  recovered = 0, 
  disposed = 0 
}) {
  const total = generated || 1;
  const recoveredPct = (recovered / total) * 100;
  const disposedPct = (disposed / total) * 100;

  const stages = [
    { 
      label: 'Generated', 
      value: generated, 
      color: '#8B5CF6',
      gradient: 'from-violet-500 to-purple-600',
      width: '100%',
      description: 'Total waste produced'
    },
    { 
      label: 'Recovered', 
      value: recovered, 
      pct: recoveredPct,
      color: '#10B981',
      gradient: 'from-emerald-500 to-teal-600',
      width: `${Math.max(recoveredPct, 30)}%`,
      description: 'Recycled, reused, or reclaimed'
    },
    { 
      label: 'Disposed', 
      value: disposed, 
      pct: disposedPct,
      color: '#EF4444',
      gradient: 'from-rose-500 to-red-600',
      width: `${Math.max(disposedPct, 20)}%`,
      description: 'Sent to landfill or incineration'
    },
  ];

  return (
    <div className="space-y-3 py-2">
      {stages.map((stage, idx) => (
        <div key={stage.label} className="relative">
          {/* Connector Arrow */}
          {idx > 0 && (
            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center">
                <ArrowDown className="w-3.5 h-3.5 text-stone-400" />
              </div>
            </div>
          )}
          
          {/* Stage Bar */}
          <div 
            className="mx-auto transition-all duration-500"
            style={{ width: stage.width }}
          >
            <div className={`bg-gradient-to-r ${stage.gradient} rounded-xl p-4 shadow-lg relative overflow-hidden`}>
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0" />
              
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-white/80 text-[10px] font-medium uppercase tracking-wide">
                    {stage.label}
                  </div>
                  <div className="text-white text-xl font-bold">
                    {stage.value.toLocaleString()} 
                    <span className="text-sm font-medium ml-1">MT</span>
                  </div>
                  <div className="text-white/60 text-[9px] mt-0.5">
                    {stage.description}
                  </div>
                </div>
                
                {stage.pct !== undefined && (
                  <div className="text-right">
                    <div className="text-white text-2xl font-bold">
                      {stage.pct.toFixed(1)}%
                    </div>
                    <div className="text-white/60 text-[9px]">of generated</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      
      {/* Summary Footer */}
      <div className="flex justify-center gap-6 pt-2 text-[10px] text-stone-500">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
          Recovery Rate: <strong className="text-emerald-600">{recoveredPct.toFixed(1)}%</strong>
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1" />
          Disposal Rate: <strong className="text-rose-600">{disposedPct.toFixed(1)}%</strong>
        </span>
      </div>
    </div>
  );
}
