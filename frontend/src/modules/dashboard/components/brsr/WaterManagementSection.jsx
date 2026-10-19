/**
 * WaterManagementSection — Water metrics display for BRSR Dashboard
 */
import React from 'react';
import { Droplets, Waves, ArrowDownRight, Recycle } from 'lucide-react';

export default function WaterManagementSection({ data = {}, loading = false }) {
  const waterSources = [
    { key: 'groundwater', label: 'Groundwater', color: '#0EA5E9' },
    { key: 'surface', label: 'Surface Water', color: '#38BDF8' },
    { key: 'municipal', label: 'Municipal', color: '#7DD3FC' },
    { key: 'rainwater', label: 'Rainwater', color: '#BAE6FD' },
    { key: 'recycled', label: 'Recycled', color: '#10B981' },
  ];

  const sourceData = waterSources.map(s => ({
    name: s.label,
    value: data[s.key] || 0,
    color: s.color
  })).filter(s => s.value > 0);

  const totalWithdrawn = data.withdrawn || 0;
  const totalConsumed = data.consumed || 0;
  const totalDischarged = data.discharged || 0;
  const recycledPct = data.recycled_pct || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <Droplets className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">Withdrawn</span>
          </div>
          <p className="text-xl font-bold text-blue-900">{totalWithdrawn.toLocaleString()}<span className="text-sm font-normal ml-1">KL</span></p>
        </div>
        <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-100">
          <div className="flex items-center gap-2 mb-1">
            <Waves className="w-4 h-4 text-cyan-600" />
            <span className="text-xs font-medium text-cyan-700">Consumed</span>
          </div>
          <p className="text-xl font-bold text-cyan-900">{totalConsumed.toLocaleString()}<span className="text-sm font-normal ml-1">KL</span></p>
        </div>
        <div className="p-3 bg-sky-50 rounded-xl border border-sky-100">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownRight className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-medium text-sky-700">Discharged</span>
          </div>
          <p className="text-xl font-bold text-sky-900">{totalDischarged.toLocaleString()}<span className="text-sm font-normal ml-1">KL</span></p>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <Recycle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">Recycled</span>
          </div>
          <p className="text-xl font-bold text-emerald-900">{recycledPct.toFixed(1)}<span className="text-sm font-normal ml-1">%</span></p>
        </div>
      </div>

      {sourceData.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-stone-500 uppercase mb-3">Water Sources</p>
          <div className="space-y-2">
            {sourceData.map((source) => (
              <div key={source.name} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: source.color }} />
                <span className="text-sm text-stone-600 flex-1">{source.name}</span>
                <span className="text-sm font-medium text-stone-900">{source.value.toLocaleString()} KL</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 p-3 bg-stone-50 rounded-xl">
        <p className="text-xs font-semibold text-stone-500 uppercase mb-2">Treatment Status</p>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-stone-500">Treated</span>
              <span className="font-medium text-emerald-600">{data.treated_pct || 85}%</span>
            </div>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.treated_pct || 85}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
