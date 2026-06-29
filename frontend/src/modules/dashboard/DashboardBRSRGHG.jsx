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
    isLive,
  } = data;

  const [intensityMode, setIntensityMode] = useState('revenue');
  const [incidentCategory, setIncidentCategory] = useState('safety');
  const [esgMetrics, setEsgMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);
  const [targets, setTargets] = useState([]);

  // Fetch intensity data from yearly-data endpoint (org-level) or facility production (facility-level)
  const { 
    turnover, productionQty, productionUnit, hasIntensityData, hasTurnover, hasProduction, isOrgLevel 
  } = useIntensityData(dateRange, selectedFacilities);

  // Fetch BRSR/ESG-specific metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setEsgLoading(true);
      try {
        const [metricsRes, targetsRes] = await Promise.all([
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined,
              end_date: dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
          axios.get(`${API}/targets`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        ]);
        
        setEsgMetrics(metricsRes.data);
        setTargets(targetsRes.data || []);
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

  console.log("esgMetrics", esgMetrics)
  // Calculate totals - Use combined emissions from esgMetrics (GHG + ESG records)
  // Fallback to filteredData.totals for backward compatibility if esgMetrics not loaded
  const totals = filteredData?.totals || {};
  const ghgEmissions = (totals.total || 0) - (filteredData?.filteredSinks || 0);
  
  // Use combined emissions from dashboard-metrics endpoint (includes GHG + ESG records)
  const netEmissions = esgMetrics?.total_emissions ?? ghgEmissions;
  
  // Use combined energy from dashboard-metrics endpoint (includes GHG + ESG records)
  const netEnergy = esgMetrics?.total_energy || 0;

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

  // Build sparkline data
  const buildSparkData = useCallback((trendData, key) => {
    if (!trendData || !Array.isArray(trendData)) return [];
    return trendData.map((d, i) => ({ x: i, y: d[key] || 0 }));
  }, []);

  const emissionsSparkData = useMemo(() => buildSparkData(filteredData?.trend, 'total'), [filteredData?.trend, buildSparkData]);

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
          title={hasIntensityData ? "Emission Intensity" : "Net Emissions"}
          value={netEmissions}
          unit="tCO₂e"
          intensityValue={intensityCalcs.emissionIntensity}
          intensityUnit={intensityCalcs.emissionIntensityUnit}
          showIntensity={hasIntensityData && intensityCalcs.hasEmissionIntensity}
          yoyChange={data.trendDeltas?.totalDelta}
          sparkData={emissionsSparkData}
          icon={Leaf}
          accentColor="#10B981"
          loading={loading}
          actionSlot={intensityDropdown}
        />
        <PremiumKpiCard
          title={hasIntensityData ? "Energy Intensity" : "Net Energy"}
          value={netEnergy}
          unit="MWh"
          intensityValue={intensityCalcs.energyIntensity}
          intensityUnit={intensityCalcs.energyIntensityUnit}
          showIntensity={hasIntensityData && intensityCalcs.hasEnergyIntensity}
          icon={Zap}
          accentColor="#F59E0B"
          loading={esgLoading}
          actionSlot={intensityDropdown}
        />
        <PremiumKpiCard
          title="Water Discharged"
          value={esgMetrics?.water?.discharge || 0}
          unit="KL"
          yoyChange={esgMetrics?.water_yoy_change}
          icon={Droplets}
          accentColor="#0EA5E9"
          loading={esgLoading}
        />
        <PremiumKpiCard
          title="Waste Generated"
          value={esgMetrics?.wate?.generated || 0}
          unit="MT"
          yoyChange={esgMetrics?.waste_yoy_change}
          icon={Trash2}
          accentColor="#F43F5E"
          loading={esgLoading}
        />
        <PremiumKpiCard
          title="Safety Incidents"
          value={esgMetrics?.safety_incidents || 0}
          unit="incidents"
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
