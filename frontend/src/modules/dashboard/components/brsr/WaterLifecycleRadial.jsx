/**
 * WaterLifecycleRadial - Premium radial visualization with connected metrics
 * Center: Total Water Managed
 * Connected cards: Withdrawal, Consumption, Discharge, Recycled
 */
import React from 'react';
import { TrendingUp, TrendingDown, Minus, Droplets, ArrowDown, ArrowUp, RefreshCw, Waves } from 'lucide-react';

const MetricCard = ({ 
  label, 
  value, 
  unit = 'KL', 
  change = 0, 
  trend = [], 
  status = 'normal',
  icon: Icon,
  color,
  position 
}) => {
  const statusColors = {
    good: 'border-emerald-200 bg-emerald-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
    critical: 'border-rose-200 bg-rose-50/50',
    normal: 'border-stone-200 bg-white',
  };

  const statusDot = {
    good: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-rose-500',
    normal: 'bg-stone-400',
  };

  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const trendColor = change > 0 ? 'text-emerald-600' : change < 0 ? 'text-rose-600' : 'text-stone-500';

  // Mini sparkline
  const maxVal = Math.max(...trend, 1);
  const sparkPoints = trend.map((v, i) => {
    const x = (i / (trend.length - 1 || 1)) * 40;
    const y = 16 - (v / maxVal) * 14;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div 
      className={`relative p-3 rounded-xl border-2 shadow-sm transition-all hover:shadow-md ${statusColors[status]}`}
      style={{ minWidth: '140px' }}
    >
      {/* Status indicator */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusDot[status]}`} />
      
      {/* Icon & Label */}
      <div className="flex items-center gap-2 mb-2">
        <div 
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-[11px] font-medium text-stone-600">{label}</span>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-xl font-bold text-stone-800">{value.toLocaleString()}</span>
        <span className="text-[10px] text-stone-500">{unit}</span>
      </div>

      {/* Change & Trend */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          <span>{Math.abs(change)}%</span>
        </div>
        
        {/* Mini Sparkline */}
        {trend.length > 1 && (
          <svg width="44" height="18" className="opacity-60">
            <polyline
              points={sparkPoints}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

export default function WaterLifecycleRadial({
  withdrawal = 8500,
  consumption = 5200,
  discharge = 3100,
  recycled = 1800,
  withdrawalChange = 5,
  consumptionChange = -3,
  dischargeChange = 2,
  recycledChange = 12,
  trends = {
    withdrawal: [7800, 8100, 8300, 8200, 8500],
    consumption: [5500, 5400, 5300, 5250, 5200],
    discharge: [3000, 3050, 3080, 3090, 3100],
    recycled: [1500, 1600, 1650, 1750, 1800],
  }
}) {
  const totalManaged = withdrawal;

  return (
    <div className="relative py-4">
      {/* Central Radial */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          {/* Outer ring */}
          <svg width="180" height="180" className="transform -rotate-90">
            <defs>
              <linearGradient id="waterRadialGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0EA5E9" />
                <stop offset="50%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#14B8A6" />
              </linearGradient>
            </defs>
            {/* Background circle */}
            <circle
              cx="90"
              cy="90"
              r="80"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="12"
            />
            {/* Progress segments */}
            <circle
              cx="90"
              cy="90"
              r="80"
              fill="none"
              stroke="url(#waterRadialGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(consumption / withdrawal) * 502} 502`}
              className="drop-shadow-sm"
            />
            {/* Recycled indicator */}
            <circle
              cx="90"
              cy="90"
              r="65"
              fill="none"
              stroke="#10B981"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(recycled / withdrawal) * 408} 408`}
              opacity="0.7"
            />
          </svg>
          
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Droplets className="w-6 h-6 text-sky-500 mb-1" />
            <div className="text-2xl font-bold text-stone-800">{totalManaged.toLocaleString()}</div>
            <div className="text-[10px] text-stone-500 font-medium">Total KL Managed</div>
          </div>
        </div>
      </div>

      {/* Connected Metric Cards - Grid Layout */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Withdrawal"
          value={withdrawal}
          change={withdrawalChange}
          trend={trends.withdrawal}
          status="normal"
          icon={ArrowDown}
          color="#0EA5E9"
        />
        <MetricCard
          label="Consumption"
          value={consumption}
          change={consumptionChange}
          trend={trends.consumption}
          status="good"
          icon={Waves}
          color="#06B6D4"
        />
        <MetricCard
          label="Discharge"
          value={discharge}
          change={dischargeChange}
          trend={trends.discharge}
          status="warning"
          icon={ArrowUp}
          color="#14B8A6"
        />
        <MetricCard
          label="Recycled"
          value={recycled}
          change={recycledChange}
          trend={trends.recycled}
          status="good"
          icon={RefreshCw}
          color="#10B981"
        />
      </div>
    </div>
  );
}
