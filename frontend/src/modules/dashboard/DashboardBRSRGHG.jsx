/**
 * DashboardBRSRGHG — Premium Enterprise BRSR + GHG Dashboard
 * 
 * Continuous ESG Monitoring & Operational Intelligence Platform
 * 
 * Sections:
 * 1. Top KPI Row - Net Emissions, Energy, Water, Waste, Safety
 * 2. Emissions Trend + Scope Donut
 * 3. Targets & Reduction Progress + Incident Trends
 * 4. Water Management + Waste Management
 * 5. Water & Waste Trends
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

// Layout & Shared Components
import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';

// Existing Charts
import ScopeTrendChart from './components/charts/ScopeTrendChart';
import EmissionsByScopeDonut from './components/charts/EmissionsByScopeDonut';

// BRSR Components
import PremiumKpiCard, { IntensityToggle } from './components/kpi/PremiumKpiCard';
import WaterManagementSection from './components/brsr/WaterManagementSection';
import WasteManagementSection from './components/brsr/WasteManagementSection';
import TargetProgressBar from './components/brsr/TargetProgressBar';
import IncidentTrendChart from './components/brsr/IncidentTrendChart';
import ResourceTrendChart from './components/brsr/ResourceTrendChart';

// Hooks
import { useIntensityData, useIntensityCalculations } from './hooks/useIntensityData';

// Icons
import { Leaf, Droplets, Trash2, AlertTriangle, Zap, RefreshCw } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// =============================================================================
// Main Dashboard Component
// =============================================================================
export default function DashboardBRSRGHG({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    stats, loading, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    filteredData, baseYearComparison,
    isLive, getPreviousFinancialYear,
  } = data;

  const [intensityMode, setIntensityMode] = useState('revenue');
  const [incidentCategory, setIncidentCategory] = useState('safety');
  const [esgMetrics, setEsgMetrics] = useState(null);
  const [prevYearMetrics, setPrevYearMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);
  const [targets, setTargets] = useState([]);

  // Fetch intensity data from yearly-data endpoint (org-level) or facility production (facility-level)
  const { 
    turnover, productionQty, productionUnit, hasIntensityData, hasTurnover, hasProduction, isOrgLevel, fyYear 
  } = useIntensityData(dateRange, selectedFacilities);

  // Calculate previous year date range
  const prevYearDateRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return { from: null, to: null };
    const prevFrom = new Date(dateRange.from);
    const prevTo = new Date(dateRange.to);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    prevTo.setFullYear(prevTo.getFullYear() - 1);
    return { from: prevFrom, to: prevTo };
  }, [dateRange]);

  // Calculate previous FY year for intensity data fetch
  const prevFyYear = useMemo(() => {
    if (!fyYear) return null;
    const [startYear] = fyYear.split('-').map(Number);
    const prevStartYear = startYear - 1;
    return `${prevStartYear}-${String(prevStartYear + 1).slice(-2)}`;
  }, [fyYear]);

  // State for previous year intensity data
  const [prevYearIntensity, setPrevYearIntensity] = useState({ turnover: null, productionQty: null });

  // Fetch BRSR/ESG-specific metrics (current + previous year) AND previous year intensity data
  useEffect(() => {
    const fetchMetrics = async () => {
      setEsgLoading(true);
      try {
        const requests = [
          // Current period ESG metrics
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined,
              end_date: dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
          // Previous year period ESG metrics
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: prevYearDateRange.from ? format(prevYearDateRange.from, 'yyyy-MM') : undefined,
              end_date: prevYearDateRange.to ? format(prevYearDateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
          // Targets
          axios.get(`${API}/targets`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        ];

        // Add previous year intensity data fetch (org-level only for now)
        if (prevFyYear && isOrgLevel) {
          requests.push(
            axios.get(`${API}/organization/yearly-data/${prevFyYear}`, { headers: getAuthHeader() })
              .catch(() => ({ data: null }))
          );
        }

        const responses = await Promise.all(requests);
        const [metricsRes, prevMetricsRes, targetsRes, prevIntensityRes] = responses;
        
        setEsgMetrics(metricsRes.data);
        setPrevYearMetrics(prevMetricsRes.data);
        setTargets(targetsRes.data || []);
        
        // Set previous year intensity data
        if (prevIntensityRes?.data) {
          const prevTurnover = prevIntensityRes.data.turnover ? parseFloat(prevIntensityRes.data.turnover) : null;
          const prevProdQty = prevIntensityRes.data.production_quantity ? parseFloat(prevIntensityRes.data.production_quantity) : null;
          setPrevYearIntensity({
            turnover: prevTurnover && !isNaN(prevTurnover) ? prevTurnover : null,
            productionQty: prevProdQty && !isNaN(prevProdQty) ? prevProdQty : null,
          });
        } else {
          setPrevYearIntensity({ turnover: null, productionQty: null });
        }
      } catch (error) {
        console.error('Metrics fetch error:', error);
      } finally {
        setEsgLoading(false);
      }
    };

    if (dateRange.from && dateRange.to) {
      fetchMetrics();
    }
  }, [dateRange, prevYearDateRange, prevFyYear, selectedFacilities, isOrgLevel, getAuthHeader]);

  // Calculate totals from nested emissions structure
  const totals = filteredData?.totals || {};
  const ghgEmissionsFallback = (totals.total || 0) - (filteredData?.filteredSinks || 0);
  // Use nested emissions structure from dashboard-metrics endpoint
  const emissionsData = esgMetrics?.emissions || {};
  const netEmissions = emissionsData?.ghg_emissions?.total ?? ghgEmissionsFallback;
  // Use nested energy structure from dashboard-metrics endpoint
  const energyData = esgMetrics?.energy || {};
  const netEnergy = energyData?.total || 0;

  // Calculate YoY trend deltas for all KPIs (including intensity)
  const trendDeltas = useMemo(() => {
    const computePct = (current = 0, previous = 0) => {
      if (!previous || previous === 0) return null;
      return ((current - previous) / previous) * 100;
    };

    // Current values
    const currEmissions = esgMetrics?.emissions?.ghg_emissions?.total || 0;
    const currEnergy = esgMetrics?.energy?.total || 0;
    const currWater = esgMetrics?.water?.discharge || 0;
    const currWaste = esgMetrics?.waste?.generated || 0;
    const currSafety = esgMetrics?.safety_incidents?.total || 0;

    // Previous year values
    const prevEmissions = prevYearMetrics?.emissions?.ghg_emissions?.total || 0;
    const prevEnergy = prevYearMetrics?.energy?.total || 0;
    const prevWater = prevYearMetrics?.water?.discharge || 0;
    const prevWaste = prevYearMetrics?.waste?.generated || 0;
    const prevSafety = prevYearMetrics?.safety_incidents?.total || 0;

    // Calculate intensity deltas separately for revenue and production modes
    const hasPrevTurnover = prevYearIntensity.turnover !== null && prevYearIntensity.turnover > 0;
    const hasPrevProduction = prevYearIntensity.productionQty !== null && prevYearIntensity.productionQty > 0;

    // Revenue-based intensity delta (only if both current AND previous turnover exist)
    let emissionsIntensityDeltaRevenue = null;
    let energyIntensityDeltaRevenue = null;
    if (turnover && hasPrevTurnover) {
      const currEmissionIntensity = currEmissions / turnover;
      const prevEmissionIntensity = prevEmissions / prevYearIntensity.turnover;
      emissionsIntensityDeltaRevenue = computePct(currEmissionIntensity, prevEmissionIntensity);

      const currEnergyIntensity = currEnergy / turnover;
      const prevEnergyIntensity = prevEnergy / prevYearIntensity.turnover;
      energyIntensityDeltaRevenue = computePct(currEnergyIntensity, prevEnergyIntensity);
    }

    // Production-based intensity delta (only if both current AND previous production exist)
    let emissionsIntensityDeltaProduction = null;
    let energyIntensityDeltaProduction = null;
    if (productionQty && hasPrevProduction) {
      const currEmissionIntensity = currEmissions / productionQty;
      const prevEmissionIntensity = prevEmissions / prevYearIntensity.productionQty;
      emissionsIntensityDeltaProduction = computePct(currEmissionIntensity, prevEmissionIntensity);

      const currEnergyIntensity = currEnergy / productionQty;
      const prevEnergyIntensity = prevEnergy / prevYearIntensity.productionQty;
      energyIntensityDeltaProduction = computePct(currEnergyIntensity, prevEnergyIntensity);
    }

    // Select the correct intensity delta based on current mode
    const effectiveMode = !isOrgLevel ? 'production' : intensityMode;
    const emissionsIntensityDelta = effectiveMode === 'revenue' 
      ? emissionsIntensityDeltaRevenue 
      : emissionsIntensityDeltaProduction;
    const energyIntensityDelta = effectiveMode === 'revenue' 
      ? energyIntensityDeltaRevenue 
      : energyIntensityDeltaProduction;

    return {
      // Net value deltas (used when intensity is not shown)
      netEmissionsDelta: computePct(currEmissions, prevEmissions),
      netEnergyDelta: computePct(currEnergy, prevEnergy),
      // Intensity deltas (used when intensity is shown) - null if prev year data doesn't exist for selected mode
      emissionsIntensityDelta,
      energyIntensityDelta,
      // Other KPIs
      waterDelta: computePct(currWater, prevWater),
      wasteDelta: computePct(currWaste, prevWaste),
      safetyDelta: computePct(currSafety, prevSafety),
    };
  }, [esgMetrics, prevYearMetrics, prevYearIntensity, turnover, productionQty, intensityMode, isOrgLevel]);

  // Use intensity calculations hook
  const intensityCalcs = useIntensityCalculations({
    netEmissions,
    netEnergy,
    turnover,
    productionQty,
    productionUnit,
    intensityMode,
    isOrgLevel,
  });

  // Build donut data for emissions split
  const donutData = useMemo(() => {
    const t = totals;
    const total = t.total || 0;
    if (!total) return [];
    return [
      { id: 'scope1', name: 'Scope 1', value: t.scope1 || 0, pct: total ? ((t.scope1 || 0) / total) * 100 : 0 },
      { id: 'scope2', name: 'Scope 2', value: t.scope2 || 0, pct: total ? ((t.scope2 || 0) / total) * 100 : 0 },
      { id: 'scope3', name: 'Scope 3', value: t.scope3 || 0, pct: total ? ((t.scope3 || 0) / total) * 100 : 0 },
      { id: 'biogenic', name: 'Biogenic', value: t.biogenic || 0, pct: total ? ((t.biogenic || 0) / total) * 100 : 0 },
    ].filter(d => d.value > 0);
  }, [totals]);

  // Filter props
  const filterProps = {
    dateRange, setDateRange, facilities, selectedFacilities, setSelectedFacilities,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    getPreviousFinancialYear,
  };

  // Live badge
  const liveBadge = isLive ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      LIVE
    </span>
  ) : null;

  // Mock incident trend data
  const incidentTrendData = useMemo(() => {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map(m => ({
      period: m,
      injury: Math.floor(Math.random() * 3),
      fatality: Math.random() > 0.95 ? 1 : 0,
      ill_health: Math.floor(Math.random() * 2),
      near_miss: Math.floor(Math.random() * 5),
      workplace: Math.floor(Math.random() * 2),
      harassment: Math.floor(Math.random() * 1),
      discrimination: 0, human_rights: 0,
      consumer: Math.floor(Math.random() * 3),
      unauthorized: Math.floor(Math.random() * 1),
      phishing: Math.floor(Math.random() * 2),
      ransomware: 0, insider: 0,
    }));
  }, []);

  // Mock water/waste trend data
  const waterTrendData = useMemo(() => {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map(m => ({
      period: m,
      withdrawn: 800 + Math.random() * 200,
      consumed: 600 + Math.random() * 150,
      discharged: 150 + Math.random() * 50,
      recycled: 100 + Math.random() * 80,
    }));
  }, []);

  const wasteTrendData = useMemo(() => {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map(m => ({
      period: m,
      generated: 50 + Math.random() * 20,
      recovered: 30 + Math.random() * 15,
      disposed: 15 + Math.random() * 10,
    }));
  }, []);

  // Date range label
  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  const intensityDropdown = hasIntensityData ? (
    <div onClick={(e) => e.stopPropagation()}>
      {isOrgLevel && hasTurnover && hasProduction ? (
        <select 
          value={intensityMode} 
          onChange={(e) => setIntensityMode(e.target.value)}
          /* Reduced text, padding, and height */
          className="text-[10px] font-semibold border border-stone-200 rounded-md bg-stone-50 text-stone-600 px-1.5 py-0.5 outline-none cursor-pointer hover:border-emerald-300 focus:ring-1 focus:ring-emerald-500"
        >
          <option value="revenue">INR</option>
          <option value="production">Prod</option>
        </select>
      ) : isOrgLevel && hasTurnover ? (
        <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-md border border-stone-200">
          Rev
        </span>
      ) : (
        <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-md border border-stone-200">
          Prod
        </span>
      )}
    </div>
  ) : null;

  console.log("data.trendDeltas?.totalDelta", data.trendDeltas?.totalDelta)
  console.log("data", data)


  return (
    <div className="space-y-6" data-testid="dashboard-brsr-ghg">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Executive Dashboard` : 'Executive Dashboard'}
        subtitle={`Reporting window: ${dateRangeLabel}`}
        liveBadge={liveBadge}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={filterProps}
        onExport={() => console.log('Export triggered')}
        showExport={true}
        dashboardType={data.dashboardType}
        setDashboardType={data.setDashboardType}
        esgSection={data.esgSection}
        setEsgSection={data.setEsgSection}
        showDashboardToggle={data.showDashboardToggle}
      />

      {/* Intensity Toggle - Show toggle only at org level when both turnover and production available */}
      {/* const intensityDropdown = {hasIntensityData && (
        <div className="flex items-center gap-3">
          {isOrgLevel && hasTurnover && hasProduction ? (
            <IntensityToggle mode={intensityMode} setMode={setIntensityMode} />
          ) : isOrgLevel && hasTurnover ? (
            <span className="text-xs text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg">By Revenue</span>
          ) : (
            <span className="text-xs text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg">By Production</span>
          )}
        </div>
      )} */}

      {/* ROW 1: TOP KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="top-kpi-row">
        <PremiumKpiCard
          title={hasIntensityData ? "GHG Emission Intensity" : "GHG Net Emissions"}
          value={netEmissions}
          unit="tCO₂e"
          intensityValue={intensityCalcs.emissionIntensity}
          intensityUnit={intensityCalcs.emissionIntensityUnit}
          showIntensity={hasIntensityData && intensityCalcs.hasEmissionIntensity}
          yoyChange={hasIntensityData && intensityCalcs.hasEmissionIntensity 
            ? trendDeltas.emissionsIntensityDelta 
            : trendDeltas.netEmissionsDelta}
          icon={Leaf}
          accentColor="#10B981"
          loading={esgLoading}
          actionSlot={intensityDropdown}
        />
        <PremiumKpiCard
          title={hasIntensityData ? "Energy Intensity" : "Net Energy"}
          value={netEnergy}
          unit="MWh"
          intensityValue={intensityCalcs.energyIntensity}
          intensityUnit={intensityCalcs.energyIntensityUnit}
          showIntensity={hasIntensityData && intensityCalcs.hasEnergyIntensity}
          yoyChange={hasIntensityData && intensityCalcs.hasEnergyIntensity 
            ? trendDeltas.energyIntensityDelta 
            : trendDeltas.netEnergyDelta}
          icon={Zap}
          accentColor="#F59E0B"
          loading={esgLoading}
          actionSlot={intensityDropdown}
        />
        <PremiumKpiCard
          title="Water Discharged"
          value={esgMetrics?.water?.discharge || 0}
          unit="KL"
          yoyChange={trendDeltas.waterDelta}
          icon={Droplets}
          accentColor="#0EA5E9"
          loading={esgLoading}
        />
        <PremiumKpiCard
          title="Waste Generated"
          value={esgMetrics?.waste?.generated || 0}
          unit="MT"
          yoyChange={trendDeltas.wasteDelta}
          icon={Trash2}
          accentColor="#92400E"
          loading={esgLoading}
        />
        <PremiumKpiCard
          title="Safety Incidents"
          value={esgMetrics?.safety_incidents?.total || 0}
          unit="incidents"
          yoyChange={trendDeltas.safetyDelta}
          icon={AlertTriangle}
          accentColor="#DC2626"
          loading={esgLoading}
        />
      </div>

      {/* ROW 2: EMISSIONS TREND + SCOPE DONUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard
          title="Emissions Trend"
          subtitle="Monthly emissions over selected period"
          accent="#10B981"
          testId="emissions-trend-section"
          className="lg:col-span-2"
        >
          <div className="h-72">
            <ScopeTrendChart data={filteredData?.trend || []} hasScope3={data.hasScope3Access} height={280} />
          </div>
        </SectionCard>

        <SectionCard
          title="Emissions Split"
          subtitle="By scope category"
          accent="#3B82F6"
          testId="emissions-split-section"
        >
          <EmissionsByScopeDonut data={donutData} height={220} />
        </SectionCard>
      </div>

      {/* ROW 3: TARGETS & REDUCTION + INCIDENT TRENDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Targets & Reduction Progress"
          subtitle="Progress towards sustainability goals"
          accent="#8B5CF6"
          testId="targets-section"
        >
          <div className="space-y-1">
            <TargetProgressBar label="Net Zero Target" current={35} target={100} targetYear="2050" color="#10B981" />
            <TargetProgressBar label="Emission Reduction" current={22} target={50} targetYear="2030" color="#3B82F6" />
            <TargetProgressBar label="Energy Reduction" current={18} target={30} targetYear="2030" color="#F59E0B" />
            <TargetProgressBar label="Water Reduction" current={12} target={25} targetYear="2030" color="#0EA5E9" />
            <TargetProgressBar label="Waste Recovery" current={65} target={80} targetYear="2030" color="#F43F5E" />
          </div>
        </SectionCard>

        <SectionCard
          title="Incident Trends"
          accent="#F43F5E"
          testId="incident-trends-section"
          header={
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Incident Trends</h3>
                <p className="text-xs text-stone-500 mt-0.5">Monthly tracking by category</p>
              </div>
              <div className="flex gap-1">
                {['safety', 'complaints', 'breaches'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setIncidentCategory(cat)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      incidentCategory === cat 
                        ? 'bg-stone-900 text-white' 
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {cat === 'safety' ? 'Safety' : cat === 'complaints' ? 'Complaints' : 'Breaches'}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <IncidentTrendChart data={incidentTrendData} category={incidentCategory} />
        </SectionCard>
      </div>

      {/* ROW 4: WATER + WASTE MANAGEMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Water Management"
          subtitle="Withdrawal, consumption & recycling"
          accent="#0EA5E9"
          testId="water-management-section"
        >
          <WaterManagementSection 
            data={{
              withdrawn: esgMetrics?.water_withdrawn || 12500,
              consumed: esgMetrics?.water_consumed || 9800,
              discharged: esgMetrics?.water_discharged || 2200,
              recycled_pct: esgMetrics?.water_recycling_pct || 28,
              groundwater: 4500, surface: 3200, municipal: 3800, rainwater: 500, recycled: 500,
              treated_pct: 88,
            }} 
            loading={esgLoading}
          />
        </SectionCard>

        <SectionCard
          title="Waste Management"
          subtitle="Generation, recovery & disposal"
          accent="#F43F5E"
          testId="waste-management-section"
        >
          <WasteManagementSection 
            data={{
              generated: esgMetrics?.waste_generated || 850,
              recovered: esgMetrics?.waste_recovered || 520,
              disposed: esgMetrics?.waste_disposed || 330,
              hazardous_pct: 18,
              plastic: 120, ewaste: 45, hazardous: 85, metal: 180, paper: 95, organic: 325,
            }}
            loading={esgLoading}
          />
        </SectionCard>
      </div>

      {/* ROW 5: WATER & WASTE TRENDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Water Trend" subtitle="Monthly water metrics" accent="#0EA5E9" testId="water-trend-section">
          <ResourceTrendChart data={waterTrendData} type="water" />
        </SectionCard>

        <SectionCard title="Waste Trend" subtitle="Monthly waste metrics" accent="#F43F5E" testId="waste-trend-section">
          <ResourceTrendChart data={wasteTrendData} type="waste" />
        </SectionCard>
      </div>
    </div>
  );
}
