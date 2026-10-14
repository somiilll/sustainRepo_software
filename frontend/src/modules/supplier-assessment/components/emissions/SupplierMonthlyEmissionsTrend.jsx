import React from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

const formatEmissions = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const SERIES = [
  { key: 'total_attributed_emissions', name: 'Total', stroke: '#334155', fill: '#334155', opacity: 0.1 },
  { key: 'scope1_attributed_emissions', name: 'Scope 1', stroke: '#059669', fill: '#059669', opacity: 0.05 },
  { key: 'scope2_attributed_emissions', name: 'Scope 2', stroke: '#2563eb', fill: '#2563eb', opacity: 0.05 },
];

export const SupplierMonthlyEmissionsTrend = ({ data }) => {
  const hasData = data.some((month) => month.total_attributed_emissions !== null);
  return <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-mom-trend-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base text-stone-900" data-testid="supplier-mom-trend-title">Month-on-month supplier emissions</CardTitle></CardHeader><CardContent className="pt-5">{hasData ? <div data-testid="supplier-mom-trend-chart"><ResponsiveContainer width="100%" height={260}><AreaChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edece7" /><XAxis dataKey="month" interval={0} tick={{ fontSize: 11, fill: '#78716c' }} /><YAxis width={54} tick={{ fontSize: 11, fill: '#78716c' }} label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#57534e', fontSize: 11 } }} /><Tooltip formatter={(value, name) => value === null ? ['No data', name] : [`${formatEmissions(value)} tCO₂e`, name]} labelFormatter={(_, items) => items?.[0]?.payload?.period || ''} /><Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 11, paddingBottom: 10 }} />{SERIES.map((series) => <Area key={series.key} type="monotone" dataKey={series.key} name={series.name} stroke={series.stroke} strokeWidth={series.name === 'Total' ? 2.5 : 2} fill={series.fill} fillOpacity={series.opacity} connectNulls={false} activeDot={{ r: 5 }} />)}</AreaChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-stone-500" data-testid="supplier-mom-trend-empty">No submitted monthly attributed emissions for this period.</p>}</CardContent></Card>;
};