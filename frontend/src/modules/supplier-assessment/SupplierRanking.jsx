import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BarChart3, CalendarDays, ChartLine, ChartPie, CloudDownload, Target, Trophy, TriangleAlert, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { Card, CardContent } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { TooltipProvider } from '../../components/ui/tooltip';
import { DetailedRankingTab } from './components/ranking/DetailedRankingTab';
import { RankingEmissionsTab } from './components/ranking/RankingEmissionsTab';
import { RankingEsgTab } from './components/ranking/RankingEsgTab';
import { RankingOverviewTab } from './components/ranking/RankingOverviewTab';
import { SupplierRankingDetailDialog } from './components/ranking/SupplierRankingDetailDialog';
import { hasValue, moduleName, scoreText } from './components/ranking/rankingUtils';
import { buildSupplierEmissionsAnalytics } from './utils/supplierEmissionsAnalytics';

const buildRiskMatrix = (rankings, supplierTotals) => {
  const emissionsBySupplier = new Map(supplierTotals.map((row) => [row.supplier_id, row.total_emissions]));
  const rows = rankings.filter((row) => hasValue(row.esg_score)).map((row) => ({ supplier_id: row.supplier_id, company_name: row.company_name, esg_score: Number(row.esg_score), attributed_emissions: Number(emissionsBySupplier.get(row.supplier_id) || 0) }));
  const values = rows.map((row) => row.attributed_emissions).sort((first, second) => first - second);
  const emissionsThreshold = values.length ? values[Math.floor(values.length / 2)] : 0;
  const groupCounts = { critical: 0, strategic: 0, priority: 0, developing: 0 };
  const categorized = rows.map((row) => { const highEmissions = row.attributed_emissions >= emissionsThreshold && (emissionsThreshold > 0 || row.attributed_emissions > 0); const group = highEmissions ? row.esg_score >= 60 ? 'priority' : 'critical' : row.esg_score >= 60 ? 'strategic' : 'developing'; groupCounts[group] += 1; return { ...row, group }; });
  return { rows: categorized, emissionsThreshold, maxEmissions: Math.max(1, ...values) * 1.12, groupCounts };
};

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const EMPTY_SUBMITTED_EMISSIONS = { emissions: [], supplier_totals: [] };

const RankingMetric = ({ id, label, value, detail, Icon, tone = 'stone' }) => {
  const tones = { stone: 'bg-stone-100 text-stone-600', emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700' };
  const edge = { rose: 'bg-rose-500', emerald: 'bg-emerald-500', amber: 'bg-amber-400', stone: 'bg-slate-300' }[tone];
  return <Card className="group overflow-hidden rounded-lg border-stone-200 bg-gradient-to-br from-white via-white to-stone-50 shadow-[0_6px_18px_rgba(28,25,23,0.06)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_12px_28px_rgba(28,25,23,0.1)]" data-testid={`supplier-ranking-${id}-metric`}><CardContent className="relative flex min-h-[132px] flex-col justify-between p-5"><span className={`absolute left-0 top-0 h-full w-1 ${edge}`} /><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-white ${tones[tone]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span></div><div><p className="text-3xl font-semibold text-stone-950" data-testid={`supplier-ranking-${id}-value`}>{value}</p><p className="mt-1 truncate text-sm text-stone-500" data-testid={`supplier-ranking-${id}-detail`}>{detail}</p></div></CardContent></Card>;
};

export default function SupplierRanking() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  const [rankings, setRankings] = useState([]);
  const [stats, setStats] = useState({ total: 0, ranked: 0, averages: {}, score_distribution: {}, module_summary: {} });
  const [submittedEmissions, setSubmittedEmissions] = useState(EMPTY_SUBMITTED_EMISSIONS);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [rankingPage, setRankingPage] = useState(1);
  const [rankingSort, setRankingSort] = useState({ key: 'esg_score', direction: 'desc' });
  const [moduleFilter, setModuleFilter] = useState('all');
  const [supplier, setSupplier] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rankingResult, emissionsResult] = await Promise.allSettled([
        axios.get(`${API}/supplier-assessment/rankings?reporting_period=${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/emissions/all?reporting_period=${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() }),
      ]);
      if (rankingResult.status === 'rejected') throw rankingResult.reason;
      const data = rankingResult.value.data;
      setRankings(data.rankings || []);
      setStats({ total: data.total_suppliers || 0, ranked: data.ranked_suppliers || 0, averages: data.averages || {}, score_distribution: data.score_distribution || {}, module_summary: data.module_summary || {} });
      if (emissionsResult.status === 'fulfilled') setSubmittedEmissions(emissionsResult.value.data || EMPTY_SUBMITTED_EMISSIONS);
      else { setSubmittedEmissions(EMPTY_SUBMITTED_EMISSIONS); toast.error('Failed to load emissions analytics'); }
    } catch { toast.error('Failed to load rankings'); } finally { setLoading(false); }
  }, [getAuthHeader, reportingPeriod]);

  useEffect(() => { load(); }, [load]);
  const overall = useMemo(() => rankings.filter((row) => hasValue(row.overall_score)).sort((a, b) => b.overall_score - a.overall_score), [rankings]);
  const esg = useMemo(() => rankings.filter((row) => hasValue(row.esg_score)).sort((a, b) => b.esg_score - a.esg_score), [rankings]);
  const emissionsAnalytics = useMemo(() => buildSupplierEmissionsAnalytics(submittedEmissions, reportingPeriod), [submittedEmissions, reportingPeriod]);
  const riskMatrix = useMemo(() => buildRiskMatrix(rankings, emissionsAnalytics.supplierTotals), [rankings, emissionsAnalytics.supplierTotals]);
  const rows = useMemo(() => rankings.filter((row) => row.company_name.toLowerCase().includes(search.trim().toLowerCase())).sort((first, second) => { const firstValue = first[rankingSort.key]; const secondValue = second[rankingSort.key]; if (!hasValue(firstValue)) return hasValue(secondValue) ? 1 : 0; if (!hasValue(secondValue)) return -1; return (Number(firstValue) - Number(secondValue)) * (rankingSort.direction === 'asc' ? 1 : -1); }), [rankings, rankingSort, search]);
  const overdueSuppliers = useMemo(() => rankings.filter((row) => (row.overdue_modules || []).length > 0), [rankings]);
  const attention = useMemo(() => overdueSuppliers.slice(0, 5), [overdueSuppliers]);
  const distribution = [{ name: 'Excellent', value: stats.score_distribution.excellent || 0, color: '#10b981' }, { name: 'Good', value: stats.score_distribution.good || 0, color: '#3b82f6' }, { name: 'Needs improvement', value: stats.score_distribution.average || 0, color: '#f59e0b' }, { name: 'Critical', value: stats.score_distribution.poor || 0, color: '#ef4444' }];
  const modules = Object.entries(stats.module_summary || {}).map(([code, item]) => ({ code, name: moduleName(code), completion: item.average_completion || 0 }));
  const visibleModules = moduleFilter === 'all' ? modules : modules.filter((item) => item.code === moduleFilter);
  const rankingPageSize = 8;
  const rankingPageCount = Math.max(1, Math.ceil(rows.length / rankingPageSize));
  const visibleRankingRows = rows.slice((rankingPage - 1) * rankingPageSize, rankingPage * rankingPageSize);
  const rankingStart = rows.length ? (rankingPage - 1) * rankingPageSize + 1 : 0;
  const rankingEnd = Math.min(rankingPage * rankingPageSize, rows.length);
  const top = overall[0];
  const needCount = overdueSuppliers.length;
  const metrics = [{ id: 'assessed', label: 'Suppliers assessed', value: stats.ranked, detail: `${stats.total} assigned`, Icon: Users, tone: 'stone' }, { id: 'esg', label: 'Avg ESG score', value: scoreText(stats.averages.esg), detail: 'Across submitted ESG assessments', Icon: Target, tone: 'emerald' }, { id: 'top', label: 'Top performer', value: scoreText(top?.overall_score), detail: top?.company_name || 'No overall score yet', Icon: Trophy, tone: 'amber' }, { id: 'attention', label: 'Overdue follow-up', value: needCount, detail: 'Incomplete tasks past due', Icon: TriangleAlert, tone: 'rose' }];

  const openDetail = async (row) => { setSupplier(row); setDetail(null); try { const { data } = await axios.get(`${API}/supplier-assessment/suppliers/${row.supplier_id}/submission-status`, { headers: getAuthHeader() }); setDetail(data); } catch { toast.error('Could not load supplier assessment details'); } };
  const toggleRankingSort = (key) => { setRankingSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' })); setRankingPage(1); };
  const switchToDetails = () => setTab('table');
  const updateSearch = (value) => { setSearch(value); setRankingPage(1); };

  return <TooltipProvider><div className="space-y-7" data-testid="supplier-ranking">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5" data-testid="supplier-ranking-header"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 shadow-sm" data-testid="supplier-ranking-heading-icon"><Trophy className="h-6 w-6" aria-hidden="true" /></div><h1 className="text-3xl font-bold text-emerald-950" data-testid="supplier-ranking-heading">Supplier rankings</h1></div><div className="w-full shrink-0 sm:w-48" data-testid="supplier-ranking-period-control"><label htmlFor="supplier-ranking-reporting-period" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-600"><CalendarDays className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />Reporting period</label><Select value={reportingPeriod} onValueChange={setReportingPeriod}><SelectTrigger id="supplier-ranking-reporting-period" className="w-full bg-white" data-testid="supplier-ranking-reporting-period-selector"><SelectValue /></SelectTrigger><SelectContent data-testid="supplier-ranking-reporting-period-menu">{periods.map((period) => <SelectItem key={period} value={period} data-testid={`supplier-ranking-period-option-${period}`}>{period}</SelectItem>)}</SelectContent></Select></div></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Supplier ranking summary">{metrics.map((item) => <RankingMetric key={item.id} {...item} />)}</section>
    <Tabs value={tab} onValueChange={setTab} className="space-y-6"><TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b border-stone-200 bg-transparent p-0 md:max-w-3xl md:grid-cols-4" data-testid="supplier-ranking-tabs"><TabsTrigger value="overview" className="relative h-12 justify-start gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 text-stone-500 shadow-none hover:text-stone-900 data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none data-[state=active]:[&>svg]:text-emerald-600" data-testid="supplier-ranking-overview-tab"><ChartPie className="h-4 w-4" aria-hidden="true" />Overview</TabsTrigger><TabsTrigger value="esg" className="relative h-12 justify-start gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 text-stone-500 shadow-none hover:text-stone-900 data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none data-[state=active]:[&>svg]:text-emerald-600" data-testid="supplier-ranking-esg-tab"><ChartLine className="h-4 w-4" aria-hidden="true" />ESG analysis</TabsTrigger><TabsTrigger value="emissions" className="relative h-12 justify-start gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 text-stone-500 shadow-none hover:text-stone-900 data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none data-[state=active]:[&>svg]:text-emerald-600" data-testid="supplier-ranking-emissions-tab"><CloudDownload className="h-4 w-4" aria-hidden="true" />Emissions</TabsTrigger><TabsTrigger value="table" className="relative h-12 justify-start gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 text-stone-500 shadow-none hover:text-stone-900 data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none data-[state=active]:[&>svg]:text-emerald-600" data-testid="supplier-ranking-details-tab"><BarChart3 className="h-4 w-4" aria-hidden="true" />Detailed rankings</TabsTrigger></TabsList>
      <TabsContent value="overview">{tab === 'overview' && <RankingOverviewTab attention={attention} distribution={distribution} moduleFilter={moduleFilter} modules={modules} needCount={needCount} onModuleFilterChange={setModuleFilter} onReview={openDetail} onViewAll={switchToDetails} overall={overall} riskMatrix={riskMatrix} statusRows={rankings} visibleModules={visibleModules} />}</TabsContent>
      <TabsContent value="esg">{tab === 'esg' && <RankingEsgTab averages={stats.averages} distribution={distribution} esg={esg} onReview={openDetail} onViewRankings={switchToDetails} overall={overall} />}</TabsContent>
      <TabsContent value="emissions">{tab === 'emissions' && <RankingEmissionsTab emissions={emissionsAnalytics.supplierTotals} emissionsAnalytics={emissionsAnalytics} reportingPeriod={reportingPeriod} scopeTotals={emissionsAnalytics.scopeTotals} />}</TabsContent>
      <TabsContent value="table">{tab === 'table' && <DetailedRankingTab loading={loading} onPageChange={setRankingPage} onRefresh={load} onReview={openDetail} onSearchChange={updateSearch} onSort={toggleRankingSort} page={rankingPage} pageCount={rankingPageCount} rankingEnd={rankingEnd} rankingStart={rankingStart} rows={rows} search={search} sort={rankingSort} visibleRows={visibleRankingRows} />}</TabsContent>
    </Tabs>
    <SupplierRankingDetailDialog detail={detail} supplier={supplier} onClose={() => setSupplier(null)} />
  </div></TooltipProvider>;
}