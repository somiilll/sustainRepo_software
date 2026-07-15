import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Activity, CreditCard, Droplets, Leaf, RefreshCw, Repeat, Trash2, Users, Zap } from 'lucide-react';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import StickyFilterBar from './components/filters/StickyFilterBar';
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import { AnalyticsChartCard } from './components/analytics/AnalyticsChartCard';
import { ScopeBreakdownCard } from './components/analytics/ScopeBreakdownCard';
import { GovernanceSummaryCard } from './components/analytics/GovernanceSummaryCard';
import { useIntensityData } from './hooks/useIntensityData';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MONTH = 'monthly';
const COLORS = ['#7C3AED', '#EC4899', '#14B8A6', '#F59E0B', '#EF4444', '#4F46E5', '#78716C'];

const aggregateSeries = (rows, granularity, keys) => {
  if (granularity === MONTH) return rows;
  const groups = new Map();
  rows.forEach((row) => {
    const month = Number(row.period?.slice(5, 7));
    const group = granularity === 'quarterly' ? `${row.period.slice(0, 4)} Q${Math.ceil(month / 3)}` : row.period?.slice(0, 4);
    const current = groups.get(group) || { period: group, count: 0 };
    keys.forEach((key) => { current[key] = (current[key] || 0) + Number(row[key] || 0); });
    current.count += 1;
    groups.set(group, current);
  });
  return Array.from(groups.values()).map((row) => ({ ...row, ...Object.fromEntries(keys.filter((key) => key.toLowerCase().includes('pct') || key === 'turnover' || key === 'ltifr' || key === 'apDays' || key === 'cashConversion').map((key) => [key, row[key] / row.count])) }));
};

const percentageSeries = (rows, numerator, denominator, output) => rows.map((row) => ({ ...row, [output]: row[denominator] ? (row[numerator] / row[denominator]) * 100 : 0 }));

const DiversityCard = ({ data }) => {
  const segments = [{ name: 'Female', value: data?.female || 0 }, { name: 'Male', value: data?.male || 0 }, { name: 'Under 30', value: data?.under_30 || 0 }, { name: '30–50', value: data?.age_30_50 || 0 }, { name: 'Over 50', value: data?.over_50 || 0 }, { name: 'Minority', value: data?.minority || 0 }, { name: 'Vulnerable', value: data?.vulnerable || 0 }].filter((segment) => segment.value > 0);
  return <section className="relative min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-stone-700 dark:bg-stone-900" data-testid="employee-diversity-card"><div className="absolute inset-x-0 top-0 h-1 bg-[#7C3AED]" /><h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Employee Diversity</h3><p className="mt-0.5 text-xs text-stone-500">Workforce composition</p>{segments.length ? <><div className="mt-2 h-44"><ResponsiveContainer><PieChart><Pie data={segments} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>{segments.map((segment, index) => <Cell key={segment.name} fill={COLORS[index]} />)}</Pie><Tooltip formatter={(value) => Number(value).toLocaleString()} /></PieChart></ResponsiveContainer></div><div className="grid grid-cols-2 gap-x-3 gap-y-1.5">{segments.map((segment, index) => <div className="flex items-center justify-between text-[11px]" key={segment.name}><span className="flex items-center gap-1.5 text-stone-600"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index] }} />{segment.name}</span><span className="font-semibold text-stone-800">{Number(segment.value).toLocaleString()}</span></div>)}</div></> : <div className="flex h-[236px] items-center justify-center text-sm text-stone-400" data-testid="employee-diversity-empty">No workforce data for these filters</div>}</section>;
};

export default function ExecutiveAnalyticsDashboard({ data }) {
  const { getAuthHeader } = useAuth();
  const { stats, loading, organization, facilities, selectedFacilities, setSelectedFacilities, dateRange, setDateRange, showFilters, setShowFilters, showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef, filteredData, isLive, getPreviousFinancialYear } = data;
  const [analytics, setAnalytics] = useState(null);
  const [summary, setSummary] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [granularity, setGranularity] = useState(MONTH);
  const [activeScopes, setActiveScopes] = useState([]);
  const [drilldown, setDrilldown] = useState(null);
  const { productionQty, productionUnit } = useIntensityData(dateRange, selectedFacilities);

  useEffect(() => {
    if (!dateRange.from || !dateRange.to) return;
    const load = async () => {
      setAnalyticsLoading(true);
      const params = { start_date: format(dateRange.from, 'yyyy-MM'), end_date: format(dateRange.to, 'yyyy-MM'), facility_ids: selectedFacilities.length ? selectedFacilities.join(',') : undefined };
      const [analyticsResponse, metricsResponse, summaryResponse] = await Promise.all([
        axios.get(`${API}/dashboard/esg-analytics`, { headers: getAuthHeader(), params }).catch(() => ({ data: null })),
        axios.get(`${API}/esg-records/dashboard-metrics`, { headers: getAuthHeader(), params }).catch(() => ({ data: null })),
        axios.get(`${API}/dashboard/esg-summary`, { headers: getAuthHeader() }).catch(() => ({ data: null })),
      ]);
      setAnalytics(analyticsResponse.data);
      setMetrics(metricsResponse.data);
      setSummary(summaryResponse.data);
      setAnalyticsLoading(false);
    };
    load();
  }, [dateRange, selectedFacilities, getAuthHeader]);

  console.log("filteredData", filteredData)
  console.log("metrics", metrics)
  const totals = filteredData?.totals || {};
  const emissionData = metrics?.emissions?.ghg_emissions || {};
  const scope12 = (emissionData.total_scope1 || 0) + (emissionData.total_scope2 || 0);
  const totalEmissions = emissionData.total ?? totals.total ?? 0;
  const totalEnergy = metrics?.energy?.total || 0;
  const energyIntensity = productionQty ? totalEnergy / productionQty : null;
  const ghgIntensity = productionQty ? scope12 / productionQty : null;
  const scopeTotals = { scope1: totals.scope1 || emissionData.total_scope1 || 0, scope2: totals.scope2 || emissionData.total_scope2 || 0, scope3: totals.scope3 || emissionData.total_scope3 || 0 };
  const toggleScope = (scope) => setActiveScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  const filterProps = { dateRange, setDateRange, facilities, selectedFacilities, setSelectedFacilities, showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef, getPreviousFinancialYear };
  const analyticsData = analytics || { emissions: [], energy: [], water: [], waste: [], workforce: [], safety: [], finance: [], breaches: [], governance: {} };
  console.log("analyticsData", analyticsData)
  const emissionRows = aggregateSeries(analyticsData.emissions, granularity, ['scope1', 'scope2', 'scope3', 'previousTotal']);
  const energyRows = aggregateSeries(analyticsData.energy, granularity, ['renewable', 'nonRenewable']);
  const waterRows = aggregateSeries(analyticsData.water, granularity, ['withdrawn', 'consumed', 'discharged', 'recycled']);
  const wasteRows = aggregateSeries(analyticsData.waste, granularity, ['generated', 'recovered', 'disposed']);
  const workforceRows = aggregateSeries(analyticsData.workforce, granularity, ['employees', 'turnover', 'ltifr', 'lostTimeInjuries']);
  const safetyRows = aggregateSeries(analyticsData.safety, granularity, ['fatalities', 'lostTimeInjuries', 'nearMisses']);
  const financeRows = aggregateSeries(analyticsData.finance, granularity, ['apDays', 'aging0to30', 'aging31to60', 'aging61to90', 'agingOver90', 'cashConversion']);
  const breachRows = aggregateSeries(analyticsData.breaches, granularity, ['breaches', 'confidentiality', 'integrity', 'availability', 'privacy']);
  const renewableRows = percentageSeries(energyRows, 'renewable', 'renewable', 'renewablePct').map((row) => ({ ...row, renewablePct: row.renewable + row.nonRenewable ? (row.renewable / (row.renewable + row.nonRenewable)) * 100 : 0 }));
  const recyclingRows = percentageSeries(waterRows, 'recycled', 'withdrawn', 'recyclingPct');
  const intensityRows = energyRows.map((row) => ({ ...row, energyIntensity: productionQty ? (row.renewable + row.nonRenewable) / productionQty : 0 }));
  const incidentCategoryRows = [{ period: 'Categories', confidentiality: breachRows.reduce((sum, row) => sum + row.confidentiality, 0), integrity: breachRows.reduce((sum, row) => sum + row.integrity, 0), availability: breachRows.reduce((sum, row) => sum + row.availability, 0), privacy: breachRows.reduce((sum, row) => sum + row.privacy, 0) }];
  const emissionSeries = [{ key: 'scope1', label: 'Scope 1', color: '#15803D' }, { key: 'scope2', label: 'Scope 2', color: '#2563EB' }, { key: 'scope3', label: 'Scope 3', color: '#7C3AED' }].filter((item) => activeScopes.length === 0 || activeScopes.includes(item.key));
  emissionSeries.push({ key: 'previousTotal', label: 'Previous Year', color: '#A8A29E' });
  const yearValue = dateRange.from ? String(dateRange.from.getFullYear()) : '';

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center" data-testid="executive-esg-loading"><RefreshCw className="h-8 w-8 animate-spin text-emerald-700" /></div>;
  return <div className="space-y-6 pb-10" data-testid="executive-esg-dashboard"><StickyFilterBar title={organization?.name ? `${organization.name} · Executive ESG Dashboard` : 'Executive ESG Dashboard'} subtitle={dateRange.from && dateRange.to ? `Reporting window: ${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}` : 'Reporting window'} liveBadge={isLive ? <span className="text-[10px] font-semibold text-emerald-700">LIVE</span> : null} showFilters={showFilters} setShowFilters={setShowFilters} filterProps={filterProps} onExport={() => window.print()} showExport dashboardType={data.dashboardType} setDashboardType={data.setDashboardType} esgSection={data.esgSection} setEsgSection={data.setEsgSection} showDashboardToggle={data.showDashboardToggle} />
    {/* <div className="flex flex-wrap items-center justify-between gap-3 border-y border-stone-200 py-3" data-testid="analytics-controls"><div><p className="text-xs font-semibold uppercase text-stone-500">Analytics view</p><p className="text-sm text-stone-700">Use scope cards and chart points to explore reported activity.</p></div><label className="flex items-center gap-2 text-xs font-medium text-stone-600">Reporting year<select value={yearValue} onChange={(event) => { const year = Number(event.target.value); setDateRange({ from: new Date(`${year}-04-01`), to: new Date(`${year + 1}-03-01`) }); }} className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-800" data-testid="global-year-selector">{[yearValue, String(Number(yearValue || new Date().getFullYear()) - 1), String(Number(yearValue || new Date().getFullYear()) - 2)].filter((item, index, values) => item && values.indexOf(item) === index).map((year) => <option key={year} value={year}>FY {year}-{String(Number(year) + 1).slice(-2)}</option>)}</select></label></div> */}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5" data-testid="top-kpi-row"><PremiumKpiCard title="Total Emissions" value={totalEmissions} unit="tCO₂e" icon={Leaf} accentColor="#15803D" loading={analyticsLoading} /><PremiumKpiCard title="GHG Intensity (Production)" value={ghgIntensity} unit={`tCO₂e/${productionUnit || 'unit produced'}`} icon={Leaf} accentColor="#0F766E" loading={analyticsLoading} /><PremiumKpiCard title="Energy Intensity (Production)" value={energyIntensity} unit={`MWh/${productionUnit || 'unit produced'}`} icon={Zap} accentColor="#F59E0B" loading={analyticsLoading} /><PremiumKpiCard title="Renewable Energy" value={metrics?.energy?.renewable_pct} unit="%" icon={Zap} accentColor="#84CC16" loading={analyticsLoading} /><PremiumKpiCard title="Water Recycled" value={metrics?.water?.recycled} unit="KL" icon={Droplets} accentColor="#0284C7" loading={analyticsLoading} /><PremiumKpiCard title="Waste Recovery" value={metrics?.waste?.recovered} unit="MT" icon={Trash2} accentColor="#57534E" loading={analyticsLoading} /><PremiumKpiCard title="Employees" value={summary?.kpis?.total_employees?.value} secondaryLabel="Female Workforce" secondaryValue={summary?.kpis?.diversity_pct?.value} secondaryUnit="%" secondaryTestId="kpi-employees-female-workforce" unit="" icon={Users} accentColor="#7C3AED" /><PremiumKpiCard title="LTIFR" value={summary?.kpis?.ltifr?.value} unit="" icon={Activity} accentColor="#DC2626" /><PremiumKpiCard title="Accounts Payable Days" value={summary?.kpis?.ap_days?.value} unit="days" icon={CreditCard} accentColor="#4F46E5" /><PremiumKpiCard title="Employee Turnover" value={summary?.kpis?.turnover_pct?.value} unit="%" icon={Repeat} accentColor="#F97316" /></div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12"><div className="xl:col-span-8"><AnalyticsChartCard title="GHG Emission Trend" subtitle="Scope emissions with previous-year comparison" data={emissionRows} series={emissionSeries} chartType="line" accent="#15803D" unit="tCO₂e" testId="ghg-emission-trend" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /></div><div className="xl:col-span-4"><ScopeBreakdownCard totals={scopeTotals} activeScopes={activeScopes} onToggleScope={toggleScope} onFullscreen={() => setDrilldown({ title: 'Scope Breakdown', point: scopeTotals })} /></div></div>
    <div className="flex justify-end gap-1" data-testid="emission-granularity-toggle">{[['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']].map(([value, label]) => <button type="button" key={value} onClick={() => setGranularity(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${granularity === value ? 'bg-[#1A4D2E] text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`} data-testid={`emission-granularity-${value}`}>{label}</button>)}</div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><AnalyticsChartCard title="Energy Mix" subtitle="Renewable and non-renewable consumption" data={energyRows} series={[{ key: 'renewable', label: 'Renewable', color: '#65A30D' }, { key: 'nonRenewable', label: 'Non-renewable', color: '#F97316' }]} chartType="bar" stacked accent="#F97316" unit="MWh" testId="energy-mix-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Renewable Energy Trend" subtitle="Renewable share of total energy" data={renewableRows} series={[{ key: 'renewablePct', label: 'Renewable %', color: '#65A30D' }]} accent="#65A30D" unit="%" testId="renewable-energy-trend" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Energy Intensity Trend" subtitle="Energy consumed per selected production quantity" data={intensityRows} series={[{ key: 'energyIntensity', label: 'Energy Intensity', color: '#F97316' }]} accent="#F97316" unit={`MWh/${productionUnit || 'unit'}`} testId="energy-intensity-trend" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /></div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><AnalyticsChartCard title="Water Flow" subtitle="Water volumes by operational stage" data={waterRows} series={[{ key: 'withdrawn', label: 'Withdrawn', color: '#0284C7' }, { key: 'consumed', label: 'Consumed', color: '#0EA5E9' }, { key: 'discharged', label: 'Discharged', color: '#64748B' }, { key: 'recycled', label: 'Recycled', color: '#14B8A6' }]} chartType="bar" stacked accent="#0284C7" unit="KL" testId="water-flow-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Water Recycling %" subtitle="Recycled water as a share of withdrawal" data={recyclingRows} series={[{ key: 'recyclingPct', label: 'Recycling %', color: '#0284C7' }]} accent="#0284C7" unit="%" testId="water-recycling-trend" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Waste Management" subtitle="Generated, recovered, and disposed" data={wasteRows} series={[{ key: 'generated', label: 'Generated', color: '#57534E' }, { key: 'recovered', label: 'Recovered', color: '#65A30D' }, { key: 'disposed', label: 'Disposed', color: '#EF4444' }]} chartType="bar" stacked accent="#57534E" unit="MT" testId="waste-management-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /></div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><AnalyticsChartCard title="Workforce Trend" subtitle="Reported employees over time" data={workforceRows} series={[{ key: 'employees', label: 'Employees', color: '#7C3AED' }]} chartType="area" accent="#7C3AED" testId="workforce-trend-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><DiversityCard data={summary?.diversity_breakdown} /><AnalyticsChartCard title="Employee Turnover" subtitle="Reported monthly turnover" data={workforceRows} series={[{ key: 'turnover', label: 'Turnover', color: '#F97316' }]} accent="#F97316" unit="%" testId="employee-turnover-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /></div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><AnalyticsChartCard title="LTIFR Trend" subtitle="Lost-time injury frequency rate" data={workforceRows} series={[{ key: 'ltifr', label: 'LTIFR', color: '#DC2626' }]} accent="#DC2626" testId="ltifr-trend-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Health & Safety Incidents" subtitle="Reported incidents by category" data={safetyRows} series={[{ key: 'fatalities', label: 'Fatalities', color: '#DC2626' }, { key: 'lostTimeInjuries', label: 'Lost Time Injuries', color: '#F97316' }, { key: 'nearMisses', label: 'Near Misses', color: '#F59E0B' }]} chartType="bar" accent="#DC2626" testId="safety-incidents-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Lost Time Injuries" subtitle="Monthly reported lost time injuries" data={safetyRows} series={[{ key: 'lostTimeInjuries', label: 'Lost Time Injuries', color: '#DC2626' }]} accent="#DC2626" testId="lost-time-injuries-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /></div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><AnalyticsChartCard title="Accounts Payable Days" subtitle="Days payable outstanding" data={financeRows} series={[{ key: 'apDays', label: 'AP Days', color: '#4F46E5' }]} accent="#4F46E5" unit="days" testId="ap-days-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Payment Aging" subtitle="Outstanding payables by aging bucket" data={financeRows} series={[{ key: 'aging0to30', label: '0–30 Days', color: '#65A30D' }, { key: 'aging31to60', label: '31–60 Days', color: '#F59E0B' }, { key: 'aging61to90', label: '61–90 Days', color: '#F97316' }, { key: 'agingOver90', label: '>90 Days', color: '#DC2626' }]} chartType="bar" stacked accent="#4F46E5" testId="payment-aging-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Cash Conversion Trend" subtitle="Reported cash conversion cycle" data={financeRows} series={[{ key: 'cashConversion', label: 'Cash Conversion', color: '#4F46E5' }]} accent="#4F46E5" unit="days" testId="cash-conversion-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /></div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><AnalyticsChartCard title="Data Breach Trend" subtitle="Reported monthly incidents" data={breachRows} series={[{ key: 'breaches', label: 'Breaches', color: '#DC2626' }]} accent="#4F46E5" testId="data-breach-trend-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><AnalyticsChartCard title="Incident Categories" subtitle="Data breaches by security impact" data={incidentCategoryRows} series={[{ key: 'confidentiality', label: 'Confidentiality', color: '#DC2626' }, { key: 'integrity', label: 'Integrity', color: '#F97316' }, { key: 'availability', label: 'Availability', color: '#F59E0B' }, { key: 'privacy', label: 'Privacy', color: '#4F46E5' }]} chartType="bar" accent="#4F46E5" testId="incident-categories-chart" loading={analyticsLoading} onDrilldown={(point, title) => setDrilldown({ point, title })} /><GovernanceSummaryCard governance={analyticsData.governance || {}} /></div>
    {drilldown && <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-stone-200 bg-white p-4 shadow-xl" data-testid="chart-drilldown-panel"><button type="button" onClick={() => setDrilldown(null)} className="float-right text-xs font-medium text-stone-500 hover:text-stone-900" data-testid="chart-drilldown-close">Close</button><p className="text-sm font-semibold text-stone-900">{drilldown.title}</p><pre className="mt-2 overflow-auto text-xs text-stone-600">{JSON.stringify(drilldown.point, null, 2)}</pre></div>}
  </div>;
}