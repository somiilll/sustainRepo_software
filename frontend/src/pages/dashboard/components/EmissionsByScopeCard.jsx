/**
 * EmissionsByScopeCard — donut chart + horizontal scope bars.
 *
 * Capability-aware: Scope 3 segment is included only if `hasScope3Access` is true.
 * This component is consumed by both DashboardScope12 (renders without Scope 3)
 * and DashboardScope123 (renders with Scope 3).
 */
import React from 'react';
import { PieChart, Pie, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { glassCardStyle, glassCardHover } from '../dashboardConstants';

export default function EmissionsByScopeCard({ filteredData, hasScope3Access }) {
  const pieData = [
    { name: 'Scope 1', value: filteredData.totals.scope1, fill: '#10B981' },
    { name: 'Scope 2', value: filteredData.totals.scope2, fill: '#3B82F6' },
    ...(hasScope3Access ? [{ name: 'Scope 3', value: filteredData.totals.scope3, fill: '#8B5CF6' }] : []),
    { name: 'Biogenic', value: filteredData.totals.biogenic, fill: '#F59E0B' },
  ].filter(d => d.value > 0);

  const bars = [
    { name: 'Biogenic', value: filteredData.totals.biogenic, color: '#F59E0B', bgColor: 'bg-amber-50' },
    { name: 'Scope 1', value: filteredData.totals.scope1, color: '#10B981', bgColor: 'bg-emerald-50' },
    { name: 'Scope 2', value: filteredData.totals.scope2, color: '#3B82F6', bgColor: 'bg-blue-50' },
    ...(hasScope3Access ? [{ name: 'Scope 3', value: filteredData.totals.scope3, color: '#8B5CF6', bgColor: 'bg-violet-50' }] : []),
  ];

  return (
    <Card className={`col-span-12 md:col-span-9 group p-6 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="scope-breakdown-card">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500/20 to-blue-500/10 p-2 rounded-xl">
              <PieChartIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-text-primary">Emissions by Scope</h3>
              <p className="text-xs text-text-muted">GHG Protocol breakdown • {filteredData.totals.total.toFixed(1)} tCO₂e total</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-center">
          {/* Donut Chart */}
          <div className="relative flex-shrink-0">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="#fff"
                  strokeWidth={2}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-lg font-bold text-text-primary">
                  {filteredData.totals.total >= 1000 ? `${(filteredData.totals.total / 1000).toFixed(1)}k` : filteredData.totals.total.toFixed(0)}
                </p>
                <p className="text-[10px] text-text-muted">tCO₂e</p>
              </div>
            </div>
          </div>

          {/* Cleaner Horizontal Percentage Bars */}
          <div className="flex-1 w-full space-y-3">
            {bars.map((scope) => {
              const percentage = filteredData.totals.total > 0 ? (scope.value / filteredData.totals.total) * 100 : 0;
              return (
                <div key={scope.name} className={`p-2.5 rounded-lg ${scope.bgColor} hover:shadow-sm transition-all duration-200`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: scope.color }} />
                      <span className="text-sm font-medium text-text-primary">{scope.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: scope.color }}>{percentage.toFixed(1)}%</span>
                      <span className="text-xs text-text-muted">{scope.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e</span>
                    </div>
                  </div>
                  <div className="h-2 bg-white/70 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${percentage}%`, backgroundColor: scope.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
