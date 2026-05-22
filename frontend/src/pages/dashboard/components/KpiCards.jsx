/**
 * KpiCards — Total Emissions, Total Sinks, Net Emissions trio.
 * Shared between both Scope variants.
 */
import React from 'react';
import { TrendingUp, TreeDeciduous, Minus } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { glassCardStyle, glassCardHover } from '../dashboardConstants';

export default function KpiCards({ filteredData }) {
  return (
    <div className="col-span-12 md:col-span-3 flex flex-col gap-4">
      {/* Total Emissions */}
      <Card className={`group flex-1 p-5 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="total-emissions-card">
        <div className="h-full flex items-center gap-4">
          <div className="bg-gradient-to-br from-secondary/15 to-secondary/5 p-3 rounded-xl group-hover:scale-105 transition-transform duration-300">
            <TrendingUp className="w-6 h-6 text-secondary" />
          </div>
          <div>
            <p className="text-text-muted text-xs font-medium uppercase tracking-wide">Total Emissions</p>
            <p className="text-2xl font-heading font-bold text-text-primary">
              {filteredData.totals.total.toFixed(1)}
              <span className="text-sm font-normal text-text-muted ml-1">tCO₂e</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Total Sinks */}
      <Card className={`group flex-1 p-5 rounded-2xl bg-gradient-to-br from-green-500/10 via-emerald-100/50 to-teal-50/30 border border-green-200/50 ${glassCardHover}`} data-testid="sinks-total-card">
        <div className="h-full flex items-center gap-4">
          <div className="bg-gradient-to-br from-green-400/30 to-emerald-300/20 p-3 rounded-xl group-hover:scale-105 transition-transform duration-300">
            <TreeDeciduous className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-green-700 text-xs font-medium uppercase tracking-wide">Total Sinks</p>
            <p className="text-2xl font-heading font-bold text-green-600">
              -{(filteredData.filteredSinks || 0).toFixed(1)}
              <span className="text-sm font-normal text-green-600/60 ml-1">tCO₂e</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Net Emissions */}
      <Card className={`group flex-1 p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-100/50 to-sky-50/30 border border-blue-200/50 ${glassCardHover}`} data-testid="net-emissions-card">
        <div className="h-full flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-400/30 to-sky-300/20 p-3 rounded-xl group-hover:scale-105 transition-transform duration-300">
            <Minus className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-blue-700 text-xs font-medium uppercase tracking-wide">Net Emissions</p>
            <p className="text-2xl font-heading font-bold text-blue-600">
              {(filteredData.totals.total - (filteredData.filteredSinks || 0)).toFixed(1)}
              <span className="text-sm font-normal text-blue-600/60 ml-1">tCO₂e</span>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
