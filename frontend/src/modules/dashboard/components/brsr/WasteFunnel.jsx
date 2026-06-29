/**
 * WasteFunnel - Premium waste flow funnel visualization
 * Flow: Generated → Recovered → Disposed
 */
import React from 'react';

export default function WasteFunnel({ 
  generated = 0, 
  recovered = 0, 
  disposed = 0 
}) {
  const total = generated || 1;
  const recoveredPct = (recovered / total) * 100;
  const disposedPct = (disposed / total) * 100;

  return (
    <div className="relative h-48 flex items-center justify-center">
      <svg viewBox="0 0 300 180" className="w-full h-full max-w-[280px]">
        <defs>
          <linearGradient id="funnelGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="funnelGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="funnelGrad3" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#DC2626" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Funnel Layers */}
        {/* Generated - Top (widest) */}
        <path
          d="M 30,10 L 270,10 L 240,55 L 60,55 Z"
          fill="url(#funnelGrad1)"
          className="drop-shadow-md"
        />
        
        {/* Recovered - Middle */}
        <path
          d="M 60,60 L 240,60 L 200,105 L 100,105 Z"
          fill="url(#funnelGrad2)"
          className="drop-shadow-md"
        />
        
        {/* Disposed - Bottom (narrowest) */}
        <path
          d="M 100,110 L 200,110 L 170,155 L 130,155 Z"
          fill="url(#funnelGrad3)"
          className="drop-shadow-md"
        />

        {/* Labels on funnel */}
        <text x="150" y="38" textAnchor="middle" className="text-[11px] fill-white font-bold">
          Generated
        </text>
        <text x="150" y="52" textAnchor="middle" className="text-[10px] fill-white/90 font-medium">
          {generated.toLocaleString()} MT
        </text>

        <text x="150" y="83" textAnchor="middle" className="text-[11px] fill-white font-bold">
          Recovered
        </text>
        <text x="150" y="97" textAnchor="middle" className="text-[10px] fill-white/90 font-medium">
          {recovered.toLocaleString()} MT ({recoveredPct.toFixed(1)}%)
        </text>

        <text x="150" y="133" textAnchor="middle" className="text-[11px] fill-white font-bold">
          Disposed
        </text>
        <text x="150" y="147" textAnchor="middle" className="text-[10px] fill-white/90 font-medium">
          {disposed.toLocaleString()} MT
        </text>

        {/* Flow Arrows */}
        <path d="M 150,55 L 150,60" stroke="white" strokeWidth="2" strokeOpacity="0.5" />
        <path d="M 150,105 L 150,110" stroke="white" strokeWidth="2" strokeOpacity="0.5" />
      </svg>
    </div>
  );
}
