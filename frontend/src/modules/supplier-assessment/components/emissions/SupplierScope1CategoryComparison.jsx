import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

const formatEmissions = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const shortName = (name) => name.length > 16 ? `${name.slice(0, 14)}…` : name;

export const SupplierScope1CategoryComparison = ({ data, categories }) => (
  <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-scope1-category-card">
    <CardHeader className="border-b border-stone-100 pb-4">
      <CardTitle className="text-base text-stone-900" data-testid="supplier-scope1-category-title">Scope 1 category comparison</CardTitle>
      <p className="mt-1 text-xs text-stone-500" data-testid="supplier-scope1-category-description">Attributed Scope 1 emissions grouped by supplier and category</p>
    </CardHeader>
    <CardContent className="pt-5">
      {data.length && categories.length ? <div className="overflow-x-auto"><div style={{ minWidth: Math.max(620, data.length * 140) }} data-testid="supplier-scope1-category-chart"><ResponsiveContainer width="100%" height={250}><BarChart data={data} barCategoryGap="24%" margin={{ top: 4, right: 8, left: -8, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edece7" /><XAxis dataKey="company_name" interval={0} tick={{ fontSize: 10, fill: '#78716c' }} tickFormatter={shortName} /><YAxis tick={{ fontSize: 11, fill: '#78716c' }} /><Tooltip formatter={(value, name) => [`${formatEmissions(value)} tCO₂e`, name]} /><Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />{categories.map((category) => <Bar key={category.dataKey} dataKey={category.dataKey} name={category.name} fill={category.color} radius={[3, 3, 0, 0]} />)}</BarChart></ResponsiveContainer></div></div> : <p className="py-16 text-center text-sm text-stone-500" data-testid="supplier-scope1-category-empty">No submitted attributed Scope 1 records for this period.</p>}
    </CardContent>
  </Card>
);