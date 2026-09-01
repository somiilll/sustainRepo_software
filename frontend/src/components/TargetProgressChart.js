import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_COLORS = {
  on_track: '#16a34a',
  at_risk: '#f59e0b',
  breached: '#dc2626',
  no_data: '#a8a29e',
};

const CustomDot = ({ cx, cy, payload }) => {
  if (payload.is_future || payload.actual === null || payload.actual === undefined) return null;
  const color = STATUS_COLORS[payload.status] || STATUS_COLORS.no_data;

  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
      {payload.status === 'breached' && (
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize={14}>&#10060;</text>
      )}
      {payload.status === 'at_risk' && (
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize={14}>&#9888;</text>
      )}
    </g>
  );
};

const CustomTooltip = ({ active, payload, unit, goalType }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const diff = d.actual != null && d.target != null ? d.actual - d.target : null;
  const variance = diff != null && d.target ? ((diff / d.target) * 100).toFixed(1) : null;

  const statusLabel = { on_track: 'On Track', at_risk: 'At Risk', breached: 'Breached', no_data: 'No Data' };

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3 shadow-lg text-sm" data-testid="chart-tooltip">
      <p className="font-semibold text-text-primary mb-1">{d.year_label || `${d.month} ${d.year}`}</p>
      <div className="space-y-0.5 text-text-secondary">
        {d.actual != null && <p>Actual: <span className="font-medium">{d.actual.toLocaleString()} {unit}</span></p>}
        {d.target != null && <p>Target: <span className="font-medium">{d.target.toLocaleString()} {unit}</span></p>}
        {diff != null && (
          <p>Difference: <span className={`font-medium ${diff > 0 ? (goalType === 'upper_limit' ? 'text-red-600' : 'text-green-600') : (goalType === 'upper_limit' ? 'text-green-600' : 'text-red-600')}`}>
            {diff > 0 ? '+' : ''}{diff.toLocaleString()}
          </span></p>
        )}
        {variance != null && <p>Variance: <span className="font-medium">{variance > 0 ? '+' : ''}{variance}%</span></p>}
        <p>Status: <span className="font-medium" style={{ color: STATUS_COLORS[d.status] }}>{statusLabel[d.status] || 'N/A'}</span></p>
      </div>
    </div>
  );
};

function getOverallStatus(data) {
  const latest = [...data].reverse().find(d => d.actual != null && !d.is_future);
  if (!latest) return 'no_data';
  return latest.status;
}

const StatusBadge = ({ status }) => {
  const config = {
    on_track: { label: 'On Track', className: 'bg-green-100 text-green-700' },
    at_risk: { label: 'At Risk', className: 'bg-yellow-100 text-yellow-700' },
    breached: { label: 'Off Track', className: 'bg-red-100 text-red-700' },
    no_data: { label: 'No Data', className: 'bg-stone-100 text-stone-500' },
  };
  const c = config[status] || config.no_data;
  return <Badge className={`${c.className} text-xs font-semibold`} data-testid="status-badge">{c.label}</Badge>;
};

// Monthly Line Chart
function MonthlyChart({ data, unit, goalType }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#78716c" />
          <YAxis tick={{ fontSize: 12 }} stroke="#78716c" />
          <Tooltip content={<CustomTooltip unit={unit} goalType={goalType} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="target" stroke="#e11d48" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Target" />
          <Line type="monotone" dataKey="actual" stroke="#0ea5e9" strokeWidth={2.5} dot={<CustomDot />} connectNulls={false} name="Actual" />
          {data.find(d => d.is_current) && (
            <ReferenceLine x={data.find(d => d.is_current)?.month} stroke="#6366f1" strokeDasharray="4 4" label={{ value: "NOW", position: "top", fontSize: 10, fill: "#6366f1" }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Yearly Chart — X-axis = years, target line per year, actual = cumulative per year
function YearlyChart({ data, unit, goalType }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="year_label" tick={{ fontSize: 11 }} stroke="#78716c" />
          <YAxis tick={{ fontSize: 12 }} stroke="#78716c" />
          <Tooltip content={<CustomTooltip unit={unit} goalType={goalType} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="target" stroke="#e11d48" strokeWidth={2} dot={{ r: 4, fill: '#e11d48' }} name="Target" />
          <Line type="monotone" dataKey="actual" stroke="#0ea5e9" strokeWidth={2.5} dot={<CustomDot />} connectNulls={false} name="Actual" />
          {data.find(d => d.is_current) && (
            <ReferenceLine x={data.find(d => d.is_current)?.year_label} stroke="#6366f1" strokeDasharray="4 4" label={{ value: "NOW", position: "top", fontSize: 10, fill: "#6366f1" }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Static Progress Bar
function StaticProgressChart({ chartData }) {
  const { baseline_value, current_value, target_value, baseline_period, target_period, current_period, progress_percentage, unit } = chartData;

  const range = Math.abs(baseline_value - target_value) || 1;
  const currentPct = current_value != null ? Math.max(0, Math.min(100, ((current_value - Math.min(baseline_value, target_value)) / range) * 100)) : 0;
  const isReduction = target_value < baseline_value;

  const achieved = current_value != null && baseline_value
    ? Math.abs(((baseline_value - current_value) / baseline_value) * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-text-muted">Baseline</p>
          <p className="text-lg font-bold text-text-primary">{baseline_value?.toLocaleString()}</p>
          <p className="text-[10px] text-text-muted">{baseline_period}</p>
        </Card>
        <Card className="p-3 text-center border-2 border-sky-200">
          <p className="text-xs text-text-muted">Current</p>
          <p className="text-lg font-bold text-sky-600">{current_value != null ? current_value.toLocaleString() : 'N/A'}</p>
          <p className="text-[10px] text-text-muted">{current_period}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-text-muted">Target</p>
          <p className="text-lg font-bold text-emerald-600">{target_value?.toLocaleString()}</p>
          <p className="text-[10px] text-text-muted">{target_period}</p>
        </Card>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="flex justify-between text-[10px] text-text-muted mb-1">
          <span>{baseline_value?.toLocaleString()} {unit}</span>
          <span>{target_value?.toLocaleString()} {unit}</span>
        </div>
        <div className="w-full h-4 bg-stone-100 rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all ${progress_percentage != null && progress_percentage >= 50 ? 'bg-emerald-500' : progress_percentage != null && progress_percentage >= 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${Math.max(2, Math.min(100, progress_percentage || 0))}%` }}
          />
          {/* Current marker */}
          {current_value != null && (
            <div
              className="absolute top-0 h-full w-0.5 bg-sky-600"
              style={{ left: `${isReduction ? 100 - currentPct : currentPct}%` }}
            >
              <div className="absolute -top-5 -translate-x-1/2 text-[9px] font-semibold text-sky-700 whitespace-nowrap">
                {current_value.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats removed — Achievement shown in header */}
    </div>
  );
}

// Empty State
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle className="w-10 h-10 text-stone-300 mb-2" />
      <p className="text-sm font-medium text-text-secondary">No activity data available yet.</p>
      <p className="text-xs text-text-muted">Upload activity data to begin tracking target performance.</p>
    </div>
  );
}

export default function TargetProgressChart({ targetId }) {
  const { token } = useAuth();
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/api/esg-targets/${targetId}/chart-data`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setChartData(res.data);
      } catch (e) {
        console.error('Failed to load chart data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [targetId, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!chartData || chartData.chart_type === 'none') return <EmptyState />;

  const data = chartData.data || [];
  const hasActualData = data.some(d => d.actual != null);

  if (!hasActualData && chartData.chart_type !== 'static') return <EmptyState />;

  const overallStatus = chartData.chart_type === 'static'
    ? (chartData.progress_percentage >= 75 ? 'on_track' : chartData.progress_percentage >= 40 ? 'at_risk' : 'breached')
    : getOverallStatus(data);

  return (
    <div className="space-y-3 pt-2" data-testid="target-progress-chart">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge status={chartData.current_value === null && chartData.chart_type === 'static' ? 'no_data' : overallStatus} />
          {chartData.chart_type === 'static' && chartData.progress_percentage != null && (
            <span className="text-xs font-medium text-sky-600">Achievement: {chartData.progress_percentage.toFixed(1)}%</span>
          )}
        </div>
        {chartData.unit && <span className="text-xs text-text-muted">Unit: {chartData.unit}</span>}
      </div>

      {chartData.chart_type === 'monthly' && <MonthlyChart data={data} unit={chartData.unit} goalType={chartData.goal_type} />}
      {(chartData.chart_type === 'yearly' || chartData.chart_type === 'yearly_cumulative') && <YearlyChart data={data} unit={chartData.unit} goalType={chartData.goal_type} />}
      {chartData.chart_type === 'static' && <StaticProgressChart chartData={chartData} />}
    </div>
  );
}
