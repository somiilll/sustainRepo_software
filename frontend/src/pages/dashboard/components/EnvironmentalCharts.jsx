/**
 * EnvironmentalCharts — GHG Trend, Scope Donut, and monthly breakdown.
 */
import React from 'react';
import { Card } from '../../../components/ui/card';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { glassCardStyle, glassCardHover, SCOPE_COLORS } from '../dashboardConstants';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DONUT_COLORS = [SCOPE_COLORS.scope1, SCOPE_COLORS.scope2, SCOPE_COLORS.scope3];

function ChartCard({ title, children, className = '' }) {
  return (
    <Card className={`p-5 rounded-2xl ${glassCardStyle} ${glassCardHover} ${className}`}>
      <h3 className="text-sm font-semibold text-text-primary mb-3">{title}</h3>
      {children}
    </Card>
  );
}

export function GHGTrendChart({ monthlyTrend }) {
  const data = (monthlyTrend || []).map(d => ({ ...d, name: MONTHS[d.month - 1] }));

  return (
    <ChartCard title="GHG Emission Trend" className="col-span-8">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#78716c" />
          <YAxis tick={{ fontSize: 11 }} stroke="#78716c" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="scope1" stroke={SCOPE_COLORS.scope1} strokeWidth={2.5} dot={{ r: 3 }} name="Scope 1" />
          <Line type="monotone" dataKey="scope2" stroke={SCOPE_COLORS.scope2} strokeWidth={2.5} dot={{ r: 3 }} name="Scope 2" />
          <Line type="monotone" dataKey="scope3" stroke={SCOPE_COLORS.scope3} strokeWidth={2.5} dot={{ r: 3 }} name="Scope 3" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ScopeDonutChart({ scopeBreakdown }) {
  const data = [
    { name: 'Scope 1', value: scopeBreakdown?.scope1 || 0 },
    { name: 'Scope 2', value: scopeBreakdown?.scope2 || 0 },
    { name: 'Scope 3', value: scopeBreakdown?.scope3 || 0 },
  ].filter(d => d.value > 0);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ChartCard title="Scope Breakdown" className="col-span-4">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
          </Pie>
          <Tooltip formatter={(v) => `${v.toLocaleString()} tCO₂e`} />
        </PieChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-text-muted mt-1">Total: {total.toLocaleString()} tCO₂e</p>
    </ChartCard>
  );
}

export function MonthlyStackedBar({ monthlyTrend }) {
  const data = (monthlyTrend || []).map(d => ({ ...d, name: MONTHS[d.month - 1] }));

  return (
    <ChartCard title="Monthly Emissions by Scope">
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#78716c" />
          <YAxis tick={{ fontSize: 10 }} stroke="#78716c" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="scope1" stackId="a" fill={SCOPE_COLORS.scope1} name="Scope 1" />
          <Bar dataKey="scope2" stackId="a" fill={SCOPE_COLORS.scope2} name="Scope 2" />
          <Bar dataKey="scope3" stackId="a" fill={SCOPE_COLORS.scope3} name="Scope 3" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
