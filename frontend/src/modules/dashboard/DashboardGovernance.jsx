/**
 * DashboardGovernance — Governance-focused ESG Dashboard
 * 
 * KPIs:
 * 1. Safety Incidents
 * 2. Data Breaches
 * 3. Fatality
 * 4. Regulatory Escalations
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

// Layout & Shared Components
import SectionCard from './components/layout/SectionCard';

// BRSR Components
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import TrendArrow from './components/shared/TrendArrow';

// Hooks
import { useIntensityData } from './hooks/useIntensityData';

// Icons
import { ShieldAlert, Database, Skull, Scale, RadioTower } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardGovernance({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    dateRange,
    selectedFacilities,
    isLive,
  } = data;

  const [esgMetrics, setEsgMetrics] = useState(null);
  const [prevYearMetrics, setPrevYearMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);

  // Calculate previous year date range
  const prevYearDateRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return { from: null, to: null };
    const prevFrom = new Date(dateRange.from);
    const prevTo = new Date(dateRange.to);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    prevTo.setFullYear(prevTo.getFullYear() - 1);
    return { from: prevFrom, to: prevTo };
  }, [dateRange]);

  // Fetch ESG metrics (current + previous year)
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

        const responses = await Promise.all(requests);
        const [metricsRes, prevMetricsRes] = responses;
        
        setEsgMetrics(metricsRes.data);
        setPrevYearMetrics(prevMetricsRes.data);
      } catch (error) {
        console.error('Metrics fetch error:', error);
      } finally {
        setEsgLoading(false);
      }
    };

    if (dateRange.from && dateRange.to) {
      fetchMetrics();
    }
  }, [dateRange, prevYearDateRange, selectedFacilities, getAuthHeader]);

  // Extract governance metrics
  const govData = esgMetrics?.governance || {};
  const prevGovData = prevYearMetrics?.governance || {};

  // KPI values
  const safetyIncidents = govData.safety_incidents || 0;
  const dataBreaches = govData.data_breaches || 0;
  const fatalities = govData.fatalities || 0;
  const regulatoryEscalations = govData.regulatory_escalations || 0;

  // Calculate YoY trend deltas
  const trendDeltas = useMemo(() => {
    const computePct = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };

    return {
      safetyDelta: computePct(safetyIncidents, prevGovData.safety_incidents),
      breachesDelta: computePct(dataBreaches, prevGovData.data_breaches),
      fatalityDelta: computePct(fatalities, prevGovData.fatalities),
      regulatoryDelta: computePct(regulatoryEscalations, prevGovData.regulatory_escalations),
    };
  }, [safetyIncidents, dataBreaches, fatalities, regulatoryEscalations, prevGovData]);

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

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Safety Incidents */}
        <PremiumKpiCard
          title="SAFETY INCIDENTS"
          value={safetyIncidents}
          unit="incidents"
          icon={ShieldAlert}
          accentColor="amber"
          footer={
            trendDeltas.safetyDelta !== null && (
              <TrendArrow delta={trendDeltas.safetyDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Data Breaches */}
        <PremiumKpiCard
          title="DATA BREACHES"
          value={dataBreaches}
          unit="breaches"
          icon={Database}
          accentColor="rose"
          footer={
            trendDeltas.breachesDelta !== null && (
              <TrendArrow delta={trendDeltas.breachesDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Fatality */}
        <PremiumKpiCard
          title="FATALITY"
          value={fatalities}
          unit="cases"
          icon={Skull}
          accentColor="red"
          footer={
            trendDeltas.fatalityDelta !== null && (
              <TrendArrow delta={trendDeltas.fatalityDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Regulatory Escalations */}
        <PremiumKpiCard
          title="REGULATORY ESCALATIONS"
          value={regulatoryEscalations}
          unit="cases"
          icon={Scale}
          accentColor="purple"
          footer={
            trendDeltas.regulatoryDelta !== null && (
              <TrendArrow delta={trendDeltas.regulatoryDelta} suffix="vs prev period" />
            )
          }
        />
      </div>

      {/* Summary Section */}
      <SectionCard title="Governance Overview" subtitle="Risk and compliance status">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
          {/* Safety Card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Safety</h4>
            </div>
            <div className="text-3xl font-bold text-amber-600 mb-1">{safetyIncidents}</div>
            <p className="text-xs text-stone-500">Total incidents reported</p>
          </div>

          {/* Data Security Card */}
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-5 border border-rose-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-rose-100 rounded-lg">
                <Database className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Data Security</h4>
            </div>
            <div className="text-3xl font-bold text-rose-600 mb-1">{dataBreaches}</div>
            <p className="text-xs text-stone-500">Cyber incidents / breaches</p>
          </div>

          {/* Critical Events Card */}
          <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-5 border border-red-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Skull className="w-5 h-5 text-red-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Fatalities</h4>
            </div>
            <div className="text-3xl font-bold text-red-600 mb-1">{fatalities}</div>
            <p className="text-xs text-stone-500">Fatal incidents</p>
          </div>

          {/* Regulatory Card */}
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 border border-purple-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Scale className="w-5 h-5 text-purple-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Regulatory</h4>
            </div>
            <div className="text-3xl font-bold text-purple-600 mb-1">{regulatoryEscalations}</div>
            <p className="text-xs text-stone-500">Compliance escalations</p>
          </div>
        </div>

        {/* Period Info */}
        <div className="px-4 pb-4">
          <div className="bg-stone-50 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-stone-600">Reporting Period: <strong>{dateRangeLabel}</strong></span>
            {liveBadge}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
