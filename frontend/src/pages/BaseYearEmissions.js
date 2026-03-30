import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Building, Building2, CalendarClock, Check, X, Loader2, History, Plus, AlertTriangle, Info, Eye, FileText, Trash2, Edit2, Leaf } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BaseYearEmissions() {
  const { user, getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [baseYearRecords, setBaseYearRecords] = useState([]);
  
  // Dialog states
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showEmissionsDialog, setShowEmissionsDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false); // NEW: Read-only view dialog
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showChangeYearDialog, setShowChangeYearDialog] = useState(false);
  
  // Setup flow states
  const [selectedEntity, setSelectedEntity] = useState(null); // { type: 'organization' | 'facility', id, name }
  const [oldestYearInfo, setOldestYearInfo] = useState(null);
  const [setupStep, setSetupStep] = useState('prompt'); // 'prompt', 'select_year', 'enter_emissions', 'enter_sinks'
  const [selectedYear, setSelectedYear] = useState('');
  const [useOldestYear, setUseOldestYear] = useState(null);
  const [isOldestYearRecord, setIsOldestYearRecord] = useState(false); // Track if record uses oldest year
  const [hasExistingEmissionsData, setHasExistingEmissionsData] = useState(false); // Track if emissions data exists for selected year
  const [isBeforeOldestYear, setIsBeforeOldestYear] = useState(false); // Track if base year is before oldest reporting year
  const [sinksExistInOldestYear, setSinksExistInOldestYear] = useState(false); // Track if sinks exist in oldest year
  const [baseYearSinkInputs, setBaseYearSinkInputs] = useState([]); // Inputs for base year sinks
  
  // View dialog state (for read-only viewing)
  const [viewRecord, setViewRecord] = useState(null);
  
  // Emissions entry states
  const [emissionCombinations, setEmissionCombinations] = useState([]);
  const [emissionsData, setEmissionsData] = useState([]);
  const [savingEmissions, setSavingEmissions] = useState(false);
  const [baseYearNotes, setBaseYearNotes] = useState(''); // Notes field for non-oldest year
  
  // History view state
  const [historyRecord, setHistoryRecord] = useState(null);
  const [deletionHistory, setDeletionHistory] = useState([]);
  
  // Change year states
  const [changeYearRecord, setChangeYearRecord] = useState(null);
  const [newBaseYear, setNewBaseYear] = useState('');
  const [changingYear, setChangingYear] = useState(false);
  
  // Cache of oldest years for each entity (for determining editability)
  const [entityOldestYears, setEntityOldestYears] = useState({}); // { 'org_123': '2023', 'fac_456': '2022' }
  
  // Sinks state for base year
  const [baseYearSinks, setBaseYearSinks] = useState([]); // Sinks matching the base year

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch organization
      const orgResponse = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      setOrganization(orgResponse.data);

      // Fetch facilities
      const facResponse = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      setFacilities(facResponse.data.filter(f => f.is_active !== false));

      // Fetch existing base year records
      const baseYearResponse = await axios.get(`${API}/base-year-emissions`, {
        headers: getAuthHeader()
      });
      setBaseYearRecords(baseYearResponse.data);
      
      // Pre-fetch oldest year info for all entities that have base year records
      // This is needed to determine editability (base year < oldest reporting year)
      const oldestYearsMap = {};
      const recordsWithEntities = baseYearResponse.data;
      
      // Build unique entity list from records
      const entityPromises = [];
      const entityKeys = new Set();
      
      for (const record of recordsWithEntities) {
        const entityType = record.facility_id ? 'facility' : 'organization';
        const entityId = record.facility_id || record.organization_id;
        const key = `${entityType}_${entityId}`;
        
        if (!entityKeys.has(key)) {
          entityKeys.add(key);
          entityPromises.push(
            axios.get(
              `${API}/base-year-emissions/oldest-year/${entityType}/${entityId}`,
              { headers: getAuthHeader() }
            ).then(res => ({ key, data: res.data }))
            .catch(() => ({ key, data: null }))
          );
        }
      }
      
      const results = await Promise.all(entityPromises);
      for (const result of results) {
        if (result.data?.oldest_year_formatted) {
          oldestYearsMap[result.key] = result.data.oldest_year_formatted;
        }
      }
      
      setEntityOldestYears(oldestYearsMap);
      
      // Fetch sinks data to display in base year view
      try {
        const sinksResponse = await axios.get(`${API}/sinks`, {
          headers: getAuthHeader()
        });
        setBaseYearSinks(sinksResponse.data);
      } catch (err) {
        console.error('Error fetching sinks:', err);
        // Don't block on sinks fetch error
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to compare years and check if baseYear < oldestYear
  const isYearBeforeOldest = (baseYear, oldestYear) => {
    if (!baseYear || !oldestYear) return false;
    
    // Extract numeric year from formats like "2024", "FY 2023-2024", etc.
    const extractYear = (yearStr) => {
      if (!yearStr) return 0;
      const match = yearStr.toString().match(/\d{4}/);
      return match ? parseInt(match[0]) : 0;
    };
    
    const baseYearNum = extractYear(baseYear);
    const oldestYearNum = extractYear(oldestYear);
    
    return baseYearNum < oldestYearNum;
  };

  // Check if a record can be edited (base year < oldest reporting year)
  // For this, we need to compare with the entity's oldest emission year
  const canEditRecord = async (record) => {
    if (!record) return false;
    
    // Determine entity type and id
    const entityType = record.facility_id ? 'facility' : 'organization';
    const entityId = record.facility_id || record.organization_id;
    
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/oldest-year/${entityType}/${entityId}`,
        { headers: getAuthHeader() }
      );
      const oldestYearFormatted = response.data?.oldest_year_formatted;
      return isYearBeforeOldest(record.base_year, oldestYearFormatted);
    } catch (error) {
      console.error('Error checking oldest year:', error);
      return false;
    }
  };

  // Synchronous version for UI rendering (uses cached entityOldestYears)
  const canEditRecordSync = (record) => {
    if (!record) return false;
    
    // Determine entity type and id to look up from cache
    const entityType = record.facility_id ? 'facility' : 'organization';
    const entityId = record.facility_id || record.organization_id;
    const key = `${entityType}_${entityId}`;
    
    // First check our cached entity oldest years (pre-fetched on page load)
    const cachedOldestYear = entityOldestYears[key];
    if (cachedOldestYear) {
      return isYearBeforeOldest(record.base_year, cachedOldestYear);
    }
    
    // Fallback: If we have oldestYearInfo loaded from an open dialog
    // and it matches this record's entity, use it
    if (oldestYearInfo?.oldest_year_formatted) {
      return isYearBeforeOldest(record.base_year, oldestYearInfo.oldest_year_formatted);
    }
    
    // Default to not editable if we don't have the info yet
    return false;
  };

  const handleEntityClick = async (entityType, entityId, entityName) => {
    setSelectedEntity({ type: entityType, id: entityId, name: entityName });
    
    // Check if base year already exists
    const existingRecord = baseYearRecords.find(r => 
      entityType === 'organization' 
        ? (r.organization_id === entityId && !r.facility_id)
        : r.facility_id === entityId
    );
    
    if (existingRecord) {
      // Show read-only view dialog (clicking card = view, not edit)
      setViewRecord(existingRecord);
      setShowViewDialog(true);
      return;
    }
    
    // Check for oldest year
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/oldest-year/${entityType}/${entityId}`,
        { headers: getAuthHeader() }
      );
      
      if (!response.data.has_emissions) {
        toast.error('No emissions data found. Please add emissions data first before setting up base year.');
        return;
      }
      
      setOldestYearInfo(response.data);
      setSetupStep('prompt');
      setShowSetupDialog(true);
      
    } catch (error) {
      console.error('Error checking oldest year:', error);
      toast.error('Failed to check emissions data');
    }
  };

  const handleOldestYearChoice = async (useOldest) => {
    setUseOldestYear(useOldest);
    
    if (useOldest) {
      // Automatically use oldest year
      const yearValue = oldestYearInfo.reporting_year_type === 'financial_year'
        ? `FY ${oldestYearInfo.oldest_year}-${oldestYearInfo.oldest_year + 1}`
        : String(oldestYearInfo.oldest_year);
      
      setSelectedYear(yearValue);
      // Fetch actual emissions data for the oldest year
      await fetchEmissionCombinations(oldestYearInfo.oldest_year);
      setSetupStep('enter_emissions');
    } else {
      // Show year selector
      setSetupStep('select_year');
    }
  };

  const handleYearSelected = async () => {
    if (!selectedYear) {
      toast.error('Please select a year');
      return;
    }
    // Extract year number for fetching data
    const yearMatch = selectedYear.match(/\d{4}/);
    const yearNum = yearMatch ? parseInt(yearMatch[0]) : null;
    
    // Check if selected year is before oldest year
    const beforeOldest = isYearBeforeOldest(selectedYear, oldestYearInfo?.oldest_year_formatted);
    setIsBeforeOldestYear(beforeOldest);
    
    await fetchEmissionCombinations(yearNum);
    
    // If base year is before oldest and facility has sinks in ANY reporting year, prompt for sink inputs
    if (beforeOldest && selectedEntity?.type === 'facility') {
      // Check if sinks exist in ANY reporting year for this facility
      const facilityId = selectedEntity.id;
      const facilitySinks = baseYearSinks.filter(sink => sink.facility_id === facilityId);
      
      if (facilitySinks.length > 0) {
        setSinksExistInOldestYear(true);
        // Group sinks by description/type and show unique ones for input
        const uniqueSinkTypes = [];
        const seenDescriptions = new Set();
        
        facilitySinks.forEach(sink => {
          const key = sink.description || sink.sink_type || 'Carbon Sink';
          if (!seenDescriptions.has(key)) {
            seenDescriptions.add(key);
            uniqueSinkTypes.push({
              description: sink.description || '',
              original_emissions_reduced: sink.total_emissions_reduced || 0,
              base_year_emissions_reduced: '', // User needs to enter this
              sink_type: sink.sink_type || 'other',
              reference_year: sink.reporting_year
            });
          }
        });
        
        setBaseYearSinkInputs(uniqueSinkTypes);
        setSetupStep('enter_emissions'); // Still go to emissions first, then sinks
      } else {
        setSinksExistInOldestYear(false);
        setSetupStep('enter_emissions');
      }
    } else {
      setSinksExistInOldestYear(false);
      setSetupStep('enter_emissions');
    }
  };

  // Handle edit button click (opens editable dialog for records where base year < oldest year)
  const handleEditEmissions = async (record) => {
    const entityType = record.facility_id ? 'facility' : 'organization';
    const entityId = record.facility_id || record.organization_id;
    const entityName = record.facility_id 
      ? facilities.find(f => f.id === record.facility_id)?.name 
      : organization?.name;
    
    setSelectedEntity({ type: entityType, id: entityId, name: entityName });
    setEmissionsData(record.emissions_data || []);
    setSelectedYear(record.base_year);
    setIsOldestYearRecord(record.is_oldest_year === true);
    setBaseYearNotes(record.notes || '');
    
    // Fetch oldest year info to determine editability
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/oldest-year/${entityType}/${entityId}`,
        { headers: getAuthHeader() }
      );
      setOldestYearInfo(response.data);
      // Check if base year < oldest year (editable)
      const beforeOldest = isYearBeforeOldest(record.base_year, response.data?.oldest_year_formatted);
      setIsBeforeOldestYear(beforeOldest);
    } catch (error) {
      console.error('Error fetching oldest year:', error);
    }
    
    setShowEmissionsDialog(true);
  };

  const fetchEmissionCombinations = async (year = null, forceAllCombinations = false) => {
    try {
      // If not using oldest year, fetch ALL combinations without year filter
      // This ensures we show all Scope + Category + Subcategory options for user to fill in
      let url = `${API}/base-year-emissions/emission-combinations/${selectedEntity.type}/${selectedEntity.id}`;
      if (year && !forceAllCombinations) {
        url += `?year=${year}`;
      }
      
      const response = await axios.get(url, { headers: getAuthHeader() });
      
      let combinations = response.data.combinations || [];
      // Use the has_values flag from the backend to determine if data exists
      let dataExistsForYear = response.data.has_values === true;
      
      // If we requested with year filter and got no results, fetch ALL combinations
      if (year && combinations.length === 0 && !forceAllCombinations) {
        // Fetch without year filter to get all possible combinations
        const allCombosUrl = `${API}/base-year-emissions/emission-combinations/${selectedEntity.type}/${selectedEntity.id}`;
        const allCombosResponse = await axios.get(allCombosUrl, { headers: getAuthHeader() });
        combinations = allCombosResponse.data.combinations || [];
        dataExistsForYear = false; // No data for this specific year
      }
      
      setEmissionCombinations(combinations);
      setHasExistingEmissionsData(dataExistsForYear);
      
      // Use the values from the API response (will have actual tCO2e if year was specified and data exists)
      setEmissionsData(combinations.map(c => ({
        scope: c.scope,
        category: c.category,
        subcategory: c.subcategory || '',
        tco2e: c.tco2e || 0  // Use actual emissions if available, otherwise 0
      })));
      
    } catch (error) {
      console.error('Error fetching combinations:', error);
      toast.error('Failed to load emission categories');
    }
  };

  const handleEmissionValueChange = (index, value) => {
    const numValue = parseFloat(value) || 0;
    // Prevent negative values
    if (numValue < 0) {
      toast.error('Emission values cannot be negative');
      return;
    }
    const updated = [...emissionsData];
    updated[index].tco2e = numValue;
    setEmissionsData(updated);
  };

  const handleSaveBaseYear = async () => {
    setSavingEmissions(true);
    
    try {
      const existingRecord = baseYearRecords.find(r => 
        selectedEntity.type === 'organization' 
          ? (r.organization_id === selectedEntity.id && !r.facility_id)
          : r.facility_id === selectedEntity.id
      );
      
      // Prepare sinks data if provided
      const sinkData = sinksExistInOldestYear && isBeforeOldestYear 
        ? baseYearSinkInputs.filter(s => s.base_year_emissions_reduced !== '').map(s => ({
            description: s.description,
            sink_type: s.sink_type,
            total_emissions_reduced: parseFloat(s.base_year_emissions_reduced) || 0
          }))
        : null;
      
      const payload = {
        organization_id: selectedEntity.type === 'organization' ? selectedEntity.id : organization.id,
        facility_id: selectedEntity.type === 'facility' ? selectedEntity.id : null,
        base_year: selectedYear,
        base_year_type: oldestYearInfo?.reporting_year_type || organization?.reporting_year_type || 'calendar_year',
        is_oldest_year: useOldestYear === true,
        emissions_data: emissionsData,
        sinks_data: sinkData,
        notes: useOldestYear === false ? baseYearNotes : null  // Include notes only for non-oldest year
      };
      
      if (existingRecord) {
        // Update existing record
        await axios.put(`${API}/base-year-emissions/${existingRecord.id}`, {
          emissions_data: emissionsData,
          sinks_data: sinkData,
          base_year: selectedYear,
          notes: !isOldestYearRecord ? baseYearNotes : null
        }, {
          headers: getAuthHeader()
        });
        toast.success('Base year emissions updated successfully');
      } else {
        // Create new record
        await axios.post(`${API}/base-year-emissions`, payload, {
          headers: getAuthHeader()
        });
        toast.success('Base year emissions saved successfully');
      }
      
      // Refresh data
      await fetchData();
      
      // Close dialogs
      setShowSetupDialog(false);
      setShowEmissionsDialog(false);
      resetState();
      
    } catch (error) {
      console.error('Error saving base year:', error);
      toast.error(error.response?.data?.detail || 'Failed to save base year emissions');
    } finally {
      setSavingEmissions(false);
    }
  };

  const handleViewHistory = async (record) => {
    setHistoryRecord(record);
    
    // Fetch deletion history for this entity
    const entityType = record.facility_id ? 'facility' : 'organization';
    const entityId = record.facility_id || record.organization_id;
    
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/deletion-history/${entityType}/${entityId}`,
        { headers: getAuthHeader() }
      );
      setDeletionHistory(response.data || []);
    } catch (error) {
      console.error('Error fetching deletion history:', error);
      setDeletionHistory([]);
    }
    
    setShowHistoryDialog(true);
  };

  // View history for an entity that may not have a current record (shows deletion history)
  const handleViewEntityHistory = async (entityType, entityId, entityName) => {
    // Create a minimal record object for display
    const pseudoRecord = {
      organization_id: entityType === 'organization' ? entityId : organization?.id,
      facility_id: entityType === 'facility' ? entityId : null,
      base_year: 'N/A',
      version: 0,
      version_history: [],
      entity_name: entityName
    };
    
    setHistoryRecord(pseudoRecord);
    
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/deletion-history/${entityType}/${entityId}`,
        { headers: getAuthHeader() }
      );
      setDeletionHistory(response.data || []);
    } catch (error) {
      console.error('Error fetching deletion history:', error);
      setDeletionHistory([]);
    }
    
    setShowHistoryDialog(true);
  };

  const handleDeleteRecord = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this base year record? The deletion will be recorded in history.')) {
      return;
    }
    
    try {
      await axios.delete(`${API}/base-year-emissions/${recordId}`, {
        headers: getAuthHeader()
      });
      toast.success('Base year record deleted (recorded in history)');
      fetchData();
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete record');
    }
  };

  const handleChangeYear = async (record) => {
    setChangeYearRecord(record);
    setNewBaseYear(record.base_year);
    
    // Fetch oldest year info for this entity to exclude it from options
    const entityType = record.facility_id ? 'facility' : 'organization';
    const entityId = record.facility_id || record.organization_id;
    
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/oldest-year/${entityType}/${entityId}`,
        { headers: getAuthHeader() }
      );
      setOldestYearInfo(response.data);
    } catch (error) {
      console.error('Error fetching oldest year:', error);
    }
    
    setShowChangeYearDialog(true);
  };

  const handleSaveNewYear = async () => {
    if (!newBaseYear) {
      toast.error('Please select a new base year');
      return;
    }
    
    if (newBaseYear === changeYearRecord.base_year) {
      toast.info('Base year is the same - no changes made');
      setShowChangeYearDialog(false);
      return;
    }
    
    setChangingYear(true);
    
    try {
      await axios.patch(
        `${API}/base-year-emissions/${changeYearRecord.id}/change-year?new_base_year=${encodeURIComponent(newBaseYear)}`,
        {},
        { headers: getAuthHeader() }
      );
      
      toast.success(`Base year changed from ${changeYearRecord.base_year} to ${newBaseYear}`);
      setShowChangeYearDialog(false);
      setChangeYearRecord(null);
      setNewBaseYear('');
      fetchData();
    } catch (error) {
      console.error('Error changing base year:', error);
      toast.error(error.response?.data?.detail || 'Failed to change base year');
    } finally {
      setChangingYear(false);
    }
  };

  const resetState = () => {
    setSelectedEntity(null);
    setOldestYearInfo(null);
    setSetupStep('prompt');
    setSelectedYear('');
    setUseOldestYear(null);
    setEmissionCombinations([]);
    setEmissionsData([]);
    setIsOldestYearRecord(false);
    setViewRecord(null);
    setBaseYearNotes('');
    setHasExistingEmissionsData(false);
    setIsBeforeOldestYear(false);
  };

  const getEntityRecord = (entityType, entityId) => {
    return baseYearRecords.find(r => 
      entityType === 'organization' 
        ? (r.organization_id === entityId && !r.facility_id)
        : r.facility_id === entityId
    );
  };

  // Get sinks for a specific base year and facility
  const getSinksForBaseYear = (baseYear, facilityId) => {
    if (!baseYear || !baseYearSinks.length) return [];
    
    // Parse the base year to extract the year
    // Format can be "2024" or "2023-2024" (financial year)
    let targetYear = baseYear;
    if (baseYear.includes('-')) {
      // For financial year "2023-2024", match with reporting_year "2024" (ending year)
      targetYear = baseYear.split('-')[1];
    }
    
    return baseYearSinks.filter(sink => {
      // Match facility
      if (facilityId && sink.facility_id !== facilityId) return false;
      
      // Match year
      return sink.reporting_year === targetYear;
    });
  };

  const generateYearOptions = (excludeOldestYear = false) => {
    const currentYear = new Date().getFullYear();
    const years = [];
    const isFinancialYear = organization?.reporting_year_type === 'financial_year';
    
    // Get the oldest year to potentially exclude
    const oldestYearValue = oldestYearInfo?.oldest_year_formatted;
    
    for (let y = currentYear; y >= currentYear - 20; y--) {
      let yearValue, yearLabel;
      
      if (isFinancialYear) {
        yearValue = `FY ${y}-${y + 1}`;
        yearLabel = `FY ${y}-${y + 1}`;
      } else {
        yearValue = String(y);
        yearLabel = String(y);
      }
      
      // Skip the oldest year if excludeOldestYear is true
      if (excludeOldestYear && oldestYearValue && yearValue === oldestYearValue) {
        continue;
      }
      
      years.push({ value: yearValue, label: yearLabel });
    }
    return years;
  };

  // Filter facilities for users (only assigned ones)
  const visibleFacilities = user?.role === 'user' 
    ? facilities.filter(f => (user.assigned_facilities || []).includes(f.id))
    : facilities;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-text-primary">Base Year Emissions</h1>
        <p className="text-text-muted mt-1">
          Set up base year emissions for comparing and tracking GHG reduction progress
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">What is Base Year Emissions?</p>
          <p className="mt-1">
            Base year emissions serve as a reference point for tracking your organization's GHG reduction progress over time. 
            Select your earliest reporting year or a custom year to establish your baseline.
          </p>
        </div>
      </div>

      {/* Organization Card - Only for Admins */}
      {user?.role === 'admin' && organization && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Building className="w-5 h-5" />
            Organization
          </h2>
          <Card 
            className={`cursor-pointer hover:shadow-md transition-shadow ${
              getEntityRecord('organization', organization.id) ? 'border-green-300 bg-green-50/50' : ''
            }`}
            onClick={() => handleEntityClick('organization', organization.id, organization.name)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{organization.name}</CardTitle>
                {getEntityRecord('organization', organization.id) && (
                  <span className="flex items-center gap-1 text-sm text-green-600 bg-green-100 px-2 py-1 rounded-full">
                    <Check className="w-4 h-4" />
                    Base Year Set
                  </span>
                )}
              </div>
              <CardDescription>Organization-level base year emissions</CardDescription>
            </CardHeader>
            <CardContent>
              {getEntityRecord('organization', organization.id) ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-muted">Base Year</p>
                    <p className="font-semibold">{getEntityRecord('organization', organization.id).base_year}</p>
                    {getEntityRecord('organization', organization.id).is_oldest_year && (
                      <p className="text-xs text-amber-600 mt-1">Oldest year (read-only)</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewHistory(getEntityRecord('organization', organization.id));
                      }}
                    >
                      <History className="w-4 h-4 mr-1" />
                      History
                    </Button>
                    {canEditRecordSync(getEntityRecord('organization', organization.id)) && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditEmissions(getEntityRecord('organization', organization.id));
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChangeYear(getEntityRecord('organization', organization.id));
                      }}
                    >
                      <CalendarClock className="w-4 h-4 mr-1" />
                      Change Year
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-muted flex items-center gap-1">
                  <Plus className="w-4 h-4" />
                  Click to set up base year emissions
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Facilities Cards */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Facilities
        </h2>
        
        {visibleFacilities.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-text-muted">
              {user?.role === 'user' 
                ? 'No facilities assigned to you yet.'
                : 'No facilities found. Add facilities first.'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleFacilities.map(facility => {
              const record = getEntityRecord('facility', facility.id);
              return (
                <Card 
                  key={facility.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${
                    record ? 'border-green-300 bg-green-50/50' : ''
                  }`}
                  onClick={() => handleEntityClick('facility', facility.id, facility.name)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{facility.name}</CardTitle>
                      {record && (
                        <Check className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                    <CardDescription className="text-xs">{facility.city}, {facility.state}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {record ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-text-muted">Base Year</p>
                          <p className="font-semibold text-sm">{record.base_year}</p>
                          {record.is_oldest_year && (
                            <p className="text-xs text-amber-600">Oldest year</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewHistory(record);
                            }}
                            title="View History"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          {canEditRecordSync(record) && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditEmissions(record);
                              }}
                              title="Edit Emissions"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChangeYear(record);
                            }}
                            title="Change Base Year"
                          >
                            <CalendarClock className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted flex items-center gap-1">
                        <Plus className="w-3 h-3" />
                        Click to set up
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Setup Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={(open) => { if (!open) { setShowSetupDialog(false); resetState(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Set Up Base Year - {selectedEntity?.name}
            </DialogTitle>
            <DialogDescription>
              {setupStep === 'prompt' && 'Choose how to set your base year'}
              {setupStep === 'select_year' && 'Select your base year'}
              {setupStep === 'enter_emissions' && 'Enter base year emissions data'}
            </DialogDescription>
          </DialogHeader>

          {/* Step: Prompt */}
          {setupStep === 'prompt' && oldestYearInfo && (
            <div className="space-y-4">
              <div className="p-4 bg-stone-50 rounded-lg">
                <p className="text-sm text-text-primary">
                  Your oldest reporting year is <strong>{oldestYearInfo.oldest_year_formatted}</strong>.
                </p>
                <p className="text-sm text-text-muted mt-1">
                  Do you want to set it as your base year for this {selectedEntity?.type}?
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  className="flex-1" 
                  onClick={() => handleOldestYearChoice(true)}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Yes, use {oldestYearInfo.oldest_year_formatted}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => handleOldestYearChoice(false)}
                >
                  <X className="w-4 h-4 mr-2" />
                  No, select different year
                </Button>
              </div>
            </div>
          )}

          {/* Step: Select Year */}
          {setupStep === 'select_year' && (
            <div className="space-y-4">
              <div>
                <Label>Select Base Year *</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {generateYearOptions(false).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setSetupStep('prompt')}>
                  Back
                </Button>
                <Button className="flex-1" onClick={handleYearSelected} disabled={!selectedYear}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step: Enter Emissions */}
          {setupStep === 'enter_emissions' && (
            <div className="space-y-4">
              <div className="p-3 bg-primary/10 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Base Year: {selectedYear}</span>
                </div>
                {(useOldestYear || hasExistingEmissionsData) && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">Read-only</span>
                )}
              </div>
              
              {emissionsData.length === 0 ? (
                <div className="py-4 text-center text-text-muted">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                  <p>No emission categories found.</p>
                  <p className="text-xs mt-1">Please add emissions data first before setting up base year.</p>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scope</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Subcategory</TableHead>
                        <TableHead className="text-right">tCO₂e</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emissionsData.map((entry, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{entry.scope}</TableCell>
                          <TableCell className="text-xs">{entry.category}</TableCell>
                          <TableCell className="text-xs">{entry.subcategory || '-'}</TableCell>
                          <TableCell className="text-right">
                            {(useOldestYear || hasExistingEmissionsData) ? (
                              <span className="font-medium">{(parseFloat(entry.tco2e) || 0).toFixed(4)}</span>
                            ) : (
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                className="w-28 text-right h-8"
                                value={entry.tco2e}
                                onChange={(e) => handleEmissionValueChange(idx, e.target.value)}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              {/* Sinks Input Section - Only show when base year < oldest reporting year and sinks exist */}
              {sinksExistInOldestYear && isBeforeOldestYear && baseYearSinkInputs.length > 0 && (
                <div className="space-y-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Leaf className="w-5 h-5 text-green-600" />
                    <h4 className="font-medium text-green-800">Base Year Carbon Sinks</h4>
                  </div>
                  <p className="text-sm text-green-700">
                    Sinks exist for this facility. Please enter the corresponding sink values for your selected base year.
                  </p>
                  <div className="space-y-3">
                    {baseYearSinkInputs.map((sink, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-white rounded border border-green-200">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{sink.description || `Sink ${idx + 1}`}</p>
                          <p className="text-xs text-gray-500">
                            Reference value (FY {sink.reference_year}): -{parseFloat(sink.original_emissions_reduced).toFixed(4)} tCO₂e
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">-</span>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="w-32 text-right h-9"
                            placeholder="0.0000"
                            value={sink.base_year_emissions_reduced}
                            onChange={(e) => {
                              const newSinks = [...baseYearSinkInputs];
                              newSinks[idx] = { ...newSinks[idx], base_year_emissions_reduced: e.target.value };
                              setBaseYearSinkInputs(newSinks);
                            }}
                          />
                          <span className="text-sm text-gray-600">tCO₂e</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Notes field - only for non-oldest year and when data is editable */}
              {!useOldestYear && !hasExistingEmissionsData && emissionsData.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Notes / Justification
                  </Label>
                  <Textarea
                    placeholder="Notes / Justification"
                    value={baseYearNotes}
                    onChange={(e) => setBaseYearNotes(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-text-muted">
                    Optionally provide notes or justification for using a different year than the oldest reporting year.
                  </p>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setSetupStep('select_year')}>
                  Back
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSaveBaseYear}
                  disabled={savingEmissions || emissionsData.length === 0}
                >
                  {savingEmissions ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Base Year Emissions'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Emissions Edit Dialog (for existing records) */}
      <Dialog open={showEmissionsDialog} onOpenChange={(open) => { if (!open) { setShowEmissionsDialog(false); resetState(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isBeforeOldestYear ? <Edit2 className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              {isBeforeOldestYear ? 'Edit' : 'View'} Base Year Emissions - {selectedEntity?.name}
            </DialogTitle>
            <DialogDescription>
              {isBeforeOldestYear 
                ? 'Edit base year emissions data. Changes will be tracked in version history.'
                : 'View base year emissions data. To update values, change the base year.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-primary/10 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Base Year: {selectedYear}</span>
              </div>
              {!isBeforeOldestYear && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">Read-only</span>
              )}
              {isBeforeOldestYear && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Editable</span>
              )}
            </div>
            
            {emissionsData.length === 0 ? (
              <div className="py-4 text-center text-text-muted">
                No emission data found
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Subcategory</TableHead>
                      <TableHead className="text-right">tCO₂e</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emissionsData.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{entry.scope}</TableCell>
                        <TableCell className="text-xs">{entry.category}</TableCell>
                        <TableCell className="text-xs">{entry.subcategory || '-'}</TableCell>
                        <TableCell className="text-right">
                          {isBeforeOldestYear ? (
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              className="w-28 text-right h-8"
                              value={entry.tco2e}
                              onChange={(e) => handleEmissionValueChange(idx, e.target.value)}
                            />
                          ) : (
                            <span className="font-medium">{(parseFloat(entry.tco2e) || 0).toFixed(4)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {/* Notes field - editable when isBeforeOldestYear, otherwise display only */}
            {isBeforeOldestYear ? (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes / Justification
                </Label>
                <Textarea
                  placeholder="Notes / Justification"
                  value={baseYearNotes}
                  onChange={(e) => setBaseYearNotes(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
            ) : baseYearNotes && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Notes / Justification</span>
                </div>
                <p className="text-sm text-blue-700">{baseYearNotes}</p>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowEmissionsDialog(false); resetState(); }}>
                {isBeforeOldestYear ? 'Cancel' : 'Close'}
              </Button>
              {isBeforeOldestYear && (
                <Button 
                  onClick={handleSaveBaseYear}
                  disabled={savingEmissions}
                >
                  {savingEmissions ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Read-Only View Dialog (when clicking card with existing record) */}
      <Dialog open={showViewDialog} onOpenChange={(open) => { if (!open) { setShowViewDialog(false); setViewRecord(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Base Year Emissions - {viewRecord?.facility_id 
                ? facilities.find(f => f.id === viewRecord?.facility_id)?.name 
                : organization?.name}
            </DialogTitle>
            <DialogDescription>
              {canEditRecordSync(viewRecord) 
                ? 'View base year emissions data. Click Edit to modify values.'
                : 'View base year emissions data. To update values, change the base year.'}
            </DialogDescription>
          </DialogHeader>

          {viewRecord && (
            <div className="space-y-4">
              <div className="p-3 bg-primary/10 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Base Year: {viewRecord.base_year}</span>
                </div>
                {canEditRecordSync(viewRecord) ? (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                    Editable
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    Read-only
                  </span>
                )}
              </div>
              
              {viewRecord.emissions_data?.length === 0 ? (
                <div className="py-4 text-center text-text-muted">
                  No emission data found
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scope</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Subcategory</TableHead>
                        <TableHead className="text-right">tCO₂e</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewRecord.emissions_data?.map((entry, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{entry.scope}</TableCell>
                          <TableCell className="text-xs">{entry.category}</TableCell>
                          <TableCell className="text-xs">{entry.subcategory || '-'}</TableCell>
                          <TableCell className="text-right font-medium">
                            {entry.tco2e?.toFixed(4)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              {/* Total row */}
              {viewRecord.emissions_data?.length > 0 && (
                <div className="p-3 bg-stone-50 rounded-lg flex justify-between items-center">
                  <span className="font-medium text-sm">Total Emissions</span>
                  <span className="font-bold">
                    {viewRecord.emissions_data.reduce((sum, e) => sum + (parseFloat(e.tco2e) || 0), 0).toFixed(4)} tCO₂e
                  </span>
                </div>
              )}
              
              {/* Notes section */}
              {viewRecord.notes && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Notes / Justification</span>
                  </div>
                  <p className="text-sm text-blue-700">{viewRecord.notes}</p>
                </div>
              )}
              
              {/* Sinks section - show total sinks value in a single row */}
              {(() => {
                const sinks = getSinksForBaseYear(viewRecord.base_year, viewRecord.facility_id);
                if (sinks.length === 0) return null;
                
                const totalSinkReductions = sinks.reduce((sum, s) => sum + (parseFloat(s.total_emissions_reduced) || 0), 0);
                
                return (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Leaf className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-sm text-green-800">Total Carbon Sinks</span>
                      <span className="text-xs text-green-600">({sinks.length} sink{sinks.length > 1 ? 's' : ''})</span>
                    </div>
                    <span className="font-bold text-green-800">-{totalSinkReductions.toFixed(4)} tCO₂e</span>
                  </div>
                );
              })()}
              
              <div className="flex justify-between gap-3">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setShowViewDialog(false);
                      handleViewHistory(viewRecord);
                    }}
                  >
                    <History className="w-4 h-4 mr-1" />
                    History
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setShowViewDialog(false); setViewRecord(null); }}>
                    Close
                  </Button>
                  {canEditRecordSync(viewRecord) && (
                    <Button 
                      onClick={() => {
                        setShowViewDialog(false);
                        handleEditEmissions(viewRecord);
                      }}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Edit Emissions
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Version History {historyRecord?.entity_name ? `- ${historyRecord.entity_name}` : ''}
            </DialogTitle>
            <DialogDescription>
              View all changes and deletions for this entity
            </DialogDescription>
          </DialogHeader>

          {historyRecord && (
            <div className="space-y-4">
              {/* Only show current record info if there's an actual record */}
              {historyRecord.version > 0 && (
                <div className="p-3 bg-stone-50 rounded-lg">
                  <p className="text-sm">
                    <span className="font-medium">Current Version:</span> {historyRecord.version}
                  </p>
                  <p className="text-sm text-text-muted">
                    <span className="font-medium">Base Year:</span> {historyRecord.base_year}
                  </p>
                </div>
              )}

              {/* Deletion History Section */}
              {deletionHistory.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-red-600 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Deleted Records ({deletionHistory.length})
                  </h4>
                  {deletionHistory.map((deletion, idx) => (
                    <div key={idx} className="p-4 border border-red-200 rounded-lg bg-red-50/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-red-600">DELETED</span>
                          {deletion.deleted_by_name && (
                            <span className="text-xs text-text-muted">by {deletion.deleted_by_name}</span>
                          )}
                        </div>
                        <span className="text-xs text-text-muted">
                          {new Date(deletion.deleted_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs space-y-1">
                        <p><span className="font-medium">Base Year:</span> {deletion.base_year}</p>
                        <p><span className="font-medium">Version at deletion:</span> {deletion.version_at_deletion}</p>
                        <p><span className="font-medium">Total tCO₂e:</span> {(deletion.emissions_data?.reduce((sum, e) => sum + (parseFloat(e.tco2e) || 0), 0) || 0).toFixed(4)}</p>
                        <p><span className="font-medium">Entries:</span> {deletion.emissions_data?.length || 0}</p>
                      </div>
                      
                      {/* Show version history from deleted record if available */}
                      {deletion.version_history && deletion.version_history.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-text-muted cursor-pointer hover:text-text-primary">
                            View {deletion.version_history.length} version(s) before deletion
                          </summary>
                          <div className="mt-2 pl-2 border-l-2 border-red-200 space-y-2">
                            {deletion.version_history.map((v, vIdx) => (
                              <div key={vIdx} className="text-xs bg-white p-2 rounded">
                                <div className="flex justify-between">
                                  <span className="font-medium">Version {v.version}</span>
                                  <span className="text-text-muted">{new Date(v.changed_at).toLocaleString()}</span>
                                </div>
                                {v.changes && v.changes.length > 0 && (
                                  <div className="mt-1 space-y-1">
                                    {v.changes.map((c, cIdx) => (
                                      <div key={cIdx} className="flex gap-2">
                                        <span>{c.scope}/{c.category}</span>
                                        <span className="text-red-500">{(parseFloat(c.previous_value) || 0).toFixed(2)}</span>
                                        <span>→</span>
                                        <span className="text-green-600">{(parseFloat(c.new_value) || 0).toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Version History Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Version Changes
                </h4>
                
                {historyRecord.version_history && historyRecord.version_history.length > 0 ? (
                  <div className="space-y-4">
                    {historyRecord.version_history.slice().reverse().map((version, idx) => (
                      <div key={idx} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="font-medium text-sm">Version {version.version}</span>
                            {version.changed_by_name && (
                              <span className="text-xs text-text-muted ml-2">by {version.changed_by_name}</span>
                            )}
                          </div>
                          <span className="text-xs text-text-muted">
                            {new Date(version.changed_at).toLocaleString()}
                          </span>
                        </div>
                        
                        {/* Show detailed changes if available */}
                        {version.changes && version.changes.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-text-muted">Changes:</p>
                            <div className="bg-stone-50 rounded p-2 space-y-1">
                              {version.changes.map((change, cIdx) => (
                                <div key={cIdx} className="text-xs flex items-center gap-2">
                                  <span className="font-medium min-w-[200px]">
                                    {change.scope} / {change.category}
                                    {change.subcategory && ` / ${change.subcategory}`}
                                  </span>
                                  <span className="text-red-500 line-through">
                                    {(parseFloat(change.previous_value) || 0).toFixed(4)} tCO₂e
                                  </span>
                                  <span className="text-text-muted">→</span>
                                  <span className="text-green-600 font-medium">
                                    {(parseFloat(change.new_value) || 0).toFixed(4)} tCO₂e
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-text-muted">
                            <p>Total entries: {version.emissions_data?.length || 0}</p>
                            <p>Total tCO₂e: {(version.emissions_data?.reduce((sum, e) => sum + (parseFloat(e.tco2e) || 0), 0) || 0).toFixed(2)}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-text-muted">
                    {deletionHistory.length === 0 ? 'No history found' : 'No active version changes (see deleted records above)'}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Base Year Dialog */}
      <Dialog open={showChangeYearDialog} onOpenChange={(open) => { if (!open) { setShowChangeYearDialog(false); setChangeYearRecord(null); setNewBaseYear(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Change Base Year
            </DialogTitle>
            <DialogDescription>
              Update the base year without losing existing emissions data. The change will be recorded in version history.
            </DialogDescription>
          </DialogHeader>

          {changeYearRecord && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-50 rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Current Base Year:</span> {changeYearRecord.base_year}
                </p>
                <p className="text-sm text-text-muted">
                  <span className="font-medium">Entity:</span> {changeYearRecord.facility_id ? 'Facility' : 'Organization'}
                </p>
              </div>
              
              <div>
                <Label>New Base Year *</Label>
                <Select value={newBaseYear} onValueChange={setNewBaseYear}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select new year" />
                  </SelectTrigger>
                  <SelectContent>
                    {generateYearOptions(false).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Emissions data will be updated based on the selected year's records.
                </p>
              </div>
              
              <div className="flex gap-3 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => { setShowChangeYearDialog(false); setChangeYearRecord(null); setNewBaseYear(''); }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveNewYear}
                  disabled={changingYear || !newBaseYear || newBaseYear === changeYearRecord.base_year}
                >
                  {changingYear ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Change Base Year'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
