import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Info, Target, TriangleAlert, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const displayScore = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace(/\.0$/, '') : '—');

const scoreBand = (score) => {
  if (!Number.isFinite(Number(score))) return { label: 'Not scored', badge: 'border-stone-200 bg-stone-100 text-stone-600', bar: 'bg-stone-300', dot: 'bg-stone-400' };
  if (Number(score) >= 80) return { label: 'Excellent', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-emerald-500', dot: 'bg-emerald-500' };
  if (Number(score) >= 60) return { label: 'Good', badge: 'border-blue-200 bg-blue-50 text-blue-800', bar: 'bg-blue-500', dot: 'bg-blue-500' };
  if (Number(score) >= 40) return { label: 'Needs improvement', badge: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500', dot: 'bg-amber-500' };
  return { label: 'Critical', badge: 'border-rose-200 bg-rose-50 text-rose-800', bar: 'bg-rose-500', dot: 'bg-rose-500' };
};

const statusClass = (status) => status === 'overdue' ? 'border-rose-200 bg-rose-50 text-rose-800' : status === 'submitted' ? 'border-blue-200 bg-blue-50 text-blue-800' : status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-stone-100 text-stone-700';

const RankMark = ({ rank }) => <span className="flex h-8 w-8 items-center justify-center border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-700" data-testid={`supplier-rank-${rank || 'unranked'}`}>{rank ? String(rank).padStart(2, '0') : '—'}</span>;

const MetricLine = ({ label, value }) => <span className="whitespace-nowrap text-xs text-stone-500">{label} <span className="font-medium text-stone-700">{displayScore(value)}</span></span>;

const PerformanceBar = ({ label, value, testId }) => {
  const band = scoreBand(value);
  return <div className="space-y-1.5" data-testid={testId}><div className="flex items-center justify-between text-sm"><span className="text-stone-700">{label}</span><span className="font-semibold text-stone-900">{displayScore(value)}</span></div><div className="h-2 overflow-hidden bg-stone-100"><div className={`h-full ${band.bar}`} style={{ width: `${Math.min(100, Math.max(0, Number(value) || 0))}%` }} /></div></div>;
};

export default function SupplierRanking() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod } = useSupplierAssessmentPeriod();
  const navigate = useNavigate();
  const [rankings, setRankings] = useState([]);
  const [stats, setStats] = useState({ total: 0, ranked: 0, score_distribution: {}, averages: {}, emissions_by_scope: {} });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRankings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/supplier-assessment/rankings?reporting_period=${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() });
      setRankings(data.rankings || []);
      setStats({ total: data.total_suppliers || 0, ranked: data.ranked_suppliers || 0, score_distribution: data.score_distribution || {}, averages: data.averages || {}, emissions_by_scope: data.emissions_by_scope || {} });
    } catch (error) {
      toast.error('Failed to load rankings');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, reportingPeriod]);

  useEffect(() => { fetchRankings(); }, [fetchRankings]);

  const scoredRankings = useMemo(() => rankings.filter((supplier) => supplier.overall_score !== null && supplier.overall_score !== undefined).sort((a, b) => b.overall_score - a.overall_score), [rankings]);
  const esgRankings = useMemo(() => rankings.filter((supplier) => supplier.esg_score !== null && supplier.esg_score !== undefined).sort((a, b) => b.esg_score - a.esg_score), [rankings]);
  const topSupplier = scoredRankings[0];
  const filteredRankings = useMemo(() => rankings.filter((supplier) => supplier.company_name.toLowerCase().includes(searchQuery.trim().toLowerCase())), [rankings, searchQuery]);
  const attentionRequired = useMemo(() => rankings.filter((supplier) => (supplier.overall_score !== null && supplier.overall_score < 60) || (supplier.attention_reasons || []).length > 0).slice(0, 5), [rankings]);
  const needsAttentionCount = (stats.score_distribution.average || 0) + (stats.score_distribution.poor || 0);
  const viewSupplier = (supplierId) => navigate('/supplier-assessment/suppliers', { state: { selectedSupplierId: supplierId } });

  const kpis = [
    { id: 'suppliers-assessed', label: 'Suppliers assessed', value: stats.ranked, detail: `${stats.total} assigned`, icon: Users },
    { id: 'avg-esg-score', label: 'Avg ESG score', value: displayScore(stats.averages.esg), detail: 'Across assessed suppliers', icon: Target },
    { id: 'top-performer', label: 'Top performer', value: topSupplier ? displayScore(topSupplier.overall_score) : '—', detail: topSupplier?.company_name || 'No score available', icon: Trophy },
    { id: 'needs-attention', label: 'Needs attention', value: needsAttentionCount, detail: 'Below 60 overall', icon: TriangleAlert },
  ];

  return <TooltipProvider><div className="space-y-6" data-testid="supplier-ranking">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5" data-testid="supplier-ranking-header">
      <div><p className="text-xs font-medium uppercase tracking-wide text-stone-500">Supplier assessment · {reportingPeriod}</p><h1 className="mt-1 text-3xl font-semibold text-stone-900">Supplier Rankings</h1><p className="mt-1 text-sm text-stone-500">Overall supplier performance across submitted ESG and GHG assessments.</p></div>
      <div className="flex items-center gap-2 text-xs text-stone-500" data-testid="supplier-ranking-score-key"><span className="h-2 w-2 rounded-full bg-emerald-500" />80–100 <span className="h-2 w-2 rounded-full bg-blue-500" />60–79 <span className="h-2 w-2 rounded-full bg-amber-500" />40–59 <span className="h-2 w-2 rounded-full bg-rose-500" />0–39</div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="supplier-ranking-kpis">
      {kpis.map((kpi) => { const Icon = kpi.icon; return <Card key={kpi.id} className="border-stone-200 shadow-none" data-testid={`kpi-${kpi.id}`}><CardContent className="flex items-start justify-between p-4"><div><p className="text-xs font-medium uppercase tracking-wide text-stone-500">{kpi.label}</p><p className="mt-2 text-2xl font-semibold text-stone-900" data-testid={`kpi-${kpi.id}-value`}>{kpi.value}</p><p className="mt-1 truncate text-xs text-stone-500">{kpi.detail}</p></div><Icon className="h-5 w-5 text-stone-400" /></CardContent></Card>; })}
    </section>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
      <TabsList className="grid w-full grid-cols-2 md:max-w-2xl md:grid-cols-4" data-testid="supplier-ranking-tabs"><TabsTrigger value="overview" data-testid="supplier-ranking-overview-tab">Overview</TabsTrigger><TabsTrigger value="esg" data-testid="supplier-ranking-esg-tab">ESG analysis</TabsTrigger><TabsTrigger value="emissions" data-testid="supplier-ranking-emissions-tab">Emissions</TabsTrigger><TabsTrigger value="table" data-testid="supplier-ranking-details-tab">Detailed rankings</TabsTrigger></TabsList>

      <TabsContent value="overview" className="space-y-5" data-testid="supplier-ranking-overview">
        <section className="grid gap-3 md:grid-cols-3" data-testid="supplier-performance-bands">
          {[{ id: 'excellent', label: 'Excellent', count: stats.score_distribution.excellent || 0, score: 80 }, { id: 'good', label: 'Good', count: stats.score_distribution.good || 0, score: 60 }, { id: 'needs-attention', label: 'Needs attention', count: needsAttentionCount, score: 0 }].map((band) => { const style = scoreBand(band.score); return <div key={band.id} className="flex items-center gap-3 border border-stone-200 bg-white p-4" data-testid={`performance-band-${band.id}`}><span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} /><div><p className="text-sm font-semibold text-stone-900">{band.label}</p><p className="mt-0.5 text-xs text-stone-500" data-testid={`performance-band-${band.id}-count`}>{band.count} supplier{band.count === 1 ? '' : 's'}</p></div></div>; })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <Card className="border-stone-200 shadow-none" data-testid="top-performing-suppliers-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base">Top Performing Suppliers</CardTitle></CardHeader><CardContent className="space-y-4 pt-5">{loading ? <p className="text-sm text-stone-500" data-testid="top-performing-loading">Loading performance…</p> : scoredRankings.length === 0 ? <p className="text-sm text-stone-500" data-testid="top-performing-empty">No overall scores are available yet.</p> : scoredRankings.slice(0, 5).map((supplier) => { const band = scoreBand(supplier.overall_score); return <div key={supplier.supplier_id} className="grid grid-cols-[minmax(6rem,1fr)_minmax(8rem,2fr)_2.5rem] items-center gap-3" data-testid={`top-performing-${supplier.supplier_id}`}><span className="truncate text-sm font-medium text-stone-800">{supplier.company_name}</span><div className="h-2 overflow-hidden bg-stone-100"><div className={`h-full ${band.bar}`} style={{ width: `${Math.min(100, Math.max(0, supplier.overall_score))}%` }} /></div><span className="text-right text-sm font-semibold text-stone-900">{displayScore(supplier.overall_score)}</span></div>; })}</CardContent></Card>

          <Card className="border-stone-200 shadow-none" data-testid="attention-required-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="flex items-center gap-2 text-base"><TriangleAlert className="h-4 w-4 text-amber-600" />Attention Required</CardTitle></CardHeader><CardContent className="space-y-3 pt-5">{attentionRequired.length === 0 ? <div className="flex items-center gap-2 text-sm text-stone-500" data-testid="attention-required-empty"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No suppliers need attention.</div> : attentionRequired.map((supplier) => <div key={supplier.supplier_id} className="border-b border-stone-100 pb-3 last:border-0 last:pb-0" data-testid={`attention-supplier-${supplier.supplier_id}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-stone-900">{supplier.company_name}</p><p className="mt-1 text-xs text-stone-500">{(supplier.attention_reasons || ['Assessment needs review']).slice(0, 2).join(' · ')}</p></div><span className="text-sm font-semibold text-stone-800">{displayScore(supplier.overall_score)}</span></div><div className="mt-2 flex items-center justify-between"><span className="text-xs text-stone-500">Environment {displayScore(supplier.environment_score)} · Social {displayScore(supplier.social_score)} · Governance {displayScore(supplier.governance_score)} · GHG {displayScore(supplier.ghg_score)}</span><Button variant="ghost" size="sm" onClick={() => viewSupplier(supplier.supplier_id)} data-testid={`review-attention-supplier-${supplier.supplier_id}`}>Review <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>)}</CardContent></Card>
        </section>
      </TabsContent>

      <TabsContent value="esg" className="space-y-5" data-testid="supplier-ranking-esg-analysis"><section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Card className="border-stone-200 shadow-none" data-testid="average-esg-scores-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base">Average ESG Scores</CardTitle></CardHeader><CardContent className="space-y-5 pt-5"><PerformanceBar label="Environment" value={stats.averages.environment} testId="average-environment-score" /><PerformanceBar label="Social" value={stats.averages.social} testId="average-social-score" /><PerformanceBar label="Governance" value={stats.averages.governance} testId="average-governance-score" /></CardContent></Card><Card className="border-stone-200 shadow-none" data-testid="supplier-esg-comparison-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base">Supplier ESG Comparison</CardTitle></CardHeader><CardContent className="divide-y divide-stone-100 pt-2">{loading ? <p className="py-4 text-sm text-stone-500" data-testid="supplier-esg-comparison-loading">Loading ESG scores…</p> : esgRankings.length === 0 ? <p className="py-4 text-sm text-stone-500" data-testid="supplier-esg-comparison-empty">No supplier ESG assessments are available yet.</p> : esgRankings.slice(0, 8).map((supplier) => <div key={supplier.supplier_id} className="grid grid-cols-[minmax(7rem,1fr)_auto_auto_auto] items-center gap-3 py-3" data-testid={`supplier-esg-comparison-${supplier.supplier_id}`}><span className="truncate text-sm font-medium text-stone-800">{supplier.company_name}</span>{['environment_score', 'social_score', 'governance_score'].map((field) => { const band = scoreBand(supplier[field]); return <Badge key={field} variant="outline" className={`justify-center text-xs ${band.badge}`}>{displayScore(supplier[field])}</Badge>; })}</div>)}</CardContent></Card></section></TabsContent>

      <TabsContent value="emissions" className="space-y-5" data-testid="supplier-ranking-emissions"><section className="grid gap-3 sm:grid-cols-3" data-testid="emissions-summary"><Card className="border-stone-200 shadow-none"><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-stone-500">Scope 1</p><p className="mt-2 text-2xl font-semibold text-stone-900" data-testid="scope1-emissions-total">{Number(stats.emissions_by_scope.scope1 || 0).toLocaleString()}</p><p className="mt-1 text-xs text-stone-500">tCO₂e</p></CardContent></Card><Card className="border-stone-200 shadow-none"><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-stone-500">Scope 2</p><p className="mt-2 text-2xl font-semibold text-stone-900" data-testid="scope2-emissions-total">{Number(stats.emissions_by_scope.scope2 || 0).toLocaleString()}</p><p className="mt-1 text-xs text-stone-500">tCO₂e</p></CardContent></Card><Card className="border-stone-200 shadow-none"><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-stone-500">Total emissions</p><p className="mt-2 text-2xl font-semibold text-stone-900" data-testid="total-emissions-value">{Number(stats.emissions_by_scope.total || 0).toLocaleString()}</p><p className="mt-1 text-xs text-stone-500">tCO₂e</p></CardContent></Card></section><Card className="border-stone-200 shadow-none" data-testid="supplier-emissions-list-card"><CardHeader className="border-b border-stone-100 pb-4"><CardTitle className="text-base">Emissions by Supplier</CardTitle></CardHeader><CardContent className="divide-y divide-stone-100 pt-2">{rankings.filter((supplier) => supplier.total_emissions > 0).length === 0 ? <p className="py-4 text-sm text-stone-500" data-testid="supplier-emissions-empty">No submitted supplier emissions are available.</p> : rankings.filter((supplier) => supplier.total_emissions > 0).sort((a, b) => b.total_emissions - a.total_emissions).map((supplier) => <div key={supplier.supplier_id} className="grid grid-cols-[minmax(8rem,1fr)_auto_auto_auto] items-center gap-4 py-3" data-testid={`supplier-emissions-${supplier.supplier_id}`}><span className="truncate text-sm font-medium text-stone-800">{supplier.company_name}</span><span className="text-xs text-stone-500">Scope 1 {Number(supplier.scope1_emissions || 0).toLocaleString()}</span><span className="text-xs text-stone-500">Scope 2 {Number(supplier.scope2_emissions || 0).toLocaleString()}</span><span className="text-sm font-semibold text-stone-900">{Number(supplier.total_emissions || 0).toLocaleString()}</span></div>)}</CardContent></Card></TabsContent>

      <TabsContent value="table" data-testid="supplier-ranking-detailed-table"><Card className="border-stone-200 shadow-none"><CardHeader className="gap-4 border-b border-stone-100 pb-4 md:flex-row md:items-center md:justify-between"><div><CardTitle className="text-base">Detailed Performance Rankings</CardTitle><p className="mt-1 text-sm text-stone-500">Supplier-level performance and assessment progress.</p></div><div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-1 text-xs text-stone-500">Overall score<Tooltip><TooltipTrigger asChild><button type="button" aria-label="About overall score" data-testid="overall-score-info-tooltip"><Info className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>Combined ESG + GHG performance score, with revenue where configured.</TooltipContent></Tooltip></div><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search suppliers" className="h-9 w-48" data-testid="ranking-supplier-search-input" /></div></CardHeader><CardContent className="p-0">{loading ? <p className="p-6 text-sm text-stone-500" data-testid="ranking-table-loading">Loading rankings…</p> : filteredRankings.length === 0 ? <p className="p-6 text-sm text-stone-500" data-testid="ranking-table-empty">No suppliers match your search.</p> : <div>{filteredRankings.map((supplier) => { const band = scoreBand(supplier.overall_score); return <article key={supplier.supplier_id} className="group grid gap-3 border-b border-stone-100 px-5 py-4 last:border-0 md:grid-cols-[2.5rem_minmax(0,1fr)_auto] md:items-center" data-testid={`supplier-row-${supplier.supplier_id}`}><RankMark rank={supplier.rank} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-stone-900">{supplier.company_name}</p><Badge variant="outline" className={`text-[11px] ${statusClass(supplier.completion_status)}`} data-testid={`supplier-status-${supplier.supplier_id}`}>{supplier.status_label || supplier.completion_status}</Badge>{supplier.question_progress && <span className="text-xs text-stone-500" data-testid={`supplier-progress-${supplier.supplier_id}`}>{supplier.question_progress}</span>}</div><div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1"><MetricLine label="Environment" value={supplier.environment_score} /><span className="text-stone-300">·</span><MetricLine label="Social" value={supplier.social_score} /><span className="text-stone-300">·</span><MetricLine label="Governance" value={supplier.governance_score} /><span className="text-stone-300">·</span><MetricLine label="GHG" value={supplier.ghg_score} /></div></div><div className="flex items-center justify-between gap-3 md:justify-end"><Badge variant="outline" className={`px-2.5 py-1 text-sm font-semibold ${band.badge}`} data-testid={`supplier-overall-score-${supplier.supplier_id}`}>{displayScore(supplier.overall_score)} <span className="ml-1 text-xs font-medium">{band.label}</span></Badge><Button variant="ghost" size="sm" className="opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100" onClick={() => viewSupplier(supplier.supplier_id)} data-testid={`view-supplier-${supplier.supplier_id}`}>View <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div></article>; })}</div>}</CardContent></Card></TabsContent>
    </Tabs>
  </div></TooltipProvider>;
}