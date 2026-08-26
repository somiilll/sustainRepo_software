import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

const formatEmissions = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const SupplierMonthlyEmissionsTrend = ({ data }) => {
  const hasData = data.some((month) => month.total_attributed_emissions !== null);
  return <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-mom-trend-card">
    <CardHeader className="border-b border-stone-100 pb-4">
      <CardTitle className="text-base text-stone-900" data-testid="supplier-mom-trend-title">Month-on-month supplier emissions</CardTitle>
      <p className="mt-1 text-xs text-stone-500" data-testid="supplier-mom-trend-description">Combined attributed emissions across all suppliers for each month</p>
    </CardHeader>
    <CardContent className="pt-5">
      {hasData ? <div data-testid="supplier-mom-trend-chart"><ResponsiveContainer width="100%" height={260}><AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edece7" /><XAxis dataKey="month" interval={0} tick={{ fontSize: 11, fill: '#78716c' }} /><YAxis tick={{ fontSize: 11, fill: '#78716c' }} /><Tooltip formatter={(value) => value === null ? ['No data', 'Total attributed emissions'] : [`${formatEmissions(value)} tCO₂e`, 'Total attributed emissions']} labelFormatter={(_, items) => items?.[0]?.payload?.period || ''} /><Area type="monotone" dataKey="total_attributed_emissions" name="Total attributed emissions" stroke="#6366f1" strokeWidth={2.5} fill="#6366f1" fillOpacity={0.1} connectNulls={false} activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-stone-500" data-testid="supplier-mom-trend-empty">No submitted monthly attributed emissions for this period.</p>}
    </CardContent>
  </Card>;
};