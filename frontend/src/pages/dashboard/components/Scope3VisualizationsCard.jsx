/**
 * Scope3VisualizationsCard — trend area chart + Scope 3 emission hotspots.
 *
 * **EXCLUSIVE TO DashboardScope123** — only orgs with Scope 3 access render this.
 * The DashboardScope12 variant does NOT import or render this component.
 */
import React from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, Layers } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { glassCardStyle, glassCardHover, SCOPE_COLORS } from '../dashboardConstants';

export default function Scope3VisualizationsCard({ stats, filteredData }) {
  if (!(stats?.scope3_by_category?.length > 0)) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Scope 1, 2, 3 Comparison Area Chart */}
      <Card className={`p-5 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="scope-comparison-chart">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-heading font-bold text-text-primary">Scope 1, 2, 3 Emissions Trend</h3>
        </div>
        <p className="text-sm text-text-muted mb-4">Monthly comparison across all emission scopes</p>
        {filteredData.trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={filteredData.trend} margin={{ top: 10, right: 20, left: 10, bottom: 35 }}>
              <defs>
                <linearGradient id="colorScope1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SCOPE_COLORS.scope1} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={SCOPE_COLORS.scope1} stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="colorScope2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SCOPE_COLORS.scope2} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={SCOPE_COLORS.scope2} stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="colorScope3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SCOPE_COLORS.scope3} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={SCOPE_COLORS.scope3} stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="period"
                stroke="#71717A"
                tick={{ fontSize: 9 }}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={50}
                tickFormatter={(value) => {
                  const [year, month] = value.split('-');
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  return `${months[parseInt(month) - 1]}'${year.slice(-2)}`;
                }}
              />
              <YAxis
                stroke="#71717A"
                tick={{ fontSize: 10 }}
                label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fill: '#71717A' } }}
              />
              <RechartsTooltip
                formatter={(value, name) => [`${Number(value).toFixed(2)} tCO₂e`, name]}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
              <Legend
                content={() => (
                  <div className="flex justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></div>
                      <span className="text-xs text-gray-600">Scope 1</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></div>
                      <span className="text-xs text-gray-600">Scope 2</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: SCOPE_COLORS.scope3 }}></div>
                      <span className="text-xs text-gray-600">Scope 3</span>
                    </div>
                  </div>
                )}
              />
              <Area type="monotone" dataKey="scope1" stroke={SCOPE_COLORS.scope1} fill="url(#colorScope1)" strokeWidth={2} name="Scope 1" />
              <Area type="monotone" dataKey="scope2" stroke={SCOPE_COLORS.scope2} fill="url(#colorScope2)" strokeWidth={2} name="Scope 2" />
              <Area type="monotone" dataKey="scope3" stroke={SCOPE_COLORS.scope3} fill="url(#colorScope3)" strokeWidth={2} name="Scope 3" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-text-muted">No trend data available</div>
        )}
      </Card>

      {/* Premium Scope 3 Category Hotspots with Ranking Panel */}
      <Card className={`p-5 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="scope3-category-chart">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-violet-400/30 to-purple-300/20 p-2 rounded-lg">
              <Layers className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-heading font-bold text-text-primary">Scope 3 Emission Hotspots</h3>
              <p className="text-xs text-text-muted">Top contributing categories</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={stats.scope3_by_category.slice(0, 4)}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 5, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={true} vertical={false} />
                <XAxis
                  type="number"
                  stroke="#71717A"
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
                  tick={{ fontSize: 10 }}
                  label={{ value: 'tCO₂e', position: 'bottom', offset: 0, fontSize: 10, fill: '#71717A' }}
                />
                <YAxis
                  dataKey="category"
                  type="category"
                  stroke="#71717A"
                  width={55}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => {
                    const match = value.match(/^(C\d+)/);
                    return match ? match[1] : value.substring(0, 6);
                  }}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-white/98 backdrop-blur-xl border border-stone-200 rounded-xl shadow-xl p-3 max-w-xs">
                          <p className="font-semibold text-stone-800 mb-1 text-sm">{d?.category}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between gap-3">
                              <span className="text-stone-500">Emissions:</span>
                              <span className="font-bold text-stone-700">{d?.total_emissions?.toFixed(2)} tCO₂e</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-stone-500">Contribution:</span>
                              <span className="font-bold text-violet-600">{d?.percentage}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="total_emissions" radius={[0, 6, 6, 0]}>
                  {stats.scope3_by_category.slice(0, 4).map((entry, index) => {
                    const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B'];
                    return <Cell key={`cell-${index}`} fill={colors[index] || colors[3]} className="hover:opacity-80 transition-opacity cursor-pointer" />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:w-[160px] space-y-1.5">
            <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-2">Top Hotspots</p>
            {stats.scope3_by_category.slice(0, 4).map((cat, index) => {
              const match = cat.category.match(/^(C\d+)/);
              const categoryCode = match ? match[1] : `#${index + 1}`;
              const badgeColors = [
                'bg-violet-500 text-white',
                'bg-blue-500 text-white',
                'bg-emerald-500 text-white',
                'bg-amber-500 text-white',
              ];
              const textColors = ['text-violet-600', 'text-blue-600', 'text-emerald-600', 'text-amber-600'];
              const bgColors = [
                'bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200/50',
                'bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200/50',
                'bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200/50',
                'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200/50',
              ];
              return (
                <div key={index} className={`p-2 rounded-lg transition-all ${bgColors[index] || bgColors[3]}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${badgeColors[index] || badgeColors[3]}`}>
                      #{index + 1}
                    </span>
                    <span className="text-[10px] font-medium text-stone-600 truncate flex-1" title={cat.category}>
                      {categoryCode}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-xs font-bold ${textColors[index] || textColors[3]}`}>{cat.percentage}%</span>
                    <span className="text-[9px] text-stone-400">
                      {cat.total_emissions >= 1000 ? `${(cat.total_emissions / 1000).toFixed(1)}k` : cat.total_emissions.toFixed(0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
