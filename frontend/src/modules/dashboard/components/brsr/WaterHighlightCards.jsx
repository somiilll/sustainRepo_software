/**
 * WaterHighlightCards - Small highlight cards for water metrics
 */
import React from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export default function WaterHighlightCards({
  stressAreaPct = 12,
  treatedPct = 85,
  untreatedPct = 15,
}) {
  const cards = [
    {
      label: 'Water Stress Area',
      value: stressAreaPct,
      unit: '%',
      status: stressAreaPct > 20 ? 'critical' : stressAreaPct > 10 ? 'warning' : 'good',
      description: 'Withdrawal from high-stress regions',
    },
    {
      label: 'Treated Water',
      value: treatedPct,
      unit: '%',
      status: treatedPct >= 80 ? 'good' : treatedPct >= 60 ? 'warning' : 'critical',
      description: 'Discharge after treatment',
    },
    {
      label: 'Untreated Water',
      value: untreatedPct,
      unit: '%',
      status: untreatedPct <= 10 ? 'good' : untreatedPct <= 25 ? 'warning' : 'critical',
      description: 'Direct discharge without treatment',
    },
  ];

  const statusConfig = {
    good: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      icon: CheckCircle,
      iconColor: 'text-emerald-500',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
    },
    critical: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-700',
      icon: XCircle,
      iconColor: 'text-rose-500',
    },
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((card) => {
        const config = statusConfig[card.status];
        const Icon = config.icon;
        
        return (
          <div
            key={card.label}
            className={`p-3 rounded-xl border ${config.bg} ${config.border} transition-all hover:shadow-sm`}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-medium text-stone-600 leading-tight">
                {card.label}
              </span>
              <Icon className={`w-3.5 h-3.5 ${config.iconColor}`} />
            </div>
            
            <div className={`text-2xl font-bold ${config.text}`}>
              {card.value}
              <span className="text-sm font-medium">{card.unit}</span>
            </div>
            
            <div className="text-[9px] text-stone-500 mt-1 leading-tight">
              {card.description}
            </div>
          </div>
        );
      })}
    </div>
  );
}
