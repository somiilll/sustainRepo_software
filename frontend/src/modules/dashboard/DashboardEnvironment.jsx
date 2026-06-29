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
import WaterFlowSankey from './components/brsr/WaterFlowSankey';
import WaterSourcesBar from './components/brsr/WaterSourcesBar';
import WasteFunnel from './components/brsr/WasteFunnel';
import WasteTreemap from './components/brsr/WasteTreemap';

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
  const [esgLoading, setEsgLoading] = useState(true);

  // Fetch intensity data
  const { 
    turnover, productionQty, productionUnit, hasIntensityData, hasTurnover, hasProduction, isOrgLevel 
  } = useIntensityData(dateRange, selectedFacilities);

  // Fetch ESG metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setEsgLoading(true);
      try {
        const res = await axios.get(`${API}/esg-records/dashboard-metrics`, {
          headers: getAuthHeader(),
          params: {
            start_date: dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined,
            end_date: dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined,
            facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
          }
        });
        setEsgMetrics(res.data);
      } catch (error) {
        console.error('Metrics fetch error:', error);
      } finally {
        setEsgLoading(false);
      }
    };

    if (dateRange.from && dateRange.to) {
      fetchMetrics();
    }
  }, [dateRange, selectedFacilities, getAuthHeader]);

  // Extract metrics
  const emissionsData = esgMetrics?.emissions || {};
  const energyData = esgMetrics?.energy || {};
  const waterData = esgMetrics?.water || {};
  const wasteData = esgMetrics?.waste || {};
  const airEmissions = emissionsData?.air_emissions || {};

  const netEmissions = emissionsData?.ghg_emissions?.total || 0;
  const renewableEnergyPct = energyData?.renewable_pct || 0;
  const waterRecyclingPct = waterData?.recycling_pct || 0;
  const wasteRecoveryPct = wasteData?.recovery_pct || 0;
  const totalAirEmissions = airEmissions?.total || 0;

  // Intensity calculations
  const intensityCalcs = useIntensityCalculations({
    netEmissions,
    netEnergy: energyData?.total || 0,
    turnover,
    productionQty,
    productionUnit,
    intensityMode,
    isOrgLevel,
  });

  // Sparkline data for emissions
  const emissionsSparkData = useMemo(() => {
    const trend = filteredData?.trend || [];
    return trend.slice(-12).map(t => t.total || 0);
  }, [filteredData]);

  // Build donut data for emissions by scope
  const donutData = useMemo(() => {
    const ghg = emissionsData?.ghg_emissions || {};
    return [
      { name: 'Scope 1', value: ghg.total_scope1 || 0, color: '#10B981' },
      { name: 'Scope 2', value: ghg.total_scope2 || 0, color: '#3B82F6' },
      { name: 'Scope 3', value: ghg.total_scope3 || 0, color: '#8B5CF6' },
    ].filter(d => d.value > 0);
  }, [emissionsData]);

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
          subtitle="Flow analysis & source breakdown"
          accent="#0EA5E9"
          testId="section-water-premium"
        >
          <div className="space-y-4">
            {/* Water Flow Sankey */}
            <WaterFlowSankey
              withdrawal={waterData?.withdrawal || 8500}
              consumption={waterData?.consumption || 5200}
              discharge={waterData?.discharge || 3100}
              recycled={waterData?.recycled || 1800}
            />
            
            {/* Side Metrics */}
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 bg-sky-50 rounded-lg border border-sky-100">
                <div className="text-[10px] text-sky-600 font-medium">Stress Area</div>
                <div className="text-base font-bold text-sky-700">{waterData?.stress_area_pct ?? 12}%</div>
              </div>
              <div className="text-center p-2 bg-teal-50 rounded-lg border border-teal-100">
                <div className="text-[10px] text-teal-600 font-medium">Treated</div>
                <div className="text-base font-bold text-teal-700">{waterData?.treated_pct ?? 85}%</div>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-[10px] text-amber-600 font-medium">Untreated</div>
                <div className="text-base font-bold text-amber-700">{waterData?.untreated_pct ?? 15}%</div>
              </div>
              <div className="text-center p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="text-[10px] text-emerald-600 font-medium">Recycled</div>
                <div className="text-base font-bold text-emerald-700">{waterRecyclingPct}%</div>
              </div>
            </div>

            {/* Source & Destination Breakdown */}
            <div className="grid grid-cols-1 gap-3 pt-2">
              <WaterSourcesBar 
                type="sources" 
                sources={waterData?.sources || {}} 
              />
              <WaterSourcesBar 
                type="destinations" 
                destinations={waterData?.destinations || {}} 
              />
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
            {/* Waste Funnel */}
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
              <div className="text-[10px] font-medium text-stone-600 uppercase tracking-wide mb-2">
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

        <SectionCard
          title="Emissions by Scope"
          subtitle="Distribution breakdown"
          accent="#3B82F6"
          testId="section-scope-donut"
        >
          <EmissionsByScopeDonut data={donutData} />
        </SectionCard>
      </div>

      {/* ROW 4: Air Emissions Breakdown */}
      <SectionCard
        title="Air Emissions Breakdown"
        subtitle="Pollutant-wise distribution"
        accent="#EF4444"
        testId="section-air-emissions"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 py-4">
          {[
            { label: 'NOx', value: airEmissions?.NOx || 0, color: '#EF4444' },
            { label: 'SOx', value: airEmissions?.SOx || 0, color: '#F97316' },
            { label: 'PM', value: airEmissions?.PM || 0, color: '#EAB308' },
            { label: 'VOC', value: airEmissions?.VOC || 0, color: '#22C55E' },
            { label: 'HAP', value: airEmissions?.HAP || 0, color: '#3B82F6' },
            { label: 'Other', value: airEmissions?.Other || 0, color: '#8B5CF6' },
          ].map(item => (
            <div key={item.label} className="text-center p-3 bg-stone-50 rounded-lg border border-stone-100">
              <div className="text-xs text-stone-500 mb-1">{item.label}</div>
              <div className="text-lg font-bold" style={{ color: item.color }}>
                {item.value.toLocaleString()}
              </div>
              <div className="text-[10px] text-stone-400">tonnes</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ROW 5: Energy Breakdown */}
      <SectionCard
        title="Energy Consumption"
        subtitle="Renewable vs Non-renewable breakdown"
        accent="#F59E0B"
        testId="section-energy"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
          {/* Fuel */}
          <div className="p-4 bg-stone-50 rounded-lg border border-stone-100">
            <div className="text-sm font-medium text-stone-700 mb-3">Fuel Energy</div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Renewable</span>
                <span className="font-medium text-emerald-600">{((energyData?.emission_records?.fuel?.renewable || 0) + (energyData?.esg_records?.fuel?.renewable || 0)).toLocaleString()} TJ</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Non-renewable</span>
                <span className="font-medium text-stone-700">{((energyData?.emission_records?.fuel?.non_renewable || 0) + (energyData?.esg_records?.fuel?.non_renewable || 0)).toLocaleString()} TJ</span>
              </div>
            </div>
          </div>

          {/* Electricity */}
          <div className="p-4 bg-stone-50 rounded-lg border border-stone-100">
            <div className="text-sm font-medium text-stone-700 mb-3">Electricity</div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Renewable</span>
                <span className="font-medium text-emerald-600">{((energyData?.emission_records?.electricity?.renewable || 0) + (energyData?.esg_records?.electricity?.renewable || 0)).toLocaleString()} MWh</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Non-renewable</span>
                <span className="font-medium text-stone-700">{((energyData?.emission_records?.electricity?.non_renewable || 0) + (energyData?.esg_records?.electricity?.non_renewable || 0)).toLocaleString()} MWh</span>
              </div>
            </div>
          </div>

          {/* Other Sources */}
          <div className="p-4 bg-stone-50 rounded-lg border border-stone-100">
            <div className="text-sm font-medium text-stone-700 mb-3">Other Sources</div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Renewable</span>
                <span className="font-medium text-emerald-600">{((energyData?.emission_records?.other_sources?.renewable || 0) + (energyData?.esg_records?.other_sources?.renewable || 0)).toLocaleString()} MWh</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Non-renewable</span>
                <span className="font-medium text-stone-700">{((energyData?.emission_records?.other_sources?.non_renewable || 0) + (energyData?.esg_records?.other_sources?.non_renewable || 0)).toLocaleString()} MWh</span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
