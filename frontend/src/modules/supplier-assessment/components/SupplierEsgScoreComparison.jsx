import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

const shortName = (name) => name.length > 16 ? `${name.slice(0, 14)}…` : name;

export const SupplierEsgScoreComparison = ({ suppliers }) => (
  <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="esg-supplier-comparison-card">
    <CardHeader className="border-b border-stone-100 pb-4">
      <CardTitle className="text-base text-stone-900" data-testid="esg-supplier-comparison-title">Supplier ESG score comparison</CardTitle>
      <p className="mt-1 text-xs text-stone-500" data-testid="esg-supplier-comparison-description">Environment, Social, and Governance scores by supplier</p>
    </CardHeader>
    <CardContent className="pt-5">
      {suppliers.length ? <div className="overflow-x-auto"><div style={{ minWidth: Math.max(620, suppliers.length * 120) }} data-testid="esg-supplier-comparison-chart"><ResponsiveContainer width="100%" height={244}><BarChart data={suppliers} barCategoryGap="24%" margin={{ top: 4, right: 8, left: -12, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edece7" /><XAxis dataKey="company_name" interval={0} tick={{ fontSize: 10, fill: '#78716c' }} tickFormatter={shortName} /><YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#78716c' }} /><Tooltip formatter={(value, name) => [value === null || value === undefined ? '—' : `${Number(value).toFixed(1).replace(/\.0$/, '')}/100`, name]} /><Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} /><Bar dataKey="environment_score" name="Environment" fill="#059669" radius={[3, 3, 0, 0]} /><Bar dataKey="social_score" name="Social" fill="#3b82f6" radius={[3, 3, 0, 0]} /><Bar dataKey="governance_score" name="Governance" fill="#7c3aed" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div> : <p className="py-16 text-center text-sm text-stone-500" data-testid="esg-supplier-comparison-empty">No submitted supplier ESG scores yet.</p>}
    </CardContent>
  </Card>
);