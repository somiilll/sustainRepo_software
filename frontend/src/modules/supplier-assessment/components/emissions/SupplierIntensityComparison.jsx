import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

const formatIntensity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 6, maximumSignificantDigits: 5 });
const shortName = (name) => name.length > 16 ? `${name.slice(0, 14)}…` : name;

export const SupplierIntensityComparison = ({ data }) => (
  <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-emissions-intensity-card">
    <CardHeader className="border-b border-stone-100 pb-4">
      <CardTitle className="text-base text-stone-900" data-testid="supplier-emissions-intensity-title">Supplier emissions intensity</CardTitle>
      <p className="mt-1 text-xs text-stone-500" data-testid="supplier-emissions-intensity-description">Attributed emissions per unit of supplier annual revenue</p>
    </CardHeader>
    <CardContent className="pt-5">
      {data.length ? <div className="overflow-x-auto"><div style={{ minWidth: Math.max(520, data.length * 96) }} data-testid="supplier-emissions-intensity-chart"><ResponsiveContainer width="100%" height={250}><BarChart data={data} barCategoryGap="32%" margin={{ top: 4, right: 8, left: -8, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edece7" /><XAxis dataKey="company_name" interval={0} tick={{ fontSize: 10, fill: '#78716c' }} tickFormatter={shortName} /><YAxis tick={{ fontSize: 11, fill: '#78716c' }} tickFormatter={formatIntensity} /><Tooltip formatter={(value) => [`${formatIntensity(value)} tCO₂e / supplier currency`, 'Intensity']} /><Bar dataKey="intensity" fill="#14b8a6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div> : <p className="py-16 text-center text-sm text-stone-500" data-testid="supplier-emissions-intensity-empty">Add supplier annual revenue to calculate intensity.</p>}
    </CardContent>
  </Card>
);