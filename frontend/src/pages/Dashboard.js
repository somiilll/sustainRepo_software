import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { MonthYearPicker } from '../components/ui/month-year-picker';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, LabelList, AreaChart, Area, RadialBarChart, RadialBar, ComposedChart } from 'recharts';
import { Building2, TrendingUp, Gauge, Filter, Flame, Factory, Calendar, TreeDeciduous, Minus, Info, Check, Activity, Layers, PieChart as PieChartIcon, Target, Users, Truck, Zap, BarChart3, Globe } from 'lucide-react';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Beautiful modern color palette for charts
const COLORS = [
  '#10B981', // Emerald green
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#84CC16', // Lime
];

const SCOPE_COLORS = {
  scope1: '#10B981',    // Emerald - Direct emissions
  scope2: '#3B82F6',    // Blue - Indirect emissions  
  scope3: '#8B5CF6',    // Purple - Value chain emissions
  biogenic: '#F59E0B',  // Amber - Biogenic
};

const CATEGORY_COLORS = {
  'Stationary Combustion': '#10B981',
  'Mobile Combustion': '#3B82F6',
  'Fugitive Emissions': '#8B5CF6',
  'Process Emissions': '#F59E0B',
  'Purchased Electricity': '#06B6D4',
  'Purchased Heat/Steam': '#EC4899',
  'Biofuels': '#84CC16',
  'Other': '#EF4444',
  'Unknown': '#6B7280'
};

// Scope 3 Category Colors (15 GHG Protocol Categories)
const SCOPE3_CATEGORY_COLORS = {
  'C1': '#F97316', // Orange
  'C2': '#EF4444', // Red
  'C3': '#EC4899', // Pink
  'C4': '#8B5CF6', // Violet
  'C5': '#6366F1', // Indigo
  'C6': '#3B82F6', // Blue
  'C7': '#0EA5E9', // Sky
  'C8': '#06B6D4', // Cyan
  'C9': '#14B8A6', // Teal
  'C10': '#10B981', // Emerald
  'C11': '#22C55E', // Green
  'C12': '#84CC16', // Lime
  'C13': '#EAB308', // Yellow
  'C14': '#F59E0B', // Amber
  'C15': '#78716C', // Stone
};

// Premium glassmorphism card styles
const glassCardStyle = "backdrop-blur-xl bg-white/70 border border-white/20 shadow-xl";
const glassCardHover = "hover:bg-white/80 hover:shadow-2xl hover:scale-[1.01] transition-all duration-300";

// Custom label renderer for pie charts - shows all labels (data already filtered for > 0)
const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, percent }) => {
  if (percent <= 0) return null;
  
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
  return (
    <text 
      x={x} 
      y={y} 
      fill="#374151"
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]); // Multiple facilities
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showFacilityDropdown, setShowFacilityDropdown] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [baseYearData, setBaseYearData] = useState({ direct: null, indirect: null });
  const facilityDropdownRef = useRef(null);
  const { getAuthHeader, user } = useAuth();

  // Check if organization has scope 3 access
  const hasScope3Access = organization?.enabled_access?.includes('scope1_2_3') || false;

  // Close facility dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (facilityDropdownRef.current && !facilityDropdownRef.current.contains(event.target)) {
        setShowFacilityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get current financial year (April to March)
  const getCurrentFinancialYear = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      from: new Date(`${year}-04-01`),
      to: new Date(`${year + 1}-03-01`)
    };
  };

  useEffect(() => {
    fetchFacilities();
    fetchOrganization();
    fetchBaseYearData();
    // Fetch emissions to determine latest reporting year
    fetchLatestReportingPeriod();
  }, []);

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
      setOrganization(response.data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    }
  };

  const fetchBaseYearData = async () => {
    try {
      const response = await axios.get(`${API}/base-year-emissions`, { headers: getAuthHeader() });
      const records = response.data || [];
      
      // Separate records by scope group
      // Direct (Scope 1 & 2): records containing scope1 or scope2 emissions
      // Indirect (Scope 3 & Biogenic): records containing scope3 or biogenic emissions
      
      let directRecord = null;
      let indirectRecord = null;
      
      for (const record of records) {
        const emissionsData = record.emissions_data || [];
        const scopes = emissionsData.map(e => (e.scope || '').toLowerCase());
        
        const hasDirectScopes = scopes.some(s => s === 'scope1' || s === 'scope 1' || s === 'scope2' || s === 'scope 2');
        const hasIndirectScopes = scopes.some(s => s === 'scope3' || s === 'scope 3' || s === 'biogenic');
        
        // Assign to direct if it has scope1/scope2 data
        if (hasDirectScopes && !directRecord) {
          directRecord = record;
        }
        
        // Assign to indirect if it has scope3/biogenic data
        if (hasIndirectScopes && !indirectRecord) {
          indirectRecord = record;
        }
        
        // If record has both, use it for whichever is not yet assigned
        if (hasDirectScopes && hasIndirectScopes) {
          if (!directRecord) directRecord = record;
          if (!indirectRecord) indirectRecord = record;
        }
      }
      
      console.log('Base Year Data - Direct:', directRecord);
      console.log('Base Year Data - Indirect:', indirectRecord);
      setBaseYearData({ direct: directRecord, indirect: indirectRecord });
    } catch (error) {
      console.error('Failed to fetch base year data:', error);
    }
  };

  const fetchLatestReportingPeriod = async () => {
    try {
      const response = await axios.get(`${API}/emissions`, {
        headers: getAuthHeader()
      });
      const emissions = response.data || [];
      
      if (emissions.length > 0) {
        // Find the latest reporting period - only consider YYYY-MM format
        const monthlyPeriods = emissions
          .map(e => e.reporting_period)
          .filter(p => p && /^\d{4}-\d{2}$/.test(p)) // Only YYYY-MM format
          .sort();
        
        const latestPeriod = monthlyPeriods[monthlyPeriods.length - 1];
        
        if (latestPeriod) {
          // Extract year from latest period (format: YYYY-MM)
          const latestYear = parseInt(latestPeriod.split('-')[0]);
          const latestMonth = parseInt(latestPeriod.split('-')[1]);
          
          // Determine financial year based on latest data
          const fyYear = latestMonth >= 4 ? latestYear : latestYear - 1;
          setDateRange({
            from: new Date(`${fyYear}-04-01`),
            to: new Date(`${fyYear + 1}-03-01`)
          });
        } else {
          // Fallback to current FY
          setDateRange(getCurrentFinancialYear());
        }
      } else {
        // No emissions, use current FY
        setDateRange(getCurrentFinancialYear());
      }
    } catch (error) {
      console.error('Error fetching latest period:', error);
      // Fallback to current FY
      setDateRange(getCurrentFinancialYear());
    }
  };

  // Re-fetch stats when filters change
  useEffect(() => {
    if (dateRange.from && dateRange.to) {
      fetchStats();
    }
  }, [selectedFacilities, dateRange]);

  const fetchStats = async () => {
    try {
      // Build query params for filtering
      const params = new URLSearchParams();
      
      // Handle multiple facilities
      if (selectedFacilities.length > 0) {
        selectedFacilities.forEach(fid => params.append('facility_id', fid));
      }
      
      if (dateRange.from) {
        const startPeriod = format(dateRange.from, 'yyyy-MM');
        params.append('start_period', startPeriod);
      }
      if (dateRange.to) {
        const endPeriod = format(dateRange.to, 'yyyy-MM');
        params.append('end_period', endPeriod);
      }
      
      const queryString = params.toString();
      const url = queryString ? `${API}/dashboard/stats?${queryString}` : `${API}/dashboard/stats`;
      
      const response = await axios.get(url, {
        headers: getAuthHeader()
      });
      setStats(response.data);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      setStats({
        total_facilities: 0,
        total_emissions: 0,
        scope1_emissions: 0,
        scope2_emissions: 0,
        biogenic_emissions: 0,
        recent_records: [],
        emissions_by_facility: [],
        emissions_trend: [],
        emissions_by_category: [],
        emissions_by_fuel: [],
        yearly_fuel_analysis: [],
        yearly_facility_analysis: [],
        monthly_comparison: [],
        sinks_total: 0,
        sinks_by_facility: []
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      setFacilities(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  // Filter and calculate data based on selections
  // Note: Most filtering is now done server-side, this handles display calculations
  const filteredData = useMemo(() => {
    if (!stats) return { trend: [], facilities: [], totals: { scope1: 0, scope2: 0, scope3: 0, biogenic: 0, total: 0 }, filteredSinks: 0 };

    // Use the data as-is since backend already filtered
    const filteredTrend = stats.emissions_trend || [];
    const filteredFacilities = stats.emissions_by_facility || [];

    // Use backend-calculated totals directly (more accurate than recalculating from facilities)
    const totals = {
      scope1: stats.scope1_emissions || filteredFacilities.reduce((sum, f) => sum + (f.scope1_emissions || 0), 0),
      scope2: stats.scope2_emissions || filteredFacilities.reduce((sum, f) => sum + (f.scope2_emissions || 0), 0),
      scope3: stats.scope3_emissions || filteredFacilities.reduce((sum, f) => sum + (f.scope3_emissions || 0), 0),
      biogenic: stats.biogenic_emissions || filteredFacilities.reduce((sum, f) => sum + (f.biogenic_emissions || 0), 0),
      total: 0
    };

    // Include scope3 in total only if org has access
    totals.total = totals.scope1 + totals.scope2 + totals.biogenic + (hasScope3Access ? totals.scope3 : 0);
    
    // Sinks are already filtered by backend when facility is selected
    const filteredSinks = stats.sinks_total || 0;

    return { trend: filteredTrend, facilities: filteredFacilities, totals, filteredSinks };
  }, [stats, hasScope3Access]);

  // Prepare scope data for pie chart
  const scopeData = useMemo(() => {
    // Define in explicit order: Scope 1, Scope 2, Scope 3 (if access), Biogenic
    const data = [
      { name: 'Scope 1', value: filteredData.totals.scope1, color: SCOPE_COLORS.scope1, order: 1 },
      { name: 'Scope 2', value: filteredData.totals.scope2, color: SCOPE_COLORS.scope2, order: 2 },
    ];
    
    // Only include Scope 3 if organization has access
    if (hasScope3Access) {
      data.push({ name: 'Scope 3', value: filteredData.totals.scope3, color: SCOPE_COLORS.scope3, order: 3 });
    }
    
    data.push({ name: 'Biogenic', value: filteredData.totals.biogenic, color: SCOPE_COLORS.biogenic, order: 4 });
    
    return data;
  }, [filteredData.totals, hasScope3Access]);

  // Prepare base year comparison data - SEPARATE base years for Direct and Indirect
  const baseYearComparison = useMemo(() => {
    if (!stats) return null;
    
    const currentTotals = filteredData.totals;
    const directData = baseYearData?.direct;
    const indirectData = baseYearData?.indirect;
    
    // If neither direct nor indirect base year is configured, return null
    if (!directData && !indirectData) return null;
    
    // Helper function to aggregate emissions by scope from base year data
    const aggregateByScope = (emissionsArray) => {
      const result = { scope1: 0, scope2: 0, scope3: 0, biogenic: 0 };
      if (Array.isArray(emissionsArray)) {
        emissionsArray.forEach(entry => {
          const scope = (entry.scope || '').toLowerCase();
          const value = parseFloat(entry.tco2e) || 0;
          
          if (scope === 'scope1' || scope === 'scope 1') {
            result.scope1 += value;
          } else if (scope === 'scope2' || scope === 'scope 2') {
            result.scope2 += value;
          } else if (scope === 'scope3' || scope === 'scope 3') {
            result.scope3 += value;
          } else if (scope === 'biogenic') {
            result.biogenic += value;
          }
        });
      }
      return result;
    };
    
    // Calculate direct emissions base year data
    const directBaseEmissions = directData ? aggregateByScope(directData.emissions_data) : { scope1: 0, scope2: 0 };
    const directBaseYear = directData?.base_year || null;
    const directConfigured = !!directData;
    
    // Calculate indirect emissions base year data
    const indirectBaseEmissions = indirectData ? aggregateByScope(indirectData.emissions_data) : { scope3: 0, biogenic: 0 };
    const indirectBaseYear = indirectData?.base_year || null;
    const indirectConfigured = !!indirectData;
    
    // Build direct comparison (Scope 1 & 2)
    const directComparison = [
      { scope: 'Scope 1', base: directBaseEmissions.scope1, current: currentTotals.scope1, color: SCOPE_COLORS.scope1 },
      { scope: 'Scope 2', base: directBaseEmissions.scope2, current: currentTotals.scope2, color: SCOPE_COLORS.scope2 },
    ];
    
    // Build indirect comparison (Scope 3 & Biogenic)
    const indirectComparison = [];
    if (hasScope3Access) {
      indirectComparison.push({ scope: 'Scope 3', base: indirectBaseEmissions.scope3, current: currentTotals.scope3, color: SCOPE_COLORS.scope3 });
    }
    indirectComparison.push({ scope: 'Biogenic', base: indirectBaseEmissions.biogenic, current: currentTotals.biogenic, color: SCOPE_COLORS.biogenic });
    
    // Calculate totals for direct
    const directBaseTotal = directBaseEmissions.scope1 + directBaseEmissions.scope2;
    const directCurrentTotal = currentTotals.scope1 + currentTotals.scope2;
    const directChangePercent = directBaseTotal > 0 ? ((directCurrentTotal - directBaseTotal) / directBaseTotal) * 100 : 0;
    
    // Calculate totals for indirect
    const indirectBaseTotal = indirectBaseEmissions.biogenic + (hasScope3Access ? indirectBaseEmissions.scope3 : 0);
    const indirectCurrentTotal = currentTotals.biogenic + (hasScope3Access ? currentTotals.scope3 : 0);
    const indirectChangePercent = indirectBaseTotal > 0 ? ((indirectCurrentTotal - indirectBaseTotal) / indirectBaseTotal) * 100 : 0;
    
    // Overall totals (combining both)
    const baseTotal = directBaseTotal + indirectBaseTotal;
    const currentTotal = directCurrentTotal + indirectCurrentTotal;
    const changePercent = baseTotal > 0 ? ((currentTotal - baseTotal) / baseTotal) * 100 : 0;
    
    return {
      // Direct emissions (Scope 1 & 2)
      directBaseYear,
      directConfigured,
      directComparison,
      directBaseTotal,
      directCurrentTotal,
      directChangePercent,
      
      // Indirect emissions (Scope 3 & Biogenic)
      indirectBaseYear,
      indirectConfigured,
      indirectComparison,
      indirectBaseTotal,
      indirectCurrentTotal,
      indirectChangePercent,
      
      // Overall
      baseTotal,
      currentTotal,
      changePercent
    };
  }, [baseYearData, stats, filteredData.totals, hasScope3Access]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) return null;

  const facilityCount = selectedFacilities.length === 0 ? stats.total_facilities : selectedFacilities.length;

  return (
    <div className="space-y-8" data-testid="dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Dashboard</h1>
          <p className="text-text-secondary">Overview of your GHG emissions data</p>
        </div>
        <Button
          onClick={() => setShowFilters(!showFilters)}
          variant="outline"
          className="rounded-full"
          data-testid="toggle-filters-btn"
        >
          <Filter className="w-4 h-4 mr-2" />
          {showFilters ? 'Hide' : 'Show'} Filters
        </Button>
      </div>

      {showFilters && (
        <Card className="p-4 border border-stone-200 rounded-xl bg-white" data-testid="filter-panel">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Month/Year Range Picker */}
            <div className="space-y-2">
              <Label>Filter by Month Range</Label>
              <div className="flex gap-2 items-center">
                <MonthYearPicker
                  value={dateRange.from ? format(dateRange.from, 'yyyy-MM') : ''}
                  onChange={(val) => {
                    const newFrom = val ? new Date(val + '-01') : null;
                    setDateRange(prev => ({ 
                      ...prev, 
                      from: newFrom,
                      // Clear 'to' if it's before new 'from'
                      to: prev.to && newFrom && prev.to < newFrom ? null : prev.to
                    }));
                  }}
                  maxDate={dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined}
                  disableFuture={true}
                  placeholder="From"
                  className="flex-1 bg-stone-50"
                />
                <span className="text-stone-400">to</span>
                <MonthYearPicker
                  value={dateRange.to ? format(dateRange.to, 'yyyy-MM') : ''}
                  onChange={(val) => setDateRange(prev => ({ 
                    ...prev, 
                    to: val ? new Date(val + '-01') : null 
                  }))}
                  minDate={dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined}
                  disableFuture={true}
                  placeholder="To"
                  className="flex-1 bg-stone-50"
                />
              </div>
              {/* Quick year selection buttons */}
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => {
                    const currentYear = new Date().getFullYear();
                    const currentMonth = new Date().getMonth() + 1;
                    // If before April, FY started previous year
                    const fyStartYear = currentMonth < 4 ? currentYear - 1 : currentYear;
                    setDateRange({
                      from: new Date(`${fyStartYear}-04-01`),
                      to: new Date(`${fyStartYear + 1}-03-01`)
                    });
                  }}
                  className="px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
                >
                  Current FY
                </button>
                <button
                  onClick={() => {
                    const currentYear = new Date().getFullYear();
                    const currentMonth = new Date().getMonth() + 1;
                    const fyStartYear = currentMonth < 4 ? currentYear - 2 : currentYear - 1;
                    setDateRange({
                      from: new Date(`${fyStartYear}-04-01`),
                      to: new Date(`${fyStartYear + 1}-03-01`)
                    });
                  }}
                  className="px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 rounded transition-colors"
                >
                  Previous FY
                </button>
              </div>
            </div>

            {/* Facility Filter - Multiple Selection */}
            <div className="space-y-2 relative" ref={facilityDropdownRef}>
              <Label>Filter by Facility</Label>
              <div 
                className="w-full min-h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 cursor-pointer flex flex-wrap gap-1 items-center"
                onClick={() => setShowFacilityDropdown(!showFacilityDropdown)}
                data-testid="facility-filter"
              >
                {selectedFacilities.length === 0 ? (
                  <span className="text-stone-500">All Facilities</span>
                ) : (
                  selectedFacilities.map(fid => {
                    const facility = facilities.find(f => f.id === fid);
                    return (
                      <span key={fid} className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm flex items-center gap-1">
                        {facility?.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFacilities(prev => prev.filter(id => id !== fid));
                          }}
                          className="hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })
                )}
              </div>
              {showFacilityDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div
                    className="px-3 py-2 hover:bg-stone-50 cursor-pointer flex items-center gap-2"
                    onClick={() => {
                      setSelectedFacilities([]);
                      setShowFacilityDropdown(false);
                    }}
                  >
                    {selectedFacilities.length === 0 && <Check className="w-4 h-4 text-primary" />}
                    <span>All Facilities</span>
                  </div>
                  {facilities.map(f => (
                    <div
                      key={f.id}
                      className="px-3 py-2 hover:bg-stone-50 cursor-pointer flex items-center gap-2"
                      onClick={() => {
                        setSelectedFacilities(prev => 
                          prev.includes(f.id) 
                            ? prev.filter(id => id !== f.id)
                            : [...prev, f.id]
                        );
                      }}
                    >
                      {selectedFacilities.includes(f.id) && <Check className="w-4 h-4 text-primary" />}
                      <span className={selectedFacilities.includes(f.id) ? 'font-medium' : ''}>{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <Button
                onClick={() => {
                  setSelectedFacilities([]);
                  setDateRange(getCurrentFinancialYear());
                  setShowFacilityDropdown(false);
                }}
                variant="outline"
                className="w-full"
                data-testid="clear-filters-btn"
              >
                Reset to Default
              </Button>
            </div>
          </div>
          {(selectedFacilities.length > 0 || dateRange.from || dateRange.to) && (
            <div className="mt-3 p-2 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Filters applied: 
                {dateRange.from && ` From: ${format(dateRange.from, 'MMM yyyy')}`}
                {dateRange.to && ` To: ${format(dateRange.to, 'MMM yyyy')}`}
                {selectedFacilities.length > 0 && ` Facilities: ${selectedFacilities.map(fid => facilities.find(f => f.id === fid)?.name).join(', ')}`}
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className={`group p-6 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="total-facilities-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Facilities</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{facilityCount}</p>
            </div>
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
          </div>
        </Card>

        <Card className={`group p-6 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="total-emissions-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Emissions</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{filteredData.totals.total.toFixed(2)}</p>
              <p className="text-xs text-text-muted mt-1">tCO₂e</p>
            </div>
            <div className="bg-gradient-to-br from-secondary/20 to-secondary/5 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <TrendingUp className="w-6 h-6 text-secondary" />
            </div>
          </div>
        </Card>

        <Card className={`group p-6 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="scope-breakdown-card">
          <div className="flex items-start justify-between">
            <div className="w-full">
              <p className="text-text-muted text-sm font-medium mb-3">Emission By Scope</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-2 py-2 rounded-lg hover:bg-emerald-50/50 transition-colors">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]"></span>
                    Scope 1
                  </span>
                  <span className="text-sm font-semibold text-[#15803D]">{filteredData.totals.scope1.toFixed(2)} t</span>
                </div>
                <div className="flex justify-between items-center px-2 py-2 rounded-lg hover:bg-blue-50/50 transition-colors">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]"></span>
                    Scope 2
                  </span>
                  <span className="text-sm font-semibold text-[#2563EB]">{filteredData.totals.scope2.toFixed(2)} t</span>
                </div>
                {hasScope3Access && (
                  <div className="flex justify-between items-center px-2 py-2 rounded-lg hover:bg-amber-50/50 transition-colors">
                    <span className="text-sm text-text-secondary flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
                      Scope 3
                    </span>
                    <span className="text-sm font-semibold text-[#F59E0B]">{filteredData.totals.scope3.toFixed(2)} t</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-2 py-2 rounded-lg hover:bg-teal-50/50 transition-colors">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]"></span>
                    Biogenic
                  </span>
                  <span className="text-sm font-semibold text-[#0F766E]">{filteredData.totals.biogenic.toFixed(2)} t</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-accent/20 to-accent/5 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <Gauge className="w-6 h-6 text-accent" />
            </div>
          </div>
        </Card>
      </div>

      {/* NEW: Scope 3 Analytics Row + Sinks/Net Emissions - Only shown if org has Scope 3 access */}
      {hasScope3Access && stats?.scope3_by_category?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className={`group p-6 rounded-2xl ${glassCardStyle} ${glassCardHover}`} data-testid="scope3-categories-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-text-muted text-sm font-medium mb-1">Scope 3 Categories Reported</p>
                <p className="text-3xl font-heading font-bold text-purple-600">{stats?.scope3_categories_reported || 0}</p>
                <p className="text-xs text-text-muted mt-1">of 15 GHG Protocol Categories</p>
              </div>
              <div className="bg-gradient-to-br from-purple-400/30 to-violet-300/20 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Layers className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </Card>

          {/* Carbon Sinks Card */}
          <Card className={`group p-6 rounded-2xl bg-gradient-to-br from-green-500/10 via-emerald-100/50 to-teal-50/30 border border-green-200/50 ${glassCardHover}`} data-testid="sinks-total-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-green-700 text-sm font-medium mb-1">Carbon Sinks</p>
                <p className="text-3xl font-heading font-bold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">-{(filteredData.filteredSinks || 0).toFixed(2)}</p>
                <p className="text-xs text-green-600/80 mt-1">tCO₂e reduced/captured</p>
              </div>
              <div className="bg-gradient-to-br from-green-400/30 to-emerald-300/20 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <TreeDeciduous className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </Card>

          {/* Net Emissions Card */}
          <Card className={`group p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 via-blue-100/50 to-sky-50/30 border border-blue-200/50 ${glassCardHover}`} data-testid="net-emissions-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-blue-700 text-sm font-medium mb-1">Net Emissions</p>
                <p className="text-3xl font-heading font-bold bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
                  {(filteredData.totals.total - (filteredData.filteredSinks || 0)).toFixed(2)}
                </p>
                <p className="text-xs text-blue-600/80 mt-1">tCO₂e (Total - Sinks)</p>
              </div>
              <div className="bg-gradient-to-br from-blue-400/30 to-sky-300/20 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Minus className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* NEW: Scope 3 Visualizations - Only shown if org has Scope 3 access */}
      {hasScope3Access && stats?.scope3_by_category?.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Scope 1, 2, 3 Comparison Area Chart */}
          <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="scope-comparison-chart">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-heading font-bold text-text-primary">Scope 1, 2, 3 Emissions Trend</h3>
            </div>
            <p className="text-sm text-text-muted mb-4">Monthly comparison across all emission scopes</p>
            {filteredData.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={filteredData.trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScope1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SCOPE_COLORS.scope1} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={SCOPE_COLORS.scope1} stopOpacity={0.1}/>
                    </linearGradient>
                    <linearGradient id="colorScope2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SCOPE_COLORS.scope2} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={SCOPE_COLORS.scope2} stopOpacity={0.1}/>
                    </linearGradient>
                    <linearGradient id="colorScope3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SCOPE_COLORS.scope3} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={SCOPE_COLORS.scope3} stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="period" 
                    stroke="#71717A" 
                    tick={{ fontSize: 11 }}
                    interval={filteredData.trend.length > 12 ? 1 : 0}
                    angle={filteredData.trend.length > 12 ? -45 : 0}
                    textAnchor={filteredData.trend.length > 12 ? "end" : "middle"}
                  />
                  <YAxis stroke="#71717A" />
                  <RechartsTooltip 
                    formatter={(value, name) => [`${Number(value).toFixed(2)} tCO₂e`, name]}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  <Legend 
                    content={() => (
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></div>
                          <span className="text-sm text-gray-600">Scope 1</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></div>
                          <span className="text-sm text-gray-600">Scope 2</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: SCOPE_COLORS.scope3 }}></div>
                          <span className="text-sm text-gray-600">Scope 3</span>
                        </div>
                      </div>
                    )}
                  />
                  <Area type="monotone" dataKey="scope1" stroke={SCOPE_COLORS.scope1} fill="url(#colorScope1)" strokeWidth={2} name="Scope 1" />
                  <Area type="monotone" dataKey="scope2" stroke={SCOPE_COLORS.scope2} fill="url(#colorScope2)" strokeWidth={2} name="Scope 2" />
                  <Area type="monotone" dataKey="scope3" stroke={SCOPE_COLORS.scope3} fill="url(#colorScope3)" strokeWidth={2} name="Scope 3" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-text-muted">
                No trend data available
              </div>
            )}
          </Card>

          {/* Premium Scope 3 Category Hotspots with Ranking Panel */}
          <Card className={`p-6 rounded-2xl ${glassCardStyle}`} data-testid="scope3-category-chart">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-gradient-to-br from-red-400/30 to-orange-300/20 p-2 rounded-lg">
                  <Layers className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-bold text-text-primary">Scope 3 Emission Hotspots</h3>
                  <p className="text-sm text-text-muted">Top 4 contributing categories</p>
                </div>
              </div>
            </div>
            
            {stats?.scope3_by_category?.length > 0 ? (
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Horizontal Bar Chart - Only top 4 */}
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart 
                      data={stats.scope3_by_category.slice(0, 4)} 
                      layout="vertical" 
                      margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={true} vertical={false} />
                      <XAxis 
                        type="number" 
                        stroke="#71717A" 
                        tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis 
                        dataKey="category" 
                        type="category" 
                        stroke="#71717A" 
                        width={55}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => {
                          const match = value.match(/^(C\d+)/);
                          return match ? match[1] : value.substring(0, 6);
                        }}
                      />
                      <RechartsTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0]?.payload;
                            return (
                              <div className="bg-white/98 backdrop-blur-xl border border-stone-200 rounded-xl shadow-xl p-3 max-w-xs">
                                <p className="font-semibold text-stone-800 mb-1 text-sm">{data?.category}</p>
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between gap-3">
                                    <span className="text-stone-500">Emissions:</span>
                                    <span className="font-bold text-stone-700">{data?.total_emissions?.toFixed(2)} tCO₂e</span>
                                  </div>
                                  <div className="flex justify-between gap-3">
                                    <span className="text-stone-500">Contribution:</span>
                                    <span className="font-bold text-amber-600">{data?.percentage}%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="total_emissions" radius={[0, 6, 6, 0]}>
                        {stats.scope3_by_category.slice(0, 4).map((entry, index) => {
                          // Severity-based colors: High = Red/Orange, Medium = Amber, Low = Green
                          const maxEmission = stats.scope3_by_category[0]?.total_emissions || 1;
                          const ratio = entry.total_emissions / maxEmission;
                          let fillColor;
                          if (ratio >= 0.7) fillColor = '#EF4444';      // Red - High
                          else if (ratio >= 0.4) fillColor = '#F97316'; // Orange - Medium-High
                          else if (ratio >= 0.2) fillColor = '#F59E0B'; // Amber - Medium
                          else fillColor = '#10B981';                   // Green - Low
                          return <Cell key={`cell-${index}`} fill={fillColor} className="hover:opacity-80 transition-opacity cursor-pointer" />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Ranking Panel - Only top 4 */}
                <div className="lg:w-[200px] space-y-2">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Top Hotspots</p>
                  {stats.scope3_by_category.slice(0, 4).map((cat, index) => {
                    const match = cat.category.match(/^(C\d+)/);
                    const categoryCode = match ? match[1] : `#${index + 1}`;
                    const isTop = index === 0;
                    return (
                      <div 
                        key={index}
                        className={`p-2.5 rounded-lg transition-all ${
                          isTop 
                            ? 'bg-gradient-to-r from-red-50 to-orange-50 border border-red-200/50' 
                            : 'bg-stone-50/60 hover:bg-stone-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            isTop ? 'bg-red-500 text-white' : 'bg-stone-200 text-stone-600'
                          }`}>
                            #{index + 1}
                          </span>
                          <span className="text-[11px] font-medium text-stone-600 truncate flex-1" title={cat.category}>
                            {categoryCode}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1.5">
                          <span className={`text-sm font-bold ${isTop ? 'text-red-600' : 'text-stone-700'}`}>
                            {cat.percentage}%
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {cat.total_emissions >= 1000 ? `${(cat.total_emissions/1000).toFixed(1)}k` : cat.total_emissions.toFixed(0)} t
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-text-muted">
                No Scope 3 category data available
              </div>
            )}
            
            {/* Executive Insight */}
            {stats?.scope3_by_category?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-stone-200/50">
                <div className="flex items-start gap-2 text-sm text-stone-600 bg-red-50/50 rounded-lg p-2.5">
                  <TrendingUp className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs">
                    {stats.scope3_by_category[0]?.percentage >= 50 
                      ? `${stats.scope3_by_category[0]?.percentage}% of Scope 3 emissions originate from a single category — significant reduction opportunity.`
                      : `Top ${Math.min(4, stats.scope3_by_category.length)} categories contribute ${
                        stats.scope3_by_category.slice(0, 4).reduce((sum, c) => sum + parseFloat(c.percentage), 0).toFixed(0)
                      }% of total Scope 3 emissions.`
                    }
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Phase 2: Base Year Comparison Card - Shows only if at least one base year is configured */}
      {baseYearComparison && (
        <Card className={`p-6 rounded-2xl ${glassCardStyle} border-l-4 border-l-primary mt-8`} data-testid="base-year-comparison-card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-3 rounded-xl">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-bold text-text-primary">Base Year Comparison</h3>
                <p className="text-sm text-text-muted">Tracking emissions progress against base year</p>
              </div>
            </div>
            {baseYearComparison.baseTotal > 0 && (
              <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
                baseYearComparison.changePercent < 0 
                  ? 'bg-green-100 text-green-700' 
                  : baseYearComparison.changePercent > 0 
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
              }`}>
                {baseYearComparison.changePercent > 0 ? '+' : ''}{baseYearComparison.changePercent.toFixed(1)}% Overall
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Direct Emissions (Scope 1 & 2) */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/50 to-blue-50/50 border border-emerald-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Direct Emissions</h4>
                  <p className="text-xs text-text-muted">Scope 1 & Scope 2</p>
                </div>
                {baseYearComparison.directConfigured ? (
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    baseYearComparison.directChangePercent < 0 
                      ? 'bg-green-100 text-green-700' 
                      : baseYearComparison.directChangePercent > 0 
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}>
                    {baseYearComparison.directChangePercent > 0 ? '+' : ''}{baseYearComparison.directChangePercent.toFixed(1)}%
                  </div>
                ) : (
                  <div className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                    Not Configured
                  </div>
                )}
              </div>
              
              {baseYearComparison.directConfigured ? (
                <>
                  {/* Base Year Label */}
                  <div className="mb-3 px-2 py-1 bg-emerald-100/50 rounded-md inline-block">
                    <p className="text-xs font-medium text-emerald-700">Base Year: {baseYearComparison.directBaseYear}</p>
                  </div>
                  
                  {/* Direct Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-white/60">
                      <p className="text-xs text-text-muted">Base ({baseYearComparison.directBaseYear})</p>
                      <p className="text-lg font-bold text-stone-600">{baseYearComparison.directBaseTotal.toFixed(1)}t</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/60">
                      <p className="text-xs text-text-muted">Current</p>
                      <p className="text-lg font-bold text-emerald-600">{baseYearComparison.directCurrentTotal.toFixed(1)}t</p>
                    </div>
                  </div>
                  
                  {/* Direct Scope Bars */}
                  <div className="space-y-3">
                    {baseYearComparison.directComparison.map((item, idx) => {
                      const maxVal = Math.max(item.base, item.current, 1);
                      const baseWidth = (item.base / maxVal) * 100;
                      const currentWidth = (item.current / maxVal) * 100;
                      const change = item.base > 0 ? ((item.current - item.base) / item.base) * 100 : 0;
                      
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-medium" style={{ color: item.color }}>{item.scope}</span>
                            <span className={`text-xs font-semibold ${change < 0 ? 'text-green-600' : change > 0 ? 'text-red-500' : 'text-gray-500'}`}>
                              {change > 0 ? '+' : ''}{change.toFixed(1)}%
                            </span>
                          </div>
                          <div className="relative h-5 bg-white/80 rounded-full overflow-hidden">
                            <div 
                              className="absolute h-2.5 top-0 rounded-full opacity-40" 
                              style={{ width: `${baseWidth}%`, backgroundColor: item.color }}
                            />
                            <div 
                              className="absolute h-2.5 bottom-0 rounded-full" 
                              style={{ width: `${currentWidth}%`, backgroundColor: item.color }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-text-muted">
                            <span>Base: {item.base.toFixed(1)}t</span>
                            <span>Current: {item.current.toFixed(1)}t</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                    <Target className="w-6 h-6 text-amber-500" />
                  </div>
                  <p className="text-sm font-medium text-text-secondary">Base Year Not Configured</p>
                  <p className="text-xs text-text-muted mt-1">Configure base year for Scope 1 & 2 in Base Year Emissions</p>
                  <p className="text-sm font-semibold text-emerald-600 mt-3">Current: {baseYearComparison.directCurrentTotal.toFixed(1)}t</p>
                </div>
              )}
            </div>
            
            {/* Indirect Emissions (Scope 3 & Biogenic) */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50/50 to-orange-50/50 border border-purple-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Indirect Emissions</h4>
                  <p className="text-xs text-text-muted">Scope 3 & Biogenic</p>
                </div>
                {baseYearComparison.indirectConfigured ? (
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    baseYearComparison.indirectChangePercent < 0 
                      ? 'bg-green-100 text-green-700' 
                      : baseYearComparison.indirectChangePercent > 0 
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}>
                    {baseYearComparison.indirectChangePercent > 0 ? '+' : ''}{baseYearComparison.indirectChangePercent.toFixed(1)}%
                  </div>
                ) : (
                  <div className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                    Not Configured
                  </div>
                )}
              </div>
              
              {baseYearComparison.indirectConfigured ? (
                <>
                  {/* Base Year Label */}
                  <div className="mb-3 px-2 py-1 bg-purple-100/50 rounded-md inline-block">
                    <p className="text-xs font-medium text-purple-700">Base Year: {baseYearComparison.indirectBaseYear}</p>
                  </div>
                  
                  {/* Indirect Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-white/60">
                      <p className="text-xs text-text-muted">Base ({baseYearComparison.indirectBaseYear})</p>
                      <p className="text-lg font-bold text-stone-600">{baseYearComparison.indirectBaseTotal.toFixed(1)}t</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/60">
                      <p className="text-xs text-text-muted">Current</p>
                      <p className="text-lg font-bold text-purple-600">{baseYearComparison.indirectCurrentTotal.toFixed(1)}t</p>
                    </div>
                  </div>
                  
                  {/* Indirect Scope Bars */}
                  <div className="space-y-3">
                    {baseYearComparison.indirectComparison.map((item, idx) => {
                      const maxVal = Math.max(item.base, item.current, 1);
                      const baseWidth = (item.base / maxVal) * 100;
                      const currentWidth = (item.current / maxVal) * 100;
                      const change = item.base > 0 ? ((item.current - item.base) / item.base) * 100 : 0;
                      
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-medium" style={{ color: item.color }}>{item.scope}</span>
                            <span className={`text-xs font-semibold ${change < 0 ? 'text-green-600' : change > 0 ? 'text-red-500' : 'text-gray-500'}`}>
                              {change > 0 ? '+' : ''}{change.toFixed(1)}%
                            </span>
                          </div>
                          <div className="relative h-5 bg-white/80 rounded-full overflow-hidden">
                            <div 
                              className="absolute h-2.5 top-0 rounded-full opacity-40" 
                              style={{ width: `${baseWidth}%`, backgroundColor: item.color }}
                            />
                            <div 
                              className="absolute h-2.5 bottom-0 rounded-full" 
                              style={{ width: `${currentWidth}%`, backgroundColor: item.color }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-text-muted">
                            <span>Base: {item.base.toFixed(1)}t</span>
                            <span>Current: {item.current.toFixed(1)}t</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                    <Target className="w-6 h-6 text-amber-500" />
                  </div>
                  <p className="text-sm font-medium text-text-secondary">Base Year Not Configured</p>
                  <p className="text-xs text-text-muted mt-1">Configure base year for Scope 3 & Biogenic in Base Year Emissions</p>
                  <p className="text-sm font-semibold text-purple-600 mt-3">Current: {baseYearComparison.indirectCurrentTotal.toFixed(1)}t</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Premium Emissions by Scope - Donut + Ranking Style */}
      <Card className={`p-6 rounded-2xl ${glassCardStyle} mt-8`} data-testid="scope-chart">
        {(() => {
          const totalScopeEmissions = scopeData.reduce((sum, d) => sum + (d.value || 0), 0);
          const sortedScopes = [...scopeData]
            .filter(d => d.value > 0)
            .map(d => ({
              ...d,
              percentage: totalScopeEmissions > 0 ? ((d.value / totalScopeEmissions) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => b.value - a.value);
          
          const topScope = sortedScopes[0];
          
          return (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="bg-gradient-to-br from-blue-400/30 to-indigo-300/20 p-2 rounded-lg">
                    <Gauge className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-heading font-bold text-text-primary">Emissions by Scope</h3>
                    <p className="text-sm text-text-muted">GHG Protocol scope breakdown</p>
                  </div>
                </div>
                {topScope && (
                  <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: topScope.color }}></span>
                    {topScope.name}: {topScope.percentage}%
                  </div>
                )}
              </div>
              
              {sortedScopes.length > 0 ? (
                <div className="flex flex-col lg:flex-row items-center gap-4">
                  {/* Donut Chart with Central KPI */}
                  <div className="relative flex-shrink-0">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={sortedScopes}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {sortedScopes.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity cursor-pointer" />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0]?.payload;
                              return (
                                <div className="bg-white/98 backdrop-blur-xl border border-stone-200 rounded-xl shadow-xl p-3 max-w-[200px]">
                                  <p className="font-semibold text-stone-800 text-sm mb-1">{data?.name}</p>
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between gap-3">
                                      <span className="text-stone-500">Emissions:</span>
                                      <span className="font-bold">{data?.value?.toLocaleString(undefined, {maximumFractionDigits: 2})} t</span>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                      <span className="text-stone-500">Contribution:</span>
                                      <span className="font-bold" style={{ color: data?.color }}>{data?.percentage}%</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Central KPI */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-lg font-bold text-stone-700">
                          {totalScopeEmissions >= 1000000 
                            ? `${(totalScopeEmissions/1000000).toFixed(1)}M`
                            : totalScopeEmissions >= 1000 
                              ? `${(totalScopeEmissions/1000).toFixed(0)}k`
                              : totalScopeEmissions.toFixed(0)
                          }
                        </p>
                        <p className="text-[10px] text-stone-400">tCO₂e</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Scope Ranking List */}
                  <div className="flex-1 space-y-2 w-full">
                    {sortedScopes.map((scope, index) => (
                      <div 
                        key={index}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-stone-50 transition-colors group"
                      >
                        <div 
                          className="w-3 h-10 rounded-full flex-shrink-0"
                          style={{ backgroundColor: scope.color }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-stone-700 group-hover:text-stone-900">{scope.name}</span>
                            <span className="text-base font-bold" style={{ color: scope.color }}>
                              {scope.percentage}%
                            </span>
                          </div>
                          <span className="text-xs text-stone-500">
                            {scope.value >= 1000000 
                              ? `${(scope.value/1000000).toFixed(2)}M t`
                              : scope.value >= 1000 
                                ? `${(scope.value/1000).toFixed(1)}k t`
                                : `${scope.value.toFixed(2)} t`
                            }
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex flex-col items-center justify-center text-text-muted">
                  <Gauge className="w-12 h-12 text-stone-300 mb-2" />
                  <p className="text-sm">No scope data available</p>
                </div>
              )}
              
              {/* Executive Insight */}
              {topScope && (
                <div className="mt-4 pt-3 border-t border-stone-200/50">
                  <div className="flex items-start gap-2 text-sm text-stone-600 bg-blue-50/50 rounded-lg p-2.5">
                    <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">
                      <span className="font-semibold text-blue-700">{topScope.name}</span> accounts for {topScope.percentage}% of total emissions
                      {parseFloat(topScope.percentage) >= 80 ? ' — dominant emission source.' : '.'}
                    </p>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </Card>

      {/* Premium Emission Category & Fuel Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Emission Categories - Premium Ranked Contribution Chart */}
        <Card className={`p-6 rounded-2xl ${glassCardStyle}`} data-testid="category-analysis-chart">
          {(() => {
            // Process and rank categories
            const allCategories = stats?.emissions_by_category || [];
            const totalEmissions = allCategories.reduce((sum, c) => sum + (c.total_emissions || 0), 0);
            
            // Sort by emissions and calculate percentages
            const sortedCategories = [...allCategories]
              .filter(c => c.total_emissions > 0)
              .map(c => ({
                ...c,
                percentage: totalEmissions > 0 ? ((c.total_emissions / totalEmissions) * 100).toFixed(1) : 0
              }))
              .sort((a, b) => b.total_emissions - a.total_emissions);
            
            // Top 5 + Others aggregation
            const topCategories = sortedCategories.slice(0, 5);
            const othersEmissions = sortedCategories.slice(5).reduce((sum, c) => sum + c.total_emissions, 0);
            const othersPercentage = totalEmissions > 0 ? ((othersEmissions / totalEmissions) * 100).toFixed(1) : 0;
            
            if (othersEmissions > 0) {
              topCategories.push({
                category: 'Others',
                total_emissions: othersEmissions,
                percentage: othersPercentage
              });
            }
            
            const topContributor = sortedCategories[0];
            const maxEmission = topCategories[0]?.total_emissions || 1;
            
            return (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-br from-emerald-400/30 to-green-300/20 p-2 rounded-lg">
                      <Factory className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-bold text-text-primary">Emission Categories</h3>
                      <p className="text-sm text-text-muted">Ranked contribution breakdown</p>
                    </div>
                  </div>
                  {topContributor && (
                    <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Top: {topContributor.percentage}%
                    </div>
                  )}
                </div>
                
                {topCategories.length > 0 ? (
                  <>
                    {/* Contribution Bars */}
                    <div className="space-y-3">
                      {topCategories.map((cat, index) => {
                        const widthPercent = (cat.total_emissions / maxEmission) * 100;
                        const isTop = index === 0;
                        const categoryColors = {
                          'Stationary Combustion': '#059669',
                          'Mobile Combustion': '#2563EB',
                          'Fugitive Emissions': '#F59E0B',
                          'Purchased Electricity': '#8B5CF6',
                          'Purchased Heat/Steam': '#EC4899',
                          'Process Emissions': '#06B6D4',
                          'Others': '#9CA3AF',
                        };
                        const barColor = categoryColors[cat.category] || COLORS[index % COLORS.length];
                        
                        return (
                          <div key={index} className="group">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  isTop ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-600'
                                }`}>
                                  #{index + 1}
                                </span>
                                <span className="text-sm font-medium text-stone-700 group-hover:text-stone-900 transition-colors" title={cat.category}>
                                  {cat.category}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold" style={{ color: barColor }}>
                                  {cat.percentage}%
                                </span>
                                <span className="text-xs text-stone-500 min-w-[70px] text-right">
                                  {cat.total_emissions >= 1000000 
                                    ? `${(cat.total_emissions/1000000).toFixed(2)}M t`
                                    : cat.total_emissions >= 1000 
                                      ? `${(cat.total_emissions/1000).toFixed(1)}k t`
                                      : `${cat.total_emissions.toFixed(1)} t`
                                  }
                                </span>
                              </div>
                            </div>
                            <div className="h-6 bg-stone-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all duration-500 group-hover:opacity-90"
                                style={{ 
                                  width: `${widthPercent}%`,
                                  background: isTop 
                                    ? `linear-gradient(90deg, ${barColor} 0%, ${barColor}CC 100%)`
                                    : barColor
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Executive Insight */}
                    {topContributor && (
                      <div className="mt-5 pt-4 border-t border-stone-200/50">
                        <div className="flex items-start gap-2 text-sm text-stone-600 bg-emerald-50/50 rounded-lg p-3">
                          <Info className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <p>
                            <span className="font-semibold text-emerald-700">{topContributor.category}</span> contributes {topContributor.percentage}% of total emissions
                            {parseFloat(topContributor.percentage) >= 70 ? ' — primary reduction target.' : '.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-[280px] flex flex-col items-center justify-center text-text-muted">
                    <Factory className="w-12 h-12 text-stone-300 mb-2" />
                    <p className="text-sm">No category data available</p>
                  </div>
                )}
              </>
            );
          })()}
        </Card>

        {/* Fuel Type Analysis - Premium Donut + Ranking */}
        <Card className={`p-6 rounded-2xl ${glassCardStyle}`} data-testid="fuel-analysis-chart">
          {(() => {
            const allFuels = stats?.emissions_by_fuel || [];
            const totalFuelEmissions = allFuels.reduce((sum, f) => sum + (f.total_emissions || 0), 0);
            
            // Sort and add percentages
            const sortedFuels = [...allFuels]
              .filter(f => f.total_emissions > 0)
              .map(f => ({
                ...f,
                percentage: totalFuelEmissions > 0 ? ((f.total_emissions / totalFuelEmissions) * 100).toFixed(1) : 0
              }))
              .sort((a, b) => b.total_emissions - a.total_emissions);
            
            // Top 5 + Others for donut
            const topFuels = sortedFuels.slice(0, 5);
            const othersFuelEmissions = sortedFuels.slice(5).reduce((sum, f) => sum + f.total_emissions, 0);
            const othersFuelPercentage = totalFuelEmissions > 0 ? ((othersFuelEmissions / totalFuelEmissions) * 100).toFixed(1) : 0;
            
            if (othersFuelEmissions > 0) {
              topFuels.push({
                fuel_type: 'Others',
                total_emissions: othersFuelEmissions,
                percentage: othersFuelPercentage
              });
            }
            
            const topFuel = sortedFuels[0];
            
            // Fuel colors - fossil fuels warm, electricity blue/purple, renewables green
            const fuelColors = ['#EF4444', '#F97316', '#F59E0B', '#8B5CF6', '#3B82F6', '#9CA3AF'];
            const donutData = topFuels.map((f, i) => ({
              name: f.fuel_type,
              value: f.total_emissions,
              percentage: f.percentage,
              fill: fuelColors[i % fuelColors.length]
            }));
            
            return (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-br from-orange-400/30 to-red-300/20 p-2 rounded-lg">
                      <Flame className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-bold text-text-primary">Fuel Type Analysis</h3>
                      <p className="text-sm text-text-muted">Emissions by fuel source</p>
                    </div>
                  </div>
                  {topFuel && (
                    <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 flex items-center gap-1.5">
                      <Flame className="w-3 h-3" />
                      {topFuel.fuel_type.length > 12 ? topFuel.fuel_type.substring(0, 10) + '...' : topFuel.fuel_type}
                    </div>
                  )}
                </div>
                
                {donutData.length > 0 ? (
                  <div className="flex flex-col lg:flex-row items-center gap-4">
                    {/* Donut Chart with Central KPI */}
                    <div className="relative flex-shrink-0">
                      <ResponsiveContainer width={180} height={180}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="#fff"
                            strokeWidth={2}
                          >
                            {donutData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity cursor-pointer" />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0]?.payload;
                                return (
                                  <div className="bg-white/98 backdrop-blur-xl border border-stone-200 rounded-xl shadow-xl p-3 max-w-[200px]">
                                    <p className="font-semibold text-stone-800 text-sm mb-1">{data?.name}</p>
                                    <div className="space-y-1 text-xs">
                                      <div className="flex justify-between gap-3">
                                        <span className="text-stone-500">Emissions:</span>
                                        <span className="font-bold">{data?.value?.toLocaleString(undefined, {maximumFractionDigits: 2})} t</span>
                                      </div>
                                      <div className="flex justify-between gap-3">
                                        <span className="text-stone-500">Contribution:</span>
                                        <span className="font-bold text-orange-600">{data?.percentage}%</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Central KPI */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                          <p className="text-lg font-bold text-stone-700">
                            {totalFuelEmissions >= 1000000 
                              ? `${(totalFuelEmissions/1000000).toFixed(1)}M`
                              : totalFuelEmissions >= 1000 
                                ? `${(totalFuelEmissions/1000).toFixed(0)}k`
                                : totalFuelEmissions.toFixed(0)
                            }
                          </p>
                          <p className="text-[10px] text-stone-400">tCO₂e</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Fuel Ranking List */}
                    <div className="flex-1 space-y-2 w-full">
                      {topFuels.slice(0, 5).map((fuel, index) => (
                        <div 
                          key={index}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-stone-50 transition-colors group"
                        >
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: fuelColors[index % fuelColors.length] }}
                          />
                          <span className="text-xs text-stone-600 flex-1 truncate group-hover:text-stone-800" title={fuel.fuel_type}>
                            {fuel.fuel_type.length > 18 ? fuel.fuel_type.substring(0, 16) + '...' : fuel.fuel_type}
                          </span>
                          <span className="text-xs font-bold" style={{ color: fuelColors[index % fuelColors.length] }}>
                            {fuel.percentage}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex flex-col items-center justify-center text-text-muted">
                    <Flame className="w-12 h-12 text-stone-300 mb-2" />
                    <p className="text-sm">No fuel data available</p>
                  </div>
                )}
                
                {/* Executive Insight */}
                {topFuel && (
                  <div className="mt-4 pt-3 border-t border-stone-200/50">
                    <div className="flex items-start gap-2 text-sm text-stone-600 bg-orange-50/50 rounded-lg p-2.5">
                      <Flame className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs">
                        <span className="font-semibold text-orange-700">{topFuel.fuel_type}</span> accounts for {topFuel.percentage}% of fuel-related emissions.
                      </p>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </Card>
      </div>

      {/* Year-wise Analysis - Premium ESG Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <Card className={`p-6 rounded-2xl ${glassCardStyle}`} data-testid="yearly-fuel-chart">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-cyan-400/30 to-blue-300/20 p-2 rounded-lg">
                <Calendar className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-bold text-text-primary">Year-wise Emissions</h3>
                <p className="text-sm text-text-muted">Total emissions by reporting year</p>
              </div>
            </div>
            {stats?.yearly_fuel_analysis?.length >= 2 && (
              <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                (stats.yearly_fuel_analysis[stats.yearly_fuel_analysis.length - 1]?.total_emissions || 0) <
                (stats.yearly_fuel_analysis[stats.yearly_fuel_analysis.length - 2]?.total_emissions || 0)
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {(() => {
                  const current = stats.yearly_fuel_analysis[stats.yearly_fuel_analysis.length - 1]?.total_emissions || 0;
                  const previous = stats.yearly_fuel_analysis[stats.yearly_fuel_analysis.length - 2]?.total_emissions || 1;
                  const change = ((current - previous) / previous) * 100;
                  return `${change > 0 ? '+' : ''}${change.toFixed(1)}% YoY`;
                })()}
              </div>
            )}
          </div>
          {stats?.yearly_fuel_analysis?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.yearly_fuel_analysis} margin={{ bottom: 20 }}>
                <defs>
                  <linearGradient id="yearBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#0891B2" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis 
                  dataKey="year" 
                  stroke="#71717A" 
                  tick={{ fontSize: 11 }}
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#71717A" 
                  tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}
                />
                <RechartsTooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0]?.payload;
                      const index = stats.yearly_fuel_analysis.findIndex(y => y.year === label);
                      const prevYear = index > 0 ? stats.yearly_fuel_analysis[index - 1] : null;
                      const yoyChange = prevYear ? ((data.total_emissions - prevYear.total_emissions) / prevYear.total_emissions) * 100 : null;
                      return (
                        <div className="bg-white/98 backdrop-blur-xl border border-stone-200 rounded-xl shadow-xl p-3 min-w-[180px]">
                          <p className="font-semibold text-stone-800 mb-2">{label}</p>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-sm text-stone-500">Total Emissions:</span>
                              <span className="text-sm font-bold text-cyan-600">{data?.total_emissions?.toLocaleString(undefined, {maximumFractionDigits: 2})} t</span>
                            </div>
                            {yoyChange !== null && (
                              <div className="flex justify-between gap-4 border-t border-stone-100 pt-1 mt-1">
                                <span className="text-xs text-stone-400">vs Previous Year:</span>
                                <span className={`text-xs font-semibold ${yoyChange < 0 ? 'text-green-600' : yoyChange > 0 ? 'text-red-500' : 'text-stone-500'}`}>
                                  {yoyChange > 0 ? '↑' : yoyChange < 0 ? '↓' : '–'} {Math.abs(yoyChange).toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="total_emissions" fill="url(#yearBarGradient)" name="Total Emissions" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-text-muted">
              <Calendar className="w-12 h-12 text-stone-300 mb-2" />
              <p className="text-sm">Additional reporting periods needed for trend analysis</p>
            </div>
          )}
        </Card>

        <Card className={`p-6 rounded-2xl ${glassCardStyle}`} data-testid="yearly-facility-chart">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-emerald-400/30 to-green-300/20 p-2 rounded-lg">
                <Layers className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-bold text-text-primary">Year-wise Emission By Scope</h3>
                <p className="text-sm text-text-muted">Annual breakdown by emission scope</p>
              </div>
            </div>
          </div>
          {stats?.yearly_facility_analysis?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.yearly_facility_analysis} margin={{ bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis 
                  dataKey="year" 
                  stroke="#71717A" 
                  tick={{ fontSize: 11 }}
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#71717A" 
                  tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}
                />
                <RechartsTooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0]?.payload;
                      return (
                        <div className="bg-white/98 backdrop-blur-xl border border-stone-200 rounded-xl shadow-xl p-3 min-w-[180px]">
                          <p className="font-semibold text-stone-800 mb-2">{label}</p>
                          <div className="space-y-1.5">
                            <div className="flex justify-between gap-4">
                              <span className="text-sm flex items-center gap-1">
                                <span className="w-2 h-2 rounded" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></span>
                                Scope 1:
                              </span>
                              <span className="text-sm font-medium" style={{ color: SCOPE_COLORS.scope1 }}>{data?.scope1?.toLocaleString(undefined, {maximumFractionDigits: 2})} t</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-sm flex items-center gap-1">
                                <span className="w-2 h-2 rounded" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></span>
                                Scope 2:
                              </span>
                              <span className="text-sm font-medium" style={{ color: SCOPE_COLORS.scope2 }}>{data?.scope2?.toLocaleString(undefined, {maximumFractionDigits: 2})} t</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-sm flex items-center gap-1">
                                <span className="w-2 h-2 rounded" style={{ backgroundColor: SCOPE_COLORS.biogenic }}></span>
                                Biogenic:
                              </span>
                              <span className="text-sm font-medium" style={{ color: SCOPE_COLORS.biogenic }}>{data?.biogenic?.toLocaleString(undefined, {maximumFractionDigits: 2})} t</span>
                            </div>
                            <div className="flex justify-between gap-4 border-t border-stone-100 pt-1.5 mt-1">
                              <span className="text-sm font-semibold">Total:</span>
                              <span className="text-sm font-bold text-stone-700">{data?.total_emissions?.toLocaleString(undefined, {maximumFractionDigits: 2})} t</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  content={({ payload }) => (
                    <div className="flex justify-center gap-3 mt-2 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-stone-50/80 hover:bg-stone-100 transition-colors">
                        <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></div>
                        <span className="text-xs font-medium text-gray-600">Scope 1</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-stone-50/80 hover:bg-stone-100 transition-colors">
                        <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></div>
                        <span className="text-xs font-medium text-gray-600">Scope 2</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-stone-50/80 hover:bg-stone-100 transition-colors">
                        <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: SCOPE_COLORS.biogenic }}></div>
                        <span className="text-xs font-medium text-gray-600">Biogenic</span>
                      </div>
                    </div>
                  )}
                />
                <Bar dataKey="scope1" fill={SCOPE_COLORS.scope1} name="Scope 1" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="scope2" fill={SCOPE_COLORS.scope2} name="Scope 2" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="biogenic" fill={SCOPE_COLORS.biogenic} name="Biogenic" stackId="a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-text-muted">
              <Layers className="w-12 h-12 text-stone-300 mb-2" />
              <p className="text-sm">Additional reporting periods needed for scope analysis</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
