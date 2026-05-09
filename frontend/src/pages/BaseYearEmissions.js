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
import { Building, Building2, CalendarClock, Check, X, Loader2, History, Plus, AlertTriangle, Info, Eye, FileText, Trash2, Edit2, Leaf, AlertCircle } from 'lucide-react';

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
  
  // Justification states (Phase 1 Base Year Enhancement)
  const [baseYearJustification, setBaseYearJustification] = useState(''); // Mandatory justification for base year selection
  const [changeReason, setChangeReason] = useState(''); // Mandatory reason for changing base year
  const [showChangeConfirmDialog, setShowChangeConfirmDialog] = useState(false); // Confirmation dialog for base year change
  
  // Phase 2: Scope Group separation (Scope 1&2 vs Scope 3)
  const [selectedScopeGroup, setSelectedScopeGroup] = useState('scope12'); // 'scope12' or 'scope3'

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

  // Phase 2: Handle click on entity with specific scope group
  const handleEntityClick = async (entityType, entityId, entityName, scopeGroup = 'scope12') => {
    setSelectedEntity({ type: entityType, id: entityId, name: entityName });
    setSelectedScopeGroup(scopeGroup);
    
    // Check if base year already exists for this scope group
    const existingRecord = getEntityRecord(entityType, entityId, scopeGroup);
    
    if (existingRecord) {
      // Show read-only view dialog (clicking card = view, not edit)
      setViewRecord(existingRecord);
      setShowViewDialog(true);
      return;
    }
    
    // Check for oldest year and emissions data
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/oldest-year/${entityType}/${entityId}?scope_group=${scopeGroup}`,
        { headers: getAuthHeader() }
      );
      
      if (!response.data.has_emissions) {
        const scopeLabel = getScopeGroupLabel(scopeGroup);
        toast.error(`No ${scopeLabel} emissions data found. Please add emissions data first before setting up base year.`);
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
    
    // If base year is before oldest and facility has sinks, prompt for sink inputs
    if (beforeOldest && selectedEntity?.type === 'facility') {
      // Check if sinks exist for this facility
      const facilityId = selectedEntity.id;
      const facilitySinks = baseYearSinks.filter(sink => sink.facility_id === facilityId);
      
      if (facilitySinks.length > 0) {
        setSinksExistInOldestYear(true);
        
        // Helper to parse sink date
        const parseSinkDate = (sink) => {
          if (sink.reporting_period) {
            const match = sink.reporting_period.match(/(\d{4})-(\d{1,2})/);
            if (match) return `${match[1]}`;
          }
          if (sink.start_date) {
            const match = sink.start_date.match(/(\d{4})/);
            if (match) return match[1];
          }
          return sink.reporting_year || 'Unknown';
        };
        
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
              reference_year: parseSinkDate(sink)
            });
          }
        });
        
        setBaseYearSinkInputs(uniqueSinkTypes);
        setSetupStep('enter_emissions');
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
    setBaseYearJustification(record.justification || ''); // Load existing justification
    setSelectedScopeGroup(record.scope_group || 'scope12'); // Phase 2: Load scope group from record
    
    // Fetch oldest year info to determine editability
    const recordScopeGroup = record.scope_group || 'scope12';
    try {
      const response = await axios.get(
        `${API}/base-year-emissions/oldest-year/${entityType}/${entityId}?scope_group=${recordScopeGroup}`,
        { headers: getAuthHeader() }
      );
      setOldestYearInfo(response.data);
      // Check if base year < oldest year (editable)
      const beforeOldest = isYearBeforeOldest(record.base_year, response.data?.oldest_year_formatted);
      setIsBeforeOldestYear(beforeOldest);
      
      // Check for sinks if editing a facility and base year < oldest
      if (beforeOldest && entityType === 'facility') {
        const facilitySinks = baseYearSinks.filter(sink => sink.facility_id === entityId);
        if (facilitySinks.length > 0) {
          setSinksExistInOldestYear(true);
          
          // Helper to parse sink date
          const parseSinkDate = (sink) => {
            if (sink.reporting_period) {
              const match = sink.reporting_period.match(/(\d{4})-(\d{1,2})/);
              if (match) return `${match[1]}`;
            }
            if (sink.start_date) {
              const match = sink.start_date.match(/(\d{4})/);
              if (match) return match[1];
            }
            return sink.reporting_year || 'Unknown';
          };
          
          // Load existing sinks data or create inputs
          const existingSinks = record.sinks_data || [];
          if (existingSinks.length > 0) {
            setBaseYearSinkInputs(existingSinks.map(s => ({
              description: s.description || '',
              original_emissions_reduced: s.total_emissions_reduced || 0,
              base_year_emissions_reduced: s.total_emissions_reduced?.toString() || '',
              sink_type: s.sink_type || 'other',
              reference_year: 'Base Year'
            })));
          } else {
            // Create inputs based on facility sinks
            const uniqueSinkTypes = [];
            const seenDescriptions = new Set();
            
            facilitySinks.forEach(sink => {
              const key = sink.description || sink.sink_type || 'Carbon Sink';
              if (!seenDescriptions.has(key)) {
                seenDescriptions.add(key);
                uniqueSinkTypes.push({
                  description: sink.description || '',
                  original_emissions_reduced: sink.total_emissions_reduced || 0,
                  base_year_emissions_reduced: '',
                  sink_type: sink.sink_type || 'other',
                  reference_year: parseSinkDate(sink)
                });
              }
            });
            setBaseYearSinkInputs(uniqueSinkTypes);
          }
        } else {
          setSinksExistInOldestYear(false);
          setBaseYearSinkInputs([]);
        }
      } else {
        setSinksExistInOldestYear(false);
        setBaseYearSinkInputs([]);
      }
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
      
      // Build query params
      const params = new URLSearchParams();
      if (year && !forceAllCombinations) {
        params.append('year', year);
      }
      // Phase 2: Always filter by selected scope group
      if (selectedScopeGroup) {
        params.append('scope_group', selectedScopeGroup);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await axios.get(url, { headers: getAuthHeader() });
      
      let combinations = response.data.combinations || [];
      // Use the has_values flag from the backend to determine if data exists
      let dataExistsForYear = response.data.has_values === true;
      
      // If we requested with year filter and got no results, fetch ALL combinations
      if (year && combinations.length === 0 && !forceAllCombinations) {
        // Fetch without year filter to get all possible combinations
        const fallbackParams = new URLSearchParams();
        if (selectedScopeGroup) {
          fallbackParams.append('scope_group', selectedScopeGroup);
        }
        const allCombosUrl = `${API}/base-year-emissions/emission-combinations/${selectedEntity.type}/${selectedEntity.id}${fallbackParams.toString() ? '?' + fallbackParams.toString() : ''}`;
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
    // Validate justification for new records (not editing existing ones)
    // Phase 2: Check for existing record with the same scope group
    const existingRecord = getEntityRecord(selectedEntity.type, selectedEntity.id, selectedScopeGroup);
    
    // For new records, justification is mandatory
    if (!existingRecord && (!baseYearJustification || baseYearJustification.trim().length < 10)) {
      toast.error('Please provide a justification for selecting this base year (minimum 10 characters)');
      return;
    }
    
    setSavingEmissions(true);
    
    try {
      // Prepare sinks data if provided (only for Scope 1&2)
      const sinkData = (selectedScopeGroup === 'scope12' && sinksExistInOldestYear && isBeforeOldestYear) 
        ? baseYearSinkInputs.filter(s => s.base_year_emissions_reduced !== '').map(s => ({
            description: s.description,
            sink_type: s.sink_type,
            total_emissions_reduced: parseFloat(s.base_year_emissions_reduced) || 0
          }))
        : null;
      
      const payload = {
        organization_id: selectedEntity.type === 'organization' ? selectedEntity.id : organization.id,
        facility_id: selectedEntity.type === 'facility' ? selectedEntity.id : null,
        scope_group: selectedScopeGroup, // Phase 2: Use selected scope group
        base_year: selectedYear,
        base_year_type: oldestYearInfo?.reporting_year_type || organization?.reporting_year_type || 'calendar_year',
        is_oldest_year: useOldestYear === true,
        emissions_data: emissionsData,
        sinks_data: sinkData,
        justification: baseYearJustification.trim(), // Mandatory justification
        notes: useOldestYear === false ? baseYearNotes : null  // Include notes only for non-oldest year
      };
      
      if (existingRecord) {
        // Update existing record
        await axios.put(`${API}/base-year-emissions/${existingRecord.id}`, {
          emissions_data: emissionsData,
          sinks_data: sinkData,
          base_year: selectedYear,
          justification: baseYearJustification.trim() || existingRecord.justification, // Keep existing if not changed
          notes: !isOldestYearRecord ? baseYearNotes : null
        }, {
          headers: getAuthHeader()
        });
        toast.success(`${getScopeGroupLabel(selectedScopeGroup)} base year emissions updated successfully`);
      } else {
        // Create new record
        await axios.post(`${API}/base-year-emissions`, payload, {
          headers: getAuthHeader()
        });
        toast.success(`${getScopeGroupLabel(selectedScopeGroup)} base year emissions saved successfully`);
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
    
    // Validate change reason
    if (!changeReason || changeReason.trim().length < 20) {
      toast.error('Please provide a reason for changing the base year (minimum 20 characters)');
      return;
    }
    
    setChangingYear(true);
    
    try {
      await axios.patch(
        `${API}/base-year-emissions/${changeYearRecord.id}/change-year?new_base_year=${encodeURIComponent(newBaseYear)}&change_reason=${encodeURIComponent(changeReason.trim())}`,
        {},
        { headers: getAuthHeader() }
      );
      
      toast.success(`Base year changed from ${changeYearRecord.base_year} to ${newBaseYear}`);
      setShowChangeYearDialog(false);
      setChangeYearRecord(null);
      setNewBaseYear('');
      setChangeReason('');
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
    setBaseYearJustification(''); // Reset justification
    setChangeReason(''); // Reset change reason
    setSelectedScopeGroup('scope12'); // Reset to default scope group
  };

  // Get entity record for a specific scope group (Phase 2: Scope separation)
  const getEntityRecord = (entityType, entityId, scopeGroup = null) => {
    return baseYearRecords.find(r => {
      const entityMatch = entityType === 'organization' 
        ? (r.organization_id === entityId && !r.facility_id)
        : r.facility_id === entityId;
      
      // If scopeGroup specified, filter by it; otherwise return first match (legacy)
      if (scopeGroup) {
        return entityMatch && (r.scope_group || 'scope12') === scopeGroup;
      }
      return entityMatch;
    });
  };
  
  // Check if entity has a record for a specific scope group
  const hasRecordForScopeGroup = (entityType, entityId, scopeGroup) => {
    return !!getEntityRecord(entityType, entityId, scopeGroup);
  };
  
  // Get scope group display label
  const getScopeGroupLabel = (scopeGroup) => {
    return scopeGroup === 'scope3' ? 'Scope 3' : 'Scope 1 & 2';
  };
  
  // Get scope group short label for badges
  const getScopeGroupBadge = (scopeGroup) => {
    return scopeGroup === 'scope3' ? 'S3' : 'S1&2';
  };

  // Get sinks for a specific base year and facility
  const getSinksForBaseYear = (baseYear, facilityId) => {
    if (!baseYear || !baseYearSinks.length) return [];
    
    const isFinancialYear = organization?.reporting_year_type === 'financial_year';
    
    // Parse the base year to extract the target year
    let targetYear;
    if (baseYear.includes('-')) {
      // For financial year "FY 2023-2024", use the starting year (2023) for FY logic
      // FY 2023-2024 = April 2023 to March 2024
      const match = baseYear.match(/(\d{4})-(\d{4})/);
      targetYear = match ? parseInt(match[1]) : parseInt(baseYear.match(/\d{4}/)?.[0] || '0');
    } else {
      targetYear = parseInt(baseYear);
    }
    
    // Helper to parse sink date and get month/year
    const parseSinkDate = (sink) => {
      // Try reporting_period first (format: "2025-01")
      if (sink.reporting_period) {
        const match = sink.reporting_period.match(/(\d{4})-(\d{1,2})/);
        if (match) {
          return { year: parseInt(match[1]), month: parseInt(match[2]) - 1 }; // 0-indexed month
        }
      }
      // Try start_date (format: "2025-01-01")
      if (sink.start_date) {
        const match = sink.start_date.match(/(\d{4})-(\d{2})/);
        if (match) {
          return { year: parseInt(match[1]), month: parseInt(match[2]) - 1 };
        }
      }
      // Fallback to reporting_year/reporting_month if available
      if (sink.reporting_year) {
        return { year: parseInt(sink.reporting_year), month: sink.reporting_month ?? 0 };
      }
      return null;
    };
    
    // Helper to check if a sink is within the year range (same logic as emissions)
    const isInYearRange = (sink) => {
      const dateInfo = parseSinkDate(sink);
      if (!dateInfo) return false;
      
      const { year, month } = dateInfo;
      
      if (isFinancialYear) {
        // Financial year: April (3) of target_year to March (2) of target_year+1
        // Month is 0-indexed: 3=April, 2=March
        if (month >= 3 && year === targetYear) {
          return true; // April-Dec of starting year
        }
        if (month <= 2 && year === targetYear + 1) {
          return true; // Jan-March of ending year
        }
        return false;
      } else {
        // Calendar year: January (0) to December (11) of target_year
        return year === targetYear;
      }
    };
    
    return baseYearSinks.filter(sink => {
      // Match facility
      if (facilityId && sink.facility_id !== facilityId) return false;
      
      // Match year range
      return isInYearRange(sink);
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

  // Render a base year card for a specific scope group
  const renderScopeGroupCard = (entityType, entityId, entityName, scopeGroup, isCompact = false) => {
    const record = getEntityRecord(entityType, entityId, scopeGroup);
    const scopeLabel = getScopeGroupLabel(scopeGroup);
    const badgeColor = scopeGroup === 'scope3' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200';
    const cardBorderColor = record ? (scopeGroup === 'scope3' ? 'border-purple-300 bg-purple-50/30' : 'border-green-300 bg-green-50/30') : '';
    
    return (
      <div 
        key={`${entityType}-${entityId}-${scopeGroup}`}
        className={`p-4 border rounded-lg cursor-pointer hover:shadow-md transition-all ${cardBorderColor}`}
        onClick={() => handleEntityClick(entityType, entityId, entityName, scopeGroup)}
      >
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-medium px-2 py-1 rounded border ${badgeColor}`}>
            {scopeLabel}
          </span>
          {record && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3 h-3" />
              Set
            </span>
          )}
        </div>
        
        {record ? (
          <div className="space-y-2">
            <div>
              <p className="text-xs text-text-muted">Base Year</p>
              <p className="font-semibold text-sm">{record.base_year}</p>
            </div>
            <div className="flex gap-1 flex-wrap">
              <Button 
                variant="ghost" 
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewHistory(record);
                }}
              >
                <History className="w-3 h-3 mr-1" />
                History
              </Button>
              {canEditRecordSync(record) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedScopeGroup(scopeGroup);
                    handleEditEmissions(record);
                  }}
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedScopeGroup(scopeGroup);
                  handleChangeYear(record);
                }}
              >
                <CalendarClock className="w-3 h-3 mr-1" />
                Change
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted flex items-center gap-1 mt-2">
            <Plus className="w-3 h-3" />
            Click to set up
          </p>
        )}
      </div>
    );
  };

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
            Configure separate base years for <strong>Scope 1 & 2</strong> (direct and energy emissions) and <strong>Scope 3</strong> (value chain emissions).
          </p>
        </div>
      </div>

      {/* Organization Section - Only for Admins */}
      {user?.role === 'admin' && organization && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Building className="w-5 h-5" />
            Organization - {organization.name}
          </h2>
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                {renderScopeGroupCard('organization', organization.id, organization.name, 'scope12')}
                {renderScopeGroupCard('organization', organization.id, organization.name, 'scope3')}
              </div>
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
          <div className="grid gap-4 md:grid-cols-2">
            {visibleFacilities.map(facility => (
              <Card key={facility.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{facility.name}</CardTitle>
                    <CardDescription className="text-xs">{facility.city}, {facility.state}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {renderScopeGroupCard('facility', facility.id, facility.name, 'scope12', true)}
                    {renderScopeGroupCard('facility', facility.id, facility.name, 'scope3', true)}
                  </div>
                </CardContent>
              </Card>
            ))}
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
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                selectedScopeGroup === 'scope3' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {getScopeGroupLabel(selectedScopeGroup)}
              </span>
            </DialogTitle>
            <DialogDescription>
              {setupStep === 'prompt' && `Choose how to set your ${getScopeGroupLabel(selectedScopeGroup)} base year`}
              {setupStep === 'select_year' && 'Select your base year'}
              {setupStep === 'enter_emissions' && `Enter ${getScopeGroupLabel(selectedScopeGroup)} base year emissions data`}
            </DialogDescription>
          </DialogHeader>

          {/* Step: Prompt */}
          {setupStep === 'prompt' && oldestYearInfo && (
            <div className="space-y-4">
              <div className="p-4 bg-stone-50 rounded-lg">
                <p className="text-sm text-text-primary">
                  Your oldest {getScopeGroupLabel(selectedScopeGroup)} reporting year is <strong>{oldestYearInfo.oldest_year_formatted}</strong>.
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
              
              {/* MANDATORY Justification field for base year selection */}
              {emissionsData.length > 0 && (
                <div className="space-y-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <Label className="flex items-center gap-2 text-amber-800 font-medium">
                    <AlertCircle className="w-4 h-4" />
                    Justification for Selecting this Base Year *
                  </Label>
                  <Textarea
                    placeholder="Explain why you selected this year as your base year (e.g., first year of complete GHG inventory, strategic planning cycle start, regulatory requirement, etc.)"
                    value={baseYearJustification}
                    onChange={(e) => setBaseYearJustification(e.target.value)}
                    className={`min-h-[100px] ${baseYearJustification.trim().length < 10 ? 'border-amber-400' : 'border-green-400'}`}
                  />
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-amber-700">
                      This justification is required for audit compliance (minimum 10 characters).
                    </p>
                    <span className={`text-xs ${baseYearJustification.trim().length >= 10 ? 'text-green-600' : 'text-amber-600'}`}>
                      {baseYearJustification.trim().length}/10 min
                    </span>
                  </div>
                </div>
              )}
              
              {/* Notes field - optional, only for non-oldest year and when data is editable */}
              {!useOldestYear && !hasExistingEmissionsData && emissionsData.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Additional Notes (Optional)
                  </Label>
                  <Textarea
                    placeholder="Any additional notes about this base year configuration..."
                    value={baseYearNotes}
                    onChange={(e) => setBaseYearNotes(e.target.value)}
                    className="min-h-[60px]"
                  />
                </div>
              )}
              
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setSetupStep('select_year')}>
                  Back
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSaveBaseYear}
                  disabled={savingEmissions || emissionsData.length === 0 || baseYearJustification.trim().length < 10}
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
            
            {/* Justification field - editable when isBeforeOldestYear, otherwise display only */}
            {isBeforeOldestYear ? (
              <div className="space-y-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <Label className="flex items-center gap-2 text-amber-800 font-medium">
                  <AlertCircle className="w-4 h-4" />
                  Justification for Selecting this Base Year *
                </Label>
                <Textarea
                  placeholder="Explain why you selected this year as your base year..."
                  value={baseYearJustification}
                  onChange={(e) => setBaseYearJustification(e.target.value)}
                  className={`min-h-[80px] ${baseYearJustification.trim().length < 10 ? 'border-amber-400' : 'border-green-400'}`}
                />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-amber-700">
                    This justification is required for audit compliance (minimum 10 characters).
                  </p>
                  <span className={`text-xs ${baseYearJustification.trim().length >= 10 ? 'text-green-600' : 'text-amber-600'}`}>
                    {baseYearJustification.trim().length}/10 min
                  </span>
                </div>
              </div>
            ) : baseYearJustification && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">Base Year Justification</span>
                </div>
                <p className="text-sm text-amber-700">{baseYearJustification}</p>
              </div>
            )}
            
            {/* Notes field - editable when isBeforeOldestYear, otherwise display only */}
            {isBeforeOldestYear ? (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Additional Notes (Optional)
                </Label>
                <Textarea
                  placeholder="Any additional notes..."
                  value={baseYearNotes}
                  onChange={(e) => setBaseYearNotes(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
            ) : baseYearNotes && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Additional Notes</span>
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
                  disabled={savingEmissions || baseYearJustification.trim().length < 10}
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
              <div className="p-3 bg-primary/10 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Base Year: {viewRecord.base_year}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      (viewRecord.scope_group || 'scope12') === 'scope3' 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {getScopeGroupLabel(viewRecord.scope_group || 'scope12')}
                    </span>
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
                </div>
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
              
              {/* Justification section - always show if exists */}
              {viewRecord.justification && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">Base Year Justification</span>
                  </div>
                  <p className="text-sm text-amber-700">{viewRecord.justification}</p>
                </div>
              )}
              
              {/* Notes section */}
              {viewRecord.notes && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Additional Notes</span>
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

      {/* Change Base Year Dialog - With Mandatory Reason */}
      <Dialog open={showChangeYearDialog} onOpenChange={(open) => { if (!open) { setShowChangeYearDialog(false); setChangeYearRecord(null); setNewBaseYear(''); setChangeReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Change Base Year
              {changeYearRecord && (
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  (changeYearRecord.scope_group || 'scope12') === 'scope3' 
                    ? 'bg-purple-100 text-purple-700' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {getScopeGroupLabel(changeYearRecord.scope_group || 'scope12')}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Update the base year without losing existing emissions data. The change will be recorded in version history.
            </DialogDescription>
          </DialogHeader>

          {changeYearRecord && (
            <div className="space-y-4">
              {/* Warning Banner */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Important: Changing Base Year</p>
                  <p className="text-xs mt-1">
                    Changing the base year will affect all year-over-year comparisons and reduction tracking for {getScopeGroupLabel(changeYearRecord.scope_group || 'scope12')}. This action requires justification for audit purposes.
                  </p>
                </div>
              </div>
              
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
              
              {/* Mandatory Reason for Change */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-amber-800 font-medium">
                  <AlertCircle className="w-4 h-4" />
                  Reason for Changing Base Year *
                </Label>
                <Textarea
                  placeholder="Explain why you are changing the base year (e.g., data quality issues in previous base year, organizational restructuring, regulatory requirement change, etc.)"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  className={`min-h-[100px] ${changeReason.trim().length < 20 ? 'border-amber-400' : 'border-green-400'}`}
                />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-amber-700">
                    A clear reason is required for audit compliance (minimum 20 characters).
                  </p>
                  <span className={`text-xs ${changeReason.trim().length >= 20 ? 'text-green-600' : 'text-amber-600'}`}>
                    {changeReason.trim().length}/20 min
                  </span>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => { setShowChangeYearDialog(false); setChangeYearRecord(null); setNewBaseYear(''); setChangeReason(''); }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveNewYear}
                  disabled={changingYear || !newBaseYear || newBaseYear === changeYearRecord.base_year || changeReason.trim().length < 20}
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
