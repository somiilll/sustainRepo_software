import React from 'react';
import { ArrowRight, CheckCircle2, CircleDot, TriangleAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { initials, scoreMeta, scoreText } from './rankingUtils';
import { SupplierRequirementProgress } from './SupplierRequirementProgress';
import { SupplierSustainabilityRiskMatrix } from './SupplierSustainabilityRiskMatrix';

export const RankingOverviewTab = ({ attention, distribution, moduleFilter, modules, needCount, onModuleFilterChange, onReview, onViewAll, overall, riskMatrix, statusRows, visibleModules }) => {
  const statusCards = [
    { id: 'excellent', label: 'Excellent', value: distribution[0].value, detail: 'Overall score 80–100', Icon: CheckCircle2, iconClass: 'bg-emerald-50 text-emerald-600' },
    { id: 'good', label: 'Good', value: distribution[1].value, detail: 'Overall score 60–79', Icon: CircleDot, iconClass: 'bg-blue-50 text-blue-600' },
    { id: 'needs-attention', label: 'Overdue follow-up', value: needCount, detail: 'Incomplete tasks past due', Icon: TriangleAlert, iconClass: 'bg-rose-50 text-rose-600' },
  ];

  return <section className="space-y-5" data-testid="supplier-ranking-overview-panel">
    <section className="grid gap-3 md:grid-cols-3" data-testid="supplier-ranking-status-summary">
      {statusCards.map(({ id, label, value, detail, Icon, iconClass }) => <div key={id} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-5 py-4" data-testid={`supplier-ranking-${id}-summary`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <div><p className="text-sm font-semibold text-stone-900">{label}</p><p className="mt-0.5 text-xs text-stone-500" data-testid={`supplier-ranking-${id}-count`}>{value} supplier{value === 1 ? '' : 's'} · {detail}</p></div>
      </div>)}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-score-distribution-card">
        <CardHeader className="border-b border-stone-100 pb-4"><div><CardTitle className="text-base text-stone-900">Overall score distribution</CardTitle><p className="mt-1 text-xs text-stone-500">Suppliers by overall score band</p></div></CardHeader>
        <CardContent className="pt-5">{overall.length ? <ResponsiveContainer width="100%" height={244}><BarChart data={distribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edece7" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716c' }} interval={0} tickFormatter={(label) => label === 'Needs improvement' ? 'Improve' : label} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#78716c' }} /><Tooltip cursor={{ fill: '#fafaf9' }} /><Bar dataKey="value" radius={[4, 4, 0, 0]}>{distribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar></BarChart></ResponsiveContainer> : <p className="py-20 text-center text-sm text-stone-500" data-testid="supplier-score-distribution-empty">No overall scores yet.</p>}</CardContent>
      </Card>
      <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-module-coverage-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-stone-100 pb-4"><div><CardTitle className="text-base text-stone-900">Assessment module coverage</CardTitle><p className="mt-1 text-xs text-stone-500">Completion across assigned suppliers</p></div><Select value={moduleFilter} onValueChange={onModuleFilterChange}><SelectTrigger className="h-8 w-32 text-xs" data-testid="supplier-module-coverage-filter"><SelectValue /></SelectTrigger><SelectContent data-testid="supplier-module-coverage-filter-menu"><SelectItem value="all" data-testid="supplier-module-coverage-option-all">All modules</SelectItem>{modules.map((item) => <SelectItem key={item.code} value={item.code} data-testid={`supplier-module-coverage-option-${item.code}`}>{item.name}</SelectItem>)}</SelectContent></Select></CardHeader>
        <CardContent className="pt-5">{visibleModules.length ? <ResponsiveContainer width="100%" height={244}><BarChart data={visibleModules} layout="vertical" margin={{ top: 4, right: 8, left: 6, bottom: 0 }}><CartesianGrid horizontal={false} stroke="#edece7" /><XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#78716c' }} tickFormatter={(value) => `${value}%`} /><YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 12, fill: '#44403c' }} /><Tooltip formatter={(value) => [`${value}%`, 'Completion']} cursor={{ fill: '#fafaf9' }} /><Bar dataKey="completion" radius={[0, 4, 4, 0]}>{visibleModules.map((item) => <Cell key={item.name} fill={scoreMeta(item.completion).color} />)}</Bar></BarChart></ResponsiveContainer> : <p className="py-20 text-center text-sm text-stone-500" data-testid="supplier-module-coverage-empty">No modules configured.</p>}</CardContent>
      </Card>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-top-performers-card">
        <CardHeader className="flex-row items-center justify-between border-b border-stone-100 pb-4"><div><CardTitle className="text-base text-stone-900">Top performing suppliers</CardTitle><p className="mt-1 text-xs text-stone-500">Highest overall scores this period</p></div><Button variant="ghost" size="sm" className="h-8 px-2 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900" onClick={onViewAll} data-testid="view-all-top-suppliers-button">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></CardHeader>
        <CardContent className="divide-y divide-stone-100 p-0">{overall.length ? overall.slice(0, 5).map((row, index) => <div key={row.supplier_id} className="flex items-center gap-3 px-5 py-3.5" data-testid={`top-performing-supplier-${row.supplier_id}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-800">{initials(row.company_name)}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">{row.company_name}</span><span className="mr-1 text-xs text-stone-400">#{index + 1}</span><span className="text-sm font-semibold text-stone-950" data-testid={`top-performing-supplier-score-${row.supplier_id}`}>{scoreText(row.overall_score)}</span></div>) : <p className="p-6 text-sm text-stone-500" data-testid="supplier-top-performers-empty">No overall scores yet.</p>}</CardContent>
      </Card>
      <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid="supplier-attention-required-card">
        <CardHeader className="flex-row items-center justify-between border-b border-stone-100 pb-4"><div><CardTitle className="flex items-center gap-2 text-base text-stone-900"><TriangleAlert className="h-4 w-4 text-rose-600" aria-hidden="true" />Attention required</CardTitle><p className="mt-1 text-xs text-stone-500">Suppliers needing a follow-up</p></div><Button variant="ghost" size="sm" className="h-8 px-2 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={onViewAll} data-testid="view-all-attention-suppliers-button">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></CardHeader>
        <CardContent className="divide-y divide-stone-100 p-0">{attention.length ? attention.map((row) => <div key={row.supplier_id} className="flex items-center gap-3 px-5 py-3.5" data-testid={`attention-supplier-${row.supplier_id}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700"><TriangleAlert className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-stone-800" data-testid={`attention-supplier-name-${row.supplier_id}`}>{row.company_name}</p><p className="mt-0.5 truncate text-xs text-rose-700" data-testid={`attention-supplier-overdue-modules-${row.supplier_id}`}>Overdue: {(row.overdue_modules || []).join(' · ')}</p></div><Button variant="outline" size="sm" className="h-8 shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => onReview(row)} data-testid={`review-attention-supplier-${row.supplier_id}`}>Review <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div>) : <p className="flex items-center gap-2 p-6 text-sm text-stone-500" data-testid="supplier-attention-required-empty"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No suppliers have overdue incomplete tasks.</p>}</CardContent>
      </Card>
    </section>
    <SupplierSustainabilityRiskMatrix matrix={riskMatrix} />
    <section className="grid gap-5 lg:grid-cols-2" data-testid="supplier-requirement-progress-row"><SupplierRequirementProgress rows={statusRows} type="documents" /><SupplierRequirementProgress rows={statusRows} type="training" /></section>
  </section>;
};