/**
 * TargetProgressBar — Progress bar for reduction targets
 */
import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function TargetProgressBar({ 
  label, 
  current, 
  target, 
  targetYear, 
  unit = '%', 
  color = '#10B981' 
}) {
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const achieved = progress >= 100;

  return (
    <div className="mb-4" data-testid={`target-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500">Target: {targetYear}</span>
          {achieved && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        </div>
      </div>
      <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-stone-500">{current.toFixed(1)}{unit} achieved</span>
        <span className="text-xs font-medium" style={{ color }}>{progress.toFixed(0)}%</span>
      </div>
    </div>
  );
}
