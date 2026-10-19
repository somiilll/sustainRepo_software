/**
 * ESGKpiCards — 12 executive KPI cards with YoY change indicators.
 * Reusable card component, responsive grid.
 */
import React from 'react';
import { Card } from '../../../components/ui/card';
import { TrendingUp, TrendingDown, Minus, Flame, Zap, Droplets, Trash2, Users, Heart, ShieldAlert, CreditCard, BarChart3, Recycle } from 'lucide-react';
import { glassCardStyle, glassCardHover } from '../dashboardConstants';

const KPI_CONFIG = [
  { key: 'total_emissions', label: 'Total Emissions', icon: Flame, color: 'emerald', tooltip: 'Scope 1 + 2 + 3' },
  { key: 'ghg_intensity', label: 'GHG Intensity', icon: BarChart3, color: 'emerald', tooltip: '(S1+S2) / Production' },
  { key: 'scope1', label: 'Scope 1', icon: Flame, color: 'green', tooltip: 'Direct emissions' },
  { key: 'scope2', label: 'Scope 2', icon: Zap, color: 'blue', tooltip: 'Indirect energy emissions' },
  { key: 'scope3', label: 'Scope 3', icon: TrendingUp, color: 'purple', tooltip: 'Value chain emissions' },
  { key: 'total_employees', label: 'Total Employees', icon: Users, color: 'violet', tooltip: 'Current headcount' },
  { key: 'diversity_pct', label: 'Female Workforce %', icon: Heart, color: 'pink', tooltip: 'Female / Total employees' },
];

const COLOR_MAP = {
  emerald: { bg: 'from-emerald-500/15 to-emerald-500/5', icon: 'text-emerald-600', text: 'text-emerald-700' },
  green: { bg: 'from-green-500/15 to-green-500/5', icon: 'text-green-600', text: 'text-green-700' },
  blue: { bg: 'from-blue-500/15 to-blue-500/5', icon: 'text-blue-600', text: 'text-blue-700' },
  purple: { bg: 'from-purple-500/15 to-purple-500/5', icon: 'text-purple-600', text: 'text-purple-700' },
  violet: { bg: 'from-violet-500/15 to-violet-500/5', icon: 'text-violet-600', text: 'text-violet-700' },
  pink: { bg: 'from-pink-500/15 to-pink-500/5', icon: 'text-pink-600', text: 'text-pink-700' },
  orange: { bg: 'from-orange-500/15 to-orange-500/5', icon: 'text-orange-600', text: 'text-orange-700' },
  red: { bg: 'from-red-500/15 to-red-500/5', icon: 'text-red-600', text: 'text-red-700' },
  gray: { bg: 'from-stone-500/15 to-stone-500/5', icon: 'text-stone-600', text: 'text-stone-700' },
  indigo: { bg: 'from-indigo-500/15 to-indigo-500/5', icon: 'text-indigo-600', text: 'text-indigo-700' },
};

function KpiCard({ label, value, unit, change, icon: Icon, color, tooltip }) {
  const c = COLOR_MAP[color] || COLOR_MAP.emerald;
  const isPositive = change > 0;
  const isNegative = change < 0;

  return (
    <Card className={`group p-4 rounded-2xl ${glassCardStyle} ${glassCardHover} cursor-default`} title={tooltip}>
      <div className="flex items-center gap-3">
        <div className={`bg-gradient-to-br ${c.bg} p-2.5 rounded-xl group-hover:scale-105 transition-transform duration-300`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-text-muted text-[10px] font-medium uppercase tracking-wide truncate">{label}</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-heading font-bold text-text-primary">
              {value != null ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
            </p>
            {unit && <span className="text-[10px] text-text-muted">{unit}</span>}
          </div>
        </div>
        {change != null && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${isNegative ? 'text-green-600' : isPositive ? 'text-red-500' : 'text-stone-400'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : isNegative ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
    </Card>
  );
}

export default function ESGKpiCards({ kpis }) {
  if (!kpis) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="esg-kpi-cards">
      {KPI_CONFIG.map(cfg => {
        const kpi = kpis[cfg.key] || {};
        return (
          <KpiCard
            key={cfg.key}
            label={cfg.label}
            value={kpi.value}
            unit={kpi.unit}
            change={kpi.change}
            icon={cfg.icon}
            color={cfg.color}
            tooltip={cfg.tooltip}
          />
        );
      })}
    </div>
  );
}
