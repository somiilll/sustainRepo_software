/**
 * WasteManagementSection — Waste metrics display for BRSR Dashboard
 */
import React from 'react';
import { Trash2, Recycle, Factory } from 'lucide-react';

export default function WasteManagementSection({ data = {}, loading = false }) {
  const wasteCategories = [
    { key: 'plastic', label: 'Plastic', color: '#F43F5E' },
    { key: 'ewaste', label: 'E-waste', color: '#8B5CF6' },
    { key: 'hazardous', label: 'Hazardous', color: '#DC2626' },
    { key: 'metal', label: 'Metal Scrap', color: '#F59E0B' },
    { key: 'paper', label: 'Paper', color: '#10B981' },
    { key: 'organic', label: 'Organic', color: '#84CC16' },
  ];

  const categoryData = wasteCategories.map(c => ({
    name: c.label,
    value: data[c.key] || 0,
    color: c.color
  })).filter(c => c.value > 0);

  const totalGenerated = data.generated || 0;
  const totalRecovered = data.recovered || 0;
  const totalDisposed = data.disposed || 0;
  const recoveryPct = totalGenerated > 0 ? (totalRecovered / totalGenerated) * 100 : 0;
  const hazardousPct = data.hazardous_pct || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
          <div className="flex items-center gap-2 mb-1">
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-medium text-rose-700">Generated</span>
          </div>
          <p className="text-lg font-bold text-rose-900">{totalGenerated.toLocaleString()}<span className="text-xs font-normal ml-1">MT</span></p>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <Recycle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">Recovered</span>
          </div>
          <p className="text-lg font-bold text-emerald-900">{totalRecovered.toLocaleString()}<span className="text-xs font-normal ml-1">MT</span></p>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
          <div className="flex items-center gap-2 mb-1">
            <Factory className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-700">Disposed</span>
          </div>
          <p className="text-lg font-bold text-amber-900">{totalDisposed.toLocaleString()}<span className="text-xs font-normal ml-1">MT</span></p>
        </div>
      </div>

      <div className="p-3 bg-stone-50 rounded-xl">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-stone-500 uppercase">Recovery Rate</span>
          <span className="text-sm font-bold text-emerald-600">{recoveryPct.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${recoveryPct}%` }} />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 p-3 bg-red-50 rounded-xl border border-red-100 text-center">
          <p className="text-xs text-red-600 font-medium mb-1">Hazardous</p>
          <p className="text-lg font-bold text-red-700">{hazardousPct.toFixed(1)}%</p>
        </div>
        <div className="flex-1 p-3 bg-green-50 rounded-xl border border-green-100 text-center">
          <p className="text-xs text-green-600 font-medium mb-1">Non-Hazardous</p>
          <p className="text-lg font-bold text-green-700">{(100 - hazardousPct).toFixed(1)}%</p>
        </div>
      </div>

      {categoryData.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-stone-500 uppercase mb-3">By Category</p>
          <div className="space-y-2">
            {categoryData.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="text-sm text-stone-600 flex-1">{cat.name}</span>
                <span className="text-sm font-medium text-stone-900">{cat.value.toLocaleString()} MT</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
