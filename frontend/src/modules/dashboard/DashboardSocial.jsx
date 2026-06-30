/**
 * DashboardSocial — Social-focused ESG Dashboard
 * 
 * KPIs:
 * 1. No. of Trainings
 * 2. Training Hours
 * 3. Complaints No.
 * 4. POSH Cases
 * 5. Consumer Complaints
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

// Layout & Shared Components
import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';

// BRSR Components
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import TrendArrow from './components/shared/TrendArrow';

// Hooks
import { useIntensityData, usePrevYearIntensity } from './hooks/useIntensityData';

// Icons
import { Users, Clock, AlertTriangle, Shield, MessageSquare, RadioTower } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardSocial({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    stats, loading, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    isLive,
  } = data;

  const [esgMetrics, setEsgMetrics] = useState(null);
  const [prevYearMetrics, setPrevYearMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);

  // Fetch intensity data for FY year
  const { fyYear, isOrgLevel } = useIntensityData(dateRange, selectedFacilities);

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

  // Extract social metrics
  const trainingData = esgMetrics?.training || {};
  const complaintsData = esgMetrics?.complaints || {};
  const prevTraining = prevYearMetrics?.training || {};
  const prevComplaints = prevYearMetrics?.complaints || {};

  // KPI values
  const trainingsCount = trainingData.count || 0;
  const trainingHours = trainingData.hours || 0;
  const complaintsTotal = complaintsData.general || 0;
  const poshCases = complaintsData.posh || 0;
  const consumerComplaints = complaintsData.consumer || 0;

  // Calculate YoY trend deltas
  const trendDeltas = useMemo(() => {
    const computePct = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };

    return {
      trainingsCountDelta: computePct(trainingsCount, prevTraining.count),
      trainingHoursDelta: computePct(trainingHours, prevTraining.hours),
      complaintsDelta: computePct(complaintsTotal, prevComplaints.general),
      poshDelta: computePct(poshCases, prevComplaints.posh),
      consumerDelta: computePct(consumerComplaints, prevComplaints.consumer),
    };
  }, [trainingsCount, trainingHours, complaintsTotal, poshCases, consumerComplaints, prevTraining, prevComplaints]);

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

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* No. of Trainings */}
        <PremiumKpiCard
          title="NO. OF TRAININGS"
          value={trainingsCount}
          unit="sessions"
          icon={Users}
          accentColor="blue"
          footer={
            trendDeltas.trainingsCountDelta !== null && (
              <TrendArrow delta={trendDeltas.trainingsCountDelta} suffix="vs prev period" invertColors />
            )
          }
        />

        {/* Training Hours */}
        <PremiumKpiCard
          title="TRAINING HOURS"
          value={trainingHours.toFixed(1)}
          unit="hrs"
          icon={Clock}
          accentColor="indigo"
          footer={
            trendDeltas.trainingHoursDelta !== null && (
              <TrendArrow delta={trendDeltas.trainingHoursDelta} suffix="vs prev period" invertColors />
            )
          }
        />

        {/* Complaints No. */}
        <PremiumKpiCard
          title="COMPLAINTS"
          value={complaintsTotal}
          unit="cases"
          icon={AlertTriangle}
          accentColor="amber"
          footer={
            trendDeltas.complaintsDelta !== null && (
              <TrendArrow delta={trendDeltas.complaintsDelta} suffix="vs prev period" />
            )
          }
        />

        {/* POSH Cases */}
        <PremiumKpiCard
          title="POSH CASES"
          value={poshCases}
          unit="cases"
          icon={Shield}
          accentColor="rose"
          footer={
            trendDeltas.poshDelta !== null && (
              <TrendArrow delta={trendDeltas.poshDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Consumer Complaints */}
        <PremiumKpiCard
          title="CONSUMER COMPLAINTS"
          value={consumerComplaints}
          unit="cases"
          icon={MessageSquare}
          accentColor="orange"
          footer={
            trendDeltas.consumerDelta !== null && (
              <TrendArrow delta={trendDeltas.consumerDelta} suffix="vs prev period" />
            )
          }
        />
      </div>

      {/* Summary Section */}
      <SectionCard title="Social Performance Summary" subtitle="Key workforce and stakeholder metrics">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
          {/* Training Summary Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Training Overview</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Total Sessions</span>
                <span className="font-semibold text-stone-900">{trainingsCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Total Hours</span>
                <span className="font-semibold text-stone-900">{trainingHours.toFixed(1)} hrs</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Participants</span>
                <span className="font-semibold text-stone-900">{trainingData.participants || 0}</span>
              </div>
            </div>
          </div>

          {/* Complaints Summary Card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Complaints Breakdown</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">General Complaints</span>
                <span className="font-semibold text-stone-900">{complaintsTotal}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">POSH Cases</span>
                <span className="font-semibold text-rose-600">{poshCases}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Consumer Complaints</span>
                <span className="font-semibold text-orange-600">{consumerComplaints}</span>
              </div>
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Period Summary</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Reporting Period</span>
                <span className="font-semibold text-stone-900 text-xs">{dateRangeLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Total Complaints</span>
                <span className="font-semibold text-stone-900">{complaintsData.total || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Status</span>
                {liveBadge || <span className="text-sm text-stone-500">Historical</span>}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
