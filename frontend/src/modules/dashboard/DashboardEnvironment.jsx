/**
 * DashboardEnvironment — Environment-focused ESG Dashboard
 * 
 * KPIs:
 * 1. Emission Intensity
 * 2. Renewable Energy %
 * 3. Water Recycling %
 * 4. Waste Recovery %
 * 5. Air Emissions
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

// Layout & Shared Components
import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';

// Charts
import ScopeTrendChart from './components/charts/ScopeTrendChart';
import EmissionsByScopeDonut from './components/charts/EmissionsByScopeDonut';

// BRSR Components
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import WaterLifecycleRadial from './components/brsr/WaterLifecycleRadial';
import WaterSourcesTreemap from './components/brsr/WaterSourcesTreemap';
import WaterDischargeDestinations from './components/brsr/WaterDischargeDestinations';
import WaterHighlightCards from './components/brsr/WaterHighlightCards';
import WasteFunnel from './components/brsr/WasteFunnel';
import WasteTreemap from './components/brsr/WasteTreemap';
import EnergyTreemap from './components/brsr/EnergyTreemap';
import AirEmissionsCompareBars from './components/brsr/AirEmissionsCompareBars';

// Hooks
import { useIntensityData, useIntensityCalculations } from './hooks/useIntensityData';

// Icons
import { Leaf, Zap, Droplets, Trash2, Wind, RefreshCw, RadioTower } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardEnvironment({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    stats, loading, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    filteredData,
    isLive,
  } = data;

  const [intensityMode, setIntensityMode] = useState('revenue');
  const [esgMetrics, setEsgMetrics] = useState(null);
  const [prevYearMetrics, setPrevYearMetrics] = useState(null);
  const [prevYearIntensity, setPrevYearIntensity] = useState({ turnover: null, productionQty: null });
  const [esgLoading, setEsgLoading] = useState(true);

  // Fetch intensity data
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

  // Fetch ESG metrics (current + previous year) AND previous year intensity data
  useEffect(() => {
    const fetchMetrics = async () => {
      setEsgLoading(true);
      try {
        const requests = [
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined,
              end_date: dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: prevYearDateRange.from ? format(prevYearDateRange.from, 'yyyy-MM') : undefined,
              end_date: prevYearDateRange.to ? format(prevYearDateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
        ];

        if (prevFyYear && isOrgLevel) {
          requests.push(
            axios.get(`${API}/organization/yearly-data/${prevFyYear}`, { headers: getAuthHeader() })
              .catch(() => ({ data: null }))
          );
        }

        const responses = await Promise.all(requests);
        const [metricsRes, prevMetricsRes, prevIntensityRes] = responses;
        
        setEsgMetrics(metricsRes.data);
        setPrevYearMetrics(prevMetricsRes.data);
        
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

  // Extract metrics
  const emissionsData = esgMetrics?.emissions || {};
  const energyData = esgMetrics?.energy || {};
  const waterData = esgMetrics?.water || {};
  const wasteData = esgMetrics?.waste || {};
  const airEmissions = emissionsData?.air_emissions || {};

  const netEmissions = emissionsData?.ghg_emissions?.total || 0;
  const netEnergy = energyData?.total || 0;
  const renewableEnergyPct = energyData?.renewable_pct || 0;
  const waterRecyclingPct = waterData?.recycling_pct || 0;
  const wasteRecoveryPct = wasteData?.recovery_pct || 0;
  const totalAirEmissions = airEmissions?.total || 0;

  // Calculate YoY trend deltas (same logic as DashboardBRSRGHG)
  const trendDeltas = useMemo(() => {
    const computePct = (current = 0, previous = 0) => {
      if (!previous || previous === 0) return null;
      return ((current - previous) / previous) * 100;
    };

    const currEmissions = esgMetrics?.emissions?.ghg_emissions?.total || 0;
    const currEnergy = esgMetrics?.energy?.total || 0;
    const prevEmissions = prevYearMetrics?.emissions?.ghg_emissions?.total || 0;
    const prevEnergy = prevYearMetrics?.energy?.total || 0;

    const hasPrevTurnover = prevYearIntensity.turnover !== null && prevYearIntensity.turnover > 0;
    const hasPrevProduction = prevYearIntensity.productionQty !== null && prevYearIntensity.productionQty > 0;

    let emissionsIntensityDeltaRevenue = null;
    let energyIntensityDeltaRevenue = null;
    if (turnover && hasPrevTurnover) {
      emissionsIntensityDeltaRevenue = computePct(currEmissions / turnover, prevEmissions / prevYearIntensity.turnover);
      energyIntensityDeltaRevenue = computePct(currEnergy / turnover, prevEnergy / prevYearIntensity.turnover);
    }

    let emissionsIntensityDeltaProduction = null;
    let energyIntensityDeltaProduction = null;
    if (productionQty && hasPrevProduction) {
      emissionsIntensityDeltaProduction = computePct(currEmissions / productionQty, prevEmissions / prevYearIntensity.productionQty);
      energyIntensityDeltaProduction = computePct(currEnergy / productionQty, prevEnergy / prevYearIntensity.productionQty);
    }

    const effectiveMode = !isOrgLevel ? 'production' : intensityMode;
    return {
      netEmissionsDelta: computePct(currEmissions, prevEmissions),
      netEnergyDelta: computePct(currEnergy, prevEnergy),
      emissionsIntensityDelta: effectiveMode === 'revenue' ? emissionsIntensityDeltaRevenue : emissionsIntensityDeltaProduction,
      energyIntensityDelta: effectiveMode === 'revenue' ? energyIntensityDeltaRevenue : energyIntensityDeltaProduction,
      waterDelta: computePct(esgMetrics?.water?.discharge || 0, prevYearMetrics?.water?.discharge || 0),
      wasteDelta: computePct(esgMetrics?.waste?.generated || 0, prevYearMetrics?.waste?.generated || 0),
      airEmissionsDelta: computePct(esgMetrics?.emissions?.air_emissions?.total || 0, prevYearMetrics?.emissions?.air_emissions?.total || 0),
    };
  }, [esgMetrics, prevYearMetrics, prevYearIntensity, turnover, productionQty, intensityMode, isOrgLevel]);

  // Intensity calculations
  const intensityCalcs = useIntensityCalculations({
    netEmissions,
    netEnergy,
    turnover,
    productionQty,
    productionUnit,
    intensityMode,
    isOrgLevel,
  });

  console.log("intensityCalcs", intensityCalcs)

  // Sparkline data for emissions
  const emissionsSparkData = useMemo(() => {
    const trend = filteredData?.trend || [];
    return trend.slice(-12).map(t => t.total || 0);
  }, [filteredData]);

  // Calculate totals from nested emissions structure
  const totals = filteredData?.totals || {};

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
  console.log("donutData", donutData)

  // Filter props
  const filterProps = {
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
  };

  // Date range label
  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  // Live badge
  const liveBadge = isLive ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 border border-emerald-200 rounded-full px-2 py-0.5">
      <RadioTower className="w-3 h-3" />
      Live
    </span>
  ) : null;

  // Intensity dropdown
  const intensityDropdown = hasIntensityData ? (
    <div onClick={(e) => e.stopPropagation()}>
      {isOrgLevel && hasTurnover && hasProduction ? (
        <select 
          value={intensityMode} 
          onChange={(e) => setIntensityMode(e.target.value)}
          className="text-[10px] font-semibold border border-stone-200 rounded-md bg-stone-50 text-stone-600 px-1.5 py-0.5 outline-none cursor-pointer hover:border-emerald-300 focus:ring-1 focus:ring-emerald-500"
        >
          <option value="revenue">INR</option>
          <option value="production">Prod</option>
        </select>
      ) : isOrgLevel && hasTurnover ? (
        <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-md border border-stone-200">Rev</span>
      ) : (
        <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-md border border-stone-200">Prod</span>
      )}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Environment Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-environment">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Environment Dashboard` : 'Environment Dashboard'}
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

      {/* ROW 1: TOP 5 KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="env-kpi-row">
        {/* 1. Emission Intensity */}
        <PremiumKpiCard
          title={hasIntensityData ? "Emission Intensity" : "Total Emissions"}
          value={netEmissions}
          unit="tCO₂e"
          intensityValue={intensityCalcs.emissionIntensity}
          intensityUnit={intensityCalcs.emissionIntensityUnit}
          showIntensity={hasIntensityData && intensityCalcs.hasEmissionIntensity}
          sparkData={emissionsSparkData}
          icon={Leaf}
          accentColor="#10B981"
          loading={esgLoading}
          actionSlot={intensityDropdown}
        />

        {/* 2. Renewable Energy % */}
        <PremiumKpiCard
          title="Renewable Energy"
          value={renewableEnergyPct}
          unit="%"
          subtitle={`${(energyData?.renewable_total || 0).toLocaleString()} MWh renewable`}
          icon={Zap}
          accentColor="#F59E0B"
          loading={esgLoading}
        />

        {/* 3. Water Recycling % */}
        <PremiumKpiCard
          title="Water Recycling"
          value={waterRecyclingPct}
          unit="%"
          subtitle={`${(waterData?.discharge || 0).toLocaleString()} KL discharged`}
          icon={Droplets}
          accentColor="#0EA5E9"
          loading={esgLoading}
        />

        {/* 4. Waste Recovery % */}
        <PremiumKpiCard
          title="Waste Recovery"
          value={wasteRecoveryPct}
          unit="%"
          subtitle={`${(wasteData?.generated || 0).toLocaleString()} MT generated`}
          icon={Trash2}
          accentColor="#8B5CF6"
          loading={esgLoading}
        />

        {/* 5. Air Emissions */}
        <PremiumKpiCard
          title="Air Emissions"
          value={totalAirEmissions}
          unit="tonnes"
          subtitle={`NOx: ${airEmissions?.NOx || 0}, SOx: ${airEmissions?.SOx || 0}`}
          icon={Wind}
          accentColor="#EF4444"
          loading={esgLoading}
        />
      </div>

      {/* ROW 2: Water & Waste Operations (Premium) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Water Management */}
        <SectionCard
          title="Water Management"
          subtitle="Lifecycle analysis & source breakdown"
          accent="#0EA5E9"
          testId="section-water-premium"
        >
          <div className="space-y-5">
            {/* Water Lifecycle Radial with Connected Metrics */}
            <WaterLifecycleRadial
              withdrawal={waterData?.withdrawal || 8500}
              consumption={waterData?.consumption || 5200}
              discharge={waterData?.discharge || 3100}
              recycled={waterData?.recycled || 1800}
              withdrawalChange={5}
              consumptionChange={-3}
              dischargeChange={2}
              recycledChange={12}
            />
            
            {/* Highlight Cards */}
            <WaterHighlightCards
              stressAreaPct={waterData?.stress_area_pct ?? 12}
              treatedPct={waterData?.treated_pct ?? 85}
              untreatedPct={waterData?.untreated_pct ?? 15}
            />

            {/* Source & Destination Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <WaterSourcesTreemap sources={waterData?.sources || {}} />
              <WaterDischargeDestinations destinations={waterData?.destinations || {}} />
            </div>
          </div>
        </SectionCard>

        {/* RIGHT: Waste Management */}
        <SectionCard
          title="Waste Management"
          subtitle="Flow funnel & type breakdown"
          accent="#8B5CF6"
          testId="section-waste-premium"
        >
          <div className="space-y-4">
            {/* Waste Funnel - Clear amounts shown */}
            <WasteFunnel
              generated={wasteData?.generated || 21222}
              recovered={wasteData?.recovered || 15400}
              disposed={wasteData?.disposal || 5822}
            />

            {/* Side Metrics */}
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 bg-violet-50 rounded-lg border border-violet-100">
                <div className="text-[10px] text-violet-600 font-medium">Treatment</div>
                <div className="text-base font-bold text-violet-700">{wasteData?.treatment_pct ?? 78}%</div>
              </div>
              <div className="text-center p-2 bg-rose-50 rounded-lg border border-rose-100">
                <div className="text-[10px] text-rose-600 font-medium">Hazardous</div>
                <div className="text-base font-bold text-rose-700">{wasteData?.hazardous_pct ?? 8}%</div>
              </div>
              <div className="text-center p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="text-[10px] text-emerald-600 font-medium">Recovery</div>
                <div className="text-base font-bold text-emerald-700">{wasteRecoveryPct.toFixed(0)}%</div>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-[10px] text-amber-600 font-medium">Disposal</div>
                <div className="text-base font-bold text-amber-700">{wasteData?.disposal_pct ?? 27}%</div>
              </div>
            </div>

            {/* Waste Type Treemap */}
            <div className="pt-2">
              <div className="text-[11px] font-semibold text-stone-700 uppercase tracking-wide mb-2">
                Waste Type Breakdown
              </div>
              <WasteTreemap data={wasteData?.types || {}} />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ROW 3: Emissions Trend + Scope Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <SectionCard
          className="lg:col-span-3"
          title="GHG Emissions Trend"
          subtitle="Scope 1, 2 & 3 emissions over time"
          accent="#10B981"
          testId="section-emissions-trend"
        >
          <ScopeTrendChart data={filteredData?.trend || []} hasScope3={true} />
        </SectionCard>

        {/* <SectionCard
          title="Emissions by Scope"
          subtitle="Distribution breakdown"
          accent="#3B82F6"
          testId="section-scope-donut"
        >
          <EmissionsByScopeDonut data={donutData} />
        </SectionCard> */}

        <SectionCard
          title="Emissions Split"
          subtitle="By scope category"
          accent="#3B82F6"
          testId="emissions-split-section"
        >
          <EmissionsByScopeDonut data={donutData} height={220} />
        </SectionCard>
      </div>

      {/* ROW 4: Energy + Air Emissions (Environmental Performance Row) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Energy by Subcategory - Treemap */}
        <SectionCard
          title="Energy by Category"
          subtitle="Consumption mix with renewable share"
          accent="#F59E0B"
          testId="section-energy-treemap"
        >
          <EnergyTreemap
            data={{
              electricity: (energyData?.emission_records?.electricity?.total || 0) + (energyData?.esg_records?.electricity?.total || 0),
              fuel: (energyData?.emission_records?.fuel?.total || 0) + (energyData?.esg_records?.fuel?.total || 0),
              renewable: energyData?.renewable_total || 0,
              other: (energyData?.emission_records?.other_sources?.total || 0) + (energyData?.esg_records?.other_sources?.total || 0),
            }}
            renewablePct={renewableEnergyPct}
            totalEnergy={energyData?.total || 0}
          />
        </SectionCard>

        {/* RIGHT: Air Emissions - Horizontal Comparative Bars */}
        <SectionCard
          title="Air Emissions by Pollutant"
          subtitle="Regulatory compliance tracking"
          accent="#EF4444"
          testId="section-air-emissions-bars"
        >
          <AirEmissionsCompareBars
            data={{
              NOx: airEmissions?.NOx || 0,
              SOx: airEmissions?.SOx || 0,
              PM: airEmissions?.PM || 0,
              VOC: airEmissions?.VOC || 0,
              HAP: airEmissions?.HAP || 0,
              Other: airEmissions?.Other || 0,
            }}
            showLimits={true}
          />
        </SectionCard>
      </div>
    </div>
  );
}
