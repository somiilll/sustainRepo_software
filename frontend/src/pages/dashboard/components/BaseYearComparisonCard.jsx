/**
 * BaseYearComparisonCard — direct (Scope 1+2+Biogenic Direct) and indirect
 * (Scope 3 + Biogenic Indirect) comparison panels with progress bars.
 *
 * Capability-aware: indirect panel hides Scope 3 row if `hasScope3Access` is false.
 * Both Scope 1+2 and Scope 1+2+3 variants render this card.
 */
import React from 'react';
import { Target } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { glassCardStyle, glassCardHover } from '../dashboardConstants';

function ScopeBars({ comparison }) {
  return (
    <div className="space-y-2">
      {comparison.map((item, idx) => {
        const maxVal = Math.max(item.base, item.current, 1);
        const baseWidth = (item.base / maxVal) * 100;
        const currentWidth = (item.current / maxVal) * 100;
        const change = item.base > 0 ? ((item.current - item.base) / item.base) * 100 : 0;
        return (
          <div key={idx} className="space-y-0.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium" style={{ color: item.color }}>{item.scope}</span>
              <span className={`text-[10px] font-semibold ${change < 0 ? 'text-green-600' : change > 0 ? 'text-red-500' : 'text-gray-500'}`}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}%
              </span>
            </div>
            <div className="relative h-4 bg-white/80 rounded-full overflow-hidden">
              <div className="absolute h-2 top-0 rounded-full" style={{ width: `${baseWidth}%`, backgroundColor: item.color, opacity: 0.4 }} />
              <div className="absolute h-2 bottom-0 rounded-full" style={{ width: `${currentWidth}%`, backgroundColor: item.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BaseYearComparisonCard({ baseYearComparison, hasScope3Access }) {
  if (!baseYearComparison) return null;
  const c = baseYearComparison;

  // Hide the indirect panel entirely for Scope 1+2-only orgs that have NO indirect base year configured.
  // (For Scope 1+2 orgs WITH biogenic-indirect base year, still show the indirect panel — biogenic-only.)
  const showIndirectPanel = hasScope3Access || c.indirectConfigured || c.indirectComparison.length > 0;

  return (
    <Card className={`p-5 rounded-2xl ${glassCardStyle} ${glassCardHover} border-l-4 border-l-primary mt-6`} data-testid="base-year-comparison-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-2.5 rounded-xl">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-heading font-bold text-text-primary">Base Year Comparison</h3>
            <p className="text-xs text-text-muted">Progress against baseline</p>
          </div>
        </div>
        {c.baseTotal > 0 && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
            c.changePercent < 0 ? 'bg-green-100 text-green-700' :
            c.changePercent > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {c.changePercent > 0 ? '+' : ''}{c.changePercent.toFixed(1)}% Overall
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 ${showIndirectPanel ? 'lg:grid-cols-2' : ''} gap-4`}>
        {/* Direct Emissions (Scope 1, 2 & Biogenic Direct) */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/80 to-blue-50/80 border border-emerald-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-text-primary">Scope 1, 2 & Biogenic</h4>
            {c.directConfigured ? (
              <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                c.directChangePercent < 0 ? 'bg-green-100 text-green-700' :
                c.directChangePercent > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {c.directChangePercent > 0 ? '+' : ''}{c.directChangePercent.toFixed(1)}%
              </div>
            ) : (
              <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Not Configured</div>
            )}
          </div>
          {c.directConfigured ? (
            <>
              <div className="mb-2 px-2 py-0.5 bg-emerald-100/70 rounded inline-block">
                <p className="text-[10px] font-medium text-emerald-700">Base ({c.directBaseYear})</p>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="p-2 rounded-lg bg-white/70">
                  <p className="text-[10px] text-text-muted">Base</p>
                  <p className="text-sm font-bold text-stone-600">{c.directBaseTotal.toFixed(1)}</p>
                </div>
                <div className="p-2 rounded-lg bg-white/70">
                  <p className="text-[10px] text-text-muted">Current</p>
                  <p className="text-sm font-bold text-emerald-600">{c.directCurrentTotal.toFixed(1)}</p>
                </div>
              </div>
              <ScopeBars comparison={c.directComparison} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-2">
                <Target className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-xs font-medium text-text-secondary">Base Year Not Configured</p>
              <p className="text-sm font-semibold text-emerald-600 mt-2">Current: {c.directCurrentTotal.toFixed(1)} tCO₂e</p>
            </div>
          )}
        </div>

        {/* Indirect Emissions (Scope 3 + Biogenic Indirect) — only for scope3-aware variants OR when explicitly configured */}
        {showIndirectPanel && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50/80 to-orange-50/80 border border-purple-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-text-primary">{hasScope3Access ? 'Scope 3 & Biogenic' : 'Biogenic Indirect'}</h4>
              {c.indirectConfigured ? (
                <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  c.indirectChangePercent < 0 ? 'bg-green-100 text-green-700' :
                  c.indirectChangePercent > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {c.indirectChangePercent > 0 ? '+' : ''}{c.indirectChangePercent.toFixed(1)}%
                </div>
              ) : (
                <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Not Configured</div>
              )}
            </div>
            {c.indirectConfigured ? (
              <>
                <div className="mb-2 px-2 py-0.5 bg-purple-100/70 rounded inline-block">
                  <p className="text-[10px] font-medium text-purple-700">Base ({c.indirectBaseYear})</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-white/70">
                    <p className="text-[10px] text-text-muted">Base</p>
                    <p className="text-sm font-bold text-stone-600">{c.indirectBaseTotal.toFixed(1)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/70">
                    <p className="text-[10px] text-text-muted">Current</p>
                    <p className="text-sm font-bold text-purple-600">{c.indirectCurrentTotal.toFixed(1)}</p>
                  </div>
                </div>
                <ScopeBars comparison={c.indirectComparison} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-2">
                  <Target className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-xs font-medium text-text-secondary">Base Year Not Configured</p>
                <p className="text-sm font-semibold text-purple-600 mt-2">Current: {c.indirectCurrentTotal.toFixed(1)} tCO₂e</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
