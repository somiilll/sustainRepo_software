/**
 * CategoryAndFuelAnalysis — bottom row with two cards:
 *   - Emission Categories (top contributors with progress bars)
 *   - Fuel Type Analysis (donut + ranking list)
 * Shared between both Scope variants.
 */
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Factory, Flame } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { COLORS, glassCardStyle, glassCardHover } from '../dashboardConstants';

function EmissionCategoriesCard({ stats }) {
  const allCategories = stats?.emissions_by_category || [];
  const totalEmissions = allCategories.reduce((sum, c) => sum + (c.total_emissions || 0), 0);

  const sortedCategories = [...allCategories]
    .filter(c => c.total_emissions > 0)
    .map(c => ({
      ...c,
      percentage: totalEmissions > 0 ? ((c.total_emissions / totalEmissions) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.total_emissions - a.total_emissions);

  const topCategories = sortedCategories.slice(0, 3);
  const othersEmissions = sortedCategories.slice(3).reduce((sum, c) => sum + c.total_emissions, 0);
  const othersPercentage = totalEmissions > 0 ? ((othersEmissions / totalEmissions) * 100).toFixed(1) : 0;

  if (othersEmissions > 0) {
    topCategories.push({ category: 'Others', total_emissions: othersEmissions, percentage: othersPercentage });
  }

  const maxEmission = topCategories[0]?.total_emissions || 1;
  const categoryColors = {
    'Stationary Combustion': '#059669',
    'Mobile Combustion': '#2563EB',
    'Fugitive Emissions': '#F59E0B',
    'Purchased Electricity': '#8B5CF6',
    'Purchased Heat/Steam': '#EC4899',
    'Process Emissions': '#06B6D4',
    Others: '#9CA3AF',
  };

  return (
    <Card className={`p-5 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="category-analysis-chart">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-emerald-400/30 to-green-300/20 p-2 rounded-lg">
            <Factory className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-base font-heading font-bold text-text-primary">Emission Categories</h3>
            <p className="text-xs text-text-muted">Top contributors</p>
          </div>
        </div>
      </div>

      {topCategories.length > 0 ? (
        <div className="space-y-2.5">
          {topCategories.map((cat, index) => {
            const widthPercent = (cat.total_emissions / maxEmission) * 100;
            const isTop = index === 0;
            const barColor = categoryColors[cat.category] || COLORS[index % COLORS.length];
            return (
              <div key={index} className="group/bar">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isTop ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-600'}`}>
                      #{index + 1}
                    </span>
                    <span className="text-xs font-medium text-stone-700 group-hover/bar:text-stone-900 transition-colors truncate max-w-[140px]" title={cat.category}>
                      {cat.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: barColor }}>{cat.percentage}%</span>
                    <span className="text-[10px] text-stone-500">
                      {cat.total_emissions >= 1000 ? `${(cat.total_emissions / 1000).toFixed(1)}k` : `${cat.total_emissions.toFixed(1)}`}
                    </span>
                  </div>
                </div>
                <div className="h-5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 group-hover/bar:opacity-90"
                    style={{
                      width: `${widthPercent}%`,
                      background: isTop ? `linear-gradient(90deg, ${barColor} 0%, ${barColor}CC 100%)` : barColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="h-[180px] flex flex-col items-center justify-center text-text-muted">
          <Factory className="w-10 h-10 text-stone-300 mb-2" />
          <p className="text-xs">No category data available</p>
        </div>
      )}
    </Card>
  );
}

function FuelAnalysisCard({ stats }) {
  const allFuels = stats?.emissions_by_fuel || [];
  const totalFuelEmissions = allFuels.reduce((sum, f) => sum + (f.total_emissions || 0), 0);

  const sortedFuels = [...allFuels]
    .filter(f => f.total_emissions > 0)
    .map(f => ({
      ...f,
      percentage: totalFuelEmissions > 0 ? ((f.total_emissions / totalFuelEmissions) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.total_emissions - a.total_emissions);

  const topFuels = sortedFuels.slice(0, 5);
  const othersFuelEmissions = sortedFuels.slice(5).reduce((sum, f) => sum + f.total_emissions, 0);
  const othersFuelPercentage = totalFuelEmissions > 0 ? ((othersFuelEmissions / totalFuelEmissions) * 100).toFixed(1) : 0;

  if (othersFuelEmissions > 0) {
    topFuels.push({ fuel_type: 'Others', total_emissions: othersFuelEmissions, percentage: othersFuelPercentage });
  }

  const fuelColors = ['#EF4444', '#F97316', '#F59E0B', '#8B5CF6', '#3B82F6', '#9CA3AF'];
  const donutData = topFuels.map((f, i) => ({
    name: f.fuel_type,
    value: f.total_emissions,
    percentage: f.percentage,
    fill: fuelColors[i % fuelColors.length],
  }));

  return (
    <Card className={`p-5 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="fuel-analysis-chart">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-orange-400/30 to-red-300/20 p-2 rounded-lg">
            <Flame className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-base font-heading font-bold text-text-primary">Fuel Type Analysis</h3>
            <p className="text-xs text-text-muted">Top fuel sources</p>
          </div>
        </div>
      </div>

      {donutData.length > 0 ? (
        <div className="flex flex-col lg:flex-row items-center gap-3">
          <div className="relative flex-shrink-0">
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={68}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity cursor-pointer" />
                  ))}
                </Pie>
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-white/98 backdrop-blur-xl border border-stone-200 rounded-xl shadow-xl p-3 max-w-[200px]">
                          <p className="font-semibold text-stone-800 text-sm mb-1">{d?.name}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-3">
                              <span className="text-stone-500">Emissions:</span>
                              <span className="font-bold">{d?.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })} tCO₂e</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-stone-500">Contribution:</span>
                              <span className="font-bold text-orange-600">{d?.percentage}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-sm font-bold text-stone-700">
                  {totalFuelEmissions >= 1000 ? `${(totalFuelEmissions / 1000).toFixed(0)}k` : totalFuelEmissions.toFixed(0)}
                </p>
                <p className="text-[9px] text-stone-400">tCO₂e</p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-1.5 w-full">
            {topFuels.slice(0, 4).map((fuel, index) => (
              <div key={index} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-stone-50 transition-colors group/fuel">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: fuelColors[index % fuelColors.length] }} />
                <span className="text-[11px] text-stone-600 flex-1 group-hover/fuel:text-stone-800" title={fuel.fuel_type}>
                  {fuel.fuel_type}
                </span>
                <span className="text-[11px] font-bold ml-2 flex-shrink-0" style={{ color: fuelColors[index % fuelColors.length] }}>
                  {fuel.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-[160px] flex flex-col items-center justify-center text-text-muted">
          <Flame className="w-10 h-10 text-stone-300 mb-2" />
          <p className="text-xs">No fuel data available</p>
        </div>
      )}
    </Card>
  );
}

export default function CategoryAndFuelAnalysis({ stats }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <EmissionCategoriesCard stats={stats} />
      <FuelAnalysisCard stats={stats} />
    </div>
  );
}
