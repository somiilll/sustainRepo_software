import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';
import { Building, Building2, CalendarClock, Check, X, Loader2, History, Plus, AlertTriangle, Info, Eye, FileText, Trash2, Edit2, Leaf, AlertCircle, PlusCircle, ChevronDown, ChevronRight, Search, MapPin, Filter } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BaseYearEmissions({ hideTopHeader = false } = {}) {
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
  
  // Phase 1 Enhancement: Manual category addition
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [newCategoryEntry, setNewCategoryEntry] = useState({ scope: '', category: '', subcategory: '', tco2e: 0 });
  const [availableCategories, setAvailableCategories] = useState([]); // Dynamic categories from system
  const [manuallyAddedCategories, setManuallyAddedCategories] = useState([]); // Track manually added entries
  const [scope3Categories, setScope3Categories] = useState([]); // Scope 3 categories (C1, C2, etc.)
  const [scope3Activities, setScope3Activities] = useState([]); // Activities for selected Scope 3 category
  const [fuelNames, setFuelNames] = useState([]); // Fuel names for Scope 1&2 categories
  const [biogenicFuels, setBiogenicFuels] = useState([]); // Fuel names for Biogenic (Direct)
  const [biogenicIndirectCategories] = useState(['C3', 'C8', 'C10', 'C11', 'C13', 'C14']); // Fixed categories for Biogenic (Indirect)
  const [biogenicIndirectSubcategories, setBiogenicIndirectSubcategories] = useState([]); // Subcategories for Biogenic (Indirect)

  // Accordion and filter states for redesigned UI
  const [expandedFacility, setExpandedFacility] = useState(null); // Only one facility expanded at a time
  const [expandedOrganization, setExpandedOrganization] = useState(false); // Organization accordion state
  const [facilitySearch, setFacilitySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'configured', 'pending', 'missing'

  // Check if organization has Scope 3 access
  const hasScope3Access = organization?.enabled_access?.includes('scope1_2_3') || false;

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

  // Synchronous version for UI rendering - Phase 1 Enhancement: Always editable
  const canEditRecordSync = (record) => {
    // Phase 1: Remove ALL edit restrictions - users can always edit
    return record !== null && record !== undefined;
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
    // NOTE: Sinks only apply to Scope 1&2, NOT Scope 3
    if (beforeOldest && selectedEntity?.type === 'facility' && selectedScopeGroup === 'scope12') {
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
      // Scope 3 base years never have sinks
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
    setSelectedYear(record.base_year);
    setIsOldestYearRecord(record.is_oldest_year === true);
    setBaseYearNotes(record.notes || '');
    setBaseYearJustification(record.justification || ''); // Load existing justification
    setSelectedScopeGroup(record.scope_group || 'scope12'); // Phase 2: Load scope group from record
    
    // Parse year from base_year string (e.g., "FY 2024-2025" -> 2024)
    const yearMatch = record.base_year.match(/(\d{4})/);
    const yearNum = yearMatch ? parseInt(yearMatch[1]) : null;
    
    // Fetch fresh emission combinations from API to detect new scope+category combos
    const recordScopeGroup = record.scope_group || 'scope12';
    try {
      let url = `${API}/base-year-emissions/emission-combinations/${entityType}/${entityId}`;
      const params = new URLSearchParams();
      if (yearNum) params.append('year', yearNum);
      if (recordScopeGroup) params.append('scope_group', recordScopeGroup);
      if (params.toString()) url += `?${params.toString()}`;
      
      const combosResponse = await axios.get(url, { headers: getAuthHeader() });
      const freshCombinations = combosResponse.data.combinations || [];
      
      // Merge saved emissions_data with fresh combinations
      // Keep saved values, but add any NEW combinations that weren't in the saved data
      const savedData = record.emissions_data || [];
      const savedKeys = new Set(savedData.map(e => `${e.scope}|${e.category}|${e.subcategory || ''}`));
      
      // Find new combinations not in saved data
      const newCombinations = freshCombinations.filter(c => {
        const key = `${c.scope}|${c.category}|${c.subcategory || ''}`;
        return !savedKeys.has(key);
      }).map(c => ({
        scope: c.scope,
        category: c.category,
        subcategory: c.subcategory || '',
        tco2e: c.tco2e || 0
      }));
      
      // Also fetch sinks for Scope 1&2 - ONLY if they were already saved in the record
      let sinksToAdd = [];
      if (recordScopeGroup === 'scope12' && yearNum) {
        // Check if sinks are already in saved data - only add if they were previously saved
        const hasSavedSinks = savedData.some(e => e.scope?.toLowerCase() === 'sinks');
        
        // Only fetch and add sinks if they were in the saved configuration
        if (hasSavedSinks) {
          const yearStr = organization?.reporting_year_type === 'financial_year' 
            ? `FY ${yearNum}-${yearNum + 1}` 
            : String(yearNum);
          const facilityIdFilter = entityType === 'facility' ? entityId : null;
          const matchedSinks = getSinksForBaseYear(yearStr, facilityIdFilter);
          
          if (matchedSinks.length > 0) {
            // Aggregate sinks
            const sinkAggregates = {};
            matchedSinks.forEach(sink => {
              const key = `${sink.sink_type || 'other'}_${sink.description || 'Carbon Sink'}`;
              if (!sinkAggregates[key]) {
                sinkAggregates[key] = { sink_type: sink.sink_type || 'other', description: sink.description || '', total: 0 };
              }
              sinkAggregates[key].total += parseFloat(sink.total_emissions_reduced) || 0;
            });
            
            sinksToAdd = Object.values(sinkAggregates).map(agg => ({
              scope: 'Sinks',
              category: agg.sink_type || agg.description || 'Carbon Sink',
              subcategory: agg.description || '',
              tco2e: -(Math.abs(agg.total)),
              isSink: true
            }));
          }
        }
      }
      
      // Remove any existing sinks from savedData to avoid duplicates (will be replaced by sinksToAdd)
      const savedDataWithoutSinks = savedData.filter(e => e.scope?.toLowerCase() !== 'sinks');
      
      // Combine: saved data (without sinks) + new combinations + fresh sinks (if any)
      const mergedData = [...savedDataWithoutSinks, ...newCombinations, ...sinksToAdd];
      
      setEmissionsData(mergedData);
    } catch (error) {
      console.error('Error fetching fresh combinations:', error);
      // Fallback to saved data only
      setEmissionsData(record.emissions_data || []);
    }
    
    // Fetch oldest year info to determine editability
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
      // NOTE: Sinks only apply to Scope 1&2, NOT Scope 3
      if (beforeOldest && entityType === 'facility' && recordScopeGroup === 'scope12') {
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
        // Scope 3 base years never have sinks
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
      
      // CRITICAL FIX: Filter combinations to ensure only valid scopes for the scope_group
      // This prevents scope3 data from appearing in scope12 view
      if (selectedScopeGroup === 'scope12') {
        const validScope12 = ['scope1', 'scope2', 'sinks', 'biogenic', 'biogenic (direct)'];
        combinations = combinations.filter(c => {
          const scopeLower = (c.scope || '').toLowerCase();
          return validScope12.some(vs => scopeLower === vs || scopeLower.startsWith(vs));
        });
      } else if (selectedScopeGroup === 'scope3') {
        const validScope3 = ['scope3', 'biogenic (indirect)'];
        combinations = combinations.filter(c => {
          const scopeLower = (c.scope || '').toLowerCase();
          return validScope3.some(vs => scopeLower === vs || scopeLower.startsWith(vs));
        });
      }
      
      // SINKS FETCHING - Always fetch sinks for Scope 1&2 when year is selected
      // Sinks should show even if no emissions data exists for that year
      let sinksToAdd = [];
      if (selectedScopeGroup === 'scope12' && selectedEntity && year) {
        // Use selectedYear if available (it's already in the correct format like "FY 2024-2025")
        // Otherwise construct from year parameter
        let yearStr;
        if (selectedYear && (selectedYear.includes('FY') || selectedYear.includes('-'))) {
          yearStr = selectedYear;
        } else {
          yearStr = organization?.reporting_year_type === 'financial_year' 
            ? `FY ${year}-${year + 1}` 
            : String(year);
        }
        
        // For facilities: get sinks for that specific facility
        // For organizations: get sinks from ALL facilities (pass null to get all)
        const facilityIdFilter = selectedEntity.type === 'facility' ? selectedEntity.id : null;
        const matchedSinks = getSinksForBaseYear(yearStr, facilityIdFilter);
        
        // Aggregate sinks by description/type to avoid duplicates
        const sinkAggregates = {};
        matchedSinks.forEach(sink => {
          const key = `${sink.sink_type || 'other'}_${sink.description || 'Carbon Sink'}`;
          if (!sinkAggregates[key]) {
            sinkAggregates[key] = {
              sink_type: sink.sink_type || 'other',
              description: sink.description || '',
              total: 0
            };
          }
          sinkAggregates[key].total += parseFloat(sink.total_emissions_reduced) || 0;
        });
        
        // Convert aggregated sinks to emission entries with NEGATIVE values
        sinksToAdd = Object.values(sinkAggregates).map(agg => ({
          scope: 'Sinks',
          category: agg.sink_type || agg.description || 'Carbon Sink',
          subcategory: agg.description || '',
          tco2e: -(Math.abs(agg.total)), // NEGATIVE value for sinks (carbon removal)
          isSink: true
        }));
        
        console.log('[BaseYear] Sinks to add:', sinksToAdd);
      }
      
      setEmissionCombinations(combinations);
      setHasExistingEmissionsData(dataExistsForYear);
      
      // Use the values from the API response (will have actual tCO2e if year was specified and data exists)
      const emissionsEntries = combinations.map(c => ({
        scope: c.scope,
        category: c.category,
        subcategory: c.subcategory || '',
        tco2e: c.tco2e || 0  // Use actual emissions if available, otherwise 0
      }));
      
      // Add sinks entries - sinks are added regardless of whether emissions exist
      // If no emissions but sinks exist, user will still see sinks
      const finalData = [...emissionsEntries, ...sinksToAdd];
      console.log('[BaseYear] Final emissionsData count:', finalData.length);
      setEmissionsData(finalData);
      
      // Fetch available categories for manual addition
      await fetchAvailableCategories();
      
    } catch (error) {
      console.error('Error fetching combinations:', error);
      toast.error('Failed to load emission categories');
    }
  };

  const handleEmissionValueChange = (index, value) => {
    const numValue = parseFloat(value) || 0;
    const entry = emissionsData[index];
    
    // Allow negative values only for Sinks
    if (entry?.scope !== 'Sinks' && numValue < 0) {
      toast.error('Emission values cannot be negative (except for Sinks)');
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
      // CRITICAL: Filter emissions_data to only include valid scopes for the scope_group
      // This prevents scope3 data from being saved in a scope12 record and vice versa
      const validScopes = selectedScopeGroup === 'scope12' 
        ? ['scope1', 'scope2', 'Sinks', 'Biogenic (Direct)', 'biogenic'] 
        : ['scope3', 'Biogenic (Indirect)'];
      
      const filteredEmissionsData = emissionsData.filter(e => {
        const scope = e.scope?.toLowerCase?.() || e.scope;
        // Check if scope matches valid scopes (case-insensitive for some scopes)
        return validScopes.some(vs => {
          if (typeof vs === 'string' && typeof scope === 'string') {
            return vs.toLowerCase() === scope.toLowerCase() || scope.toLowerCase().startsWith(vs.toLowerCase());
          }
          return vs === scope;
        });
      });
      
      // Warn if data was filtered out
      if (filteredEmissionsData.length !== emissionsData.length) {
        const removedCount = emissionsData.length - filteredEmissionsData.length;
        console.warn(`Filtered out ${removedCount} entries with invalid scopes for ${selectedScopeGroup}`);
      }
      
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
        emissions_data: filteredEmissionsData, // Use filtered data
        sinks_data: sinkData,
        justification: baseYearJustification.trim(), // Mandatory justification
        notes: useOldestYear === false ? baseYearNotes : null  // Include notes only for non-oldest year
      };
      
      if (existingRecord) {
        // Update existing record
        await axios.put(`${API}/base-year-emissions/${existingRecord.id}`, {
          emissions_data: filteredEmissionsData, // Use filtered data
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
      // First, save the base year change with reason
      await axios.patch(
        `${API}/base-year-emissions/${changeYearRecord.id}/change-year?new_base_year=${encodeURIComponent(newBaseYear)}&change_reason=${encodeURIComponent(changeReason.trim())}`,
        {},
        { headers: getAuthHeader() }
      );
      
      toast.success(`Base year changed from ${changeYearRecord.base_year} to ${newBaseYear}`);
      
      // Phase 1 Enhancement: Instead of closing, continue to emissions editing dialog
      // Prepare the entity for editing
      const entityType = changeYearRecord.facility_id ? 'facility' : 'organization';
      const entityId = changeYearRecord.facility_id || changeYearRecord.organization_id;
      const entityName = changeYearRecord.facility_id 
        ? facilities.find(f => f.id === changeYearRecord.facility_id)?.name 
        : organization?.name;
      
      setSelectedEntity({ type: entityType, id: entityId, name: entityName });
      setSelectedYear(newBaseYear);
      setSelectedScopeGroup(changeYearRecord.scope_group || 'scope12');
      setBaseYearJustification(changeYearRecord.justification || '');
      setBaseYearNotes(changeYearRecord.notes || '');
      
      // Fetch emission combinations for the new base year
      const yearMatch = newBaseYear.match(/\d{4}/);
      const yearNum = yearMatch ? parseInt(yearMatch[0]) : null;
      
      // Check if data exists for the new year in GHG module
      let url = `${API}/base-year-emissions/emission-combinations/${entityType}/${entityId}`;
      const params = new URLSearchParams();
      if (yearNum) params.append('year', yearNum);
      if (changeYearRecord.scope_group) params.append('scope_group', changeYearRecord.scope_group);
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await axios.get(url, { headers: getAuthHeader() });
      const combinations = response.data.combinations || [];
      const dataExistsForYear = response.data.has_values === true;
      
      setEmissionCombinations(combinations);
      setHasExistingEmissionsData(dataExistsForYear);
      
      if (dataExistsForYear && combinations.length > 0) {
        // Auto-populate from GHG data
        setEmissionsData(combinations.map(c => ({
          scope: c.scope,
          category: c.category,
          subcategory: c.subcategory || '',
          tco2e: c.tco2e || 0
        })));
      } else {
        // No data for this year - fetch ALL unique categories and show with 0 values
        // This allows users to enter data manually for any category
        let allCombosUrl = `${API}/base-year-emissions/emission-combinations/${entityType}/${entityId}`;
        const allCombosParams = new URLSearchParams();
        if (changeYearRecord.scope_group) allCombosParams.append('scope_group', changeYearRecord.scope_group);
        if (allCombosParams.toString()) allCombosUrl += `?${allCombosParams.toString()}`;
        
        const allCombosResponse = await axios.get(allCombosUrl, { headers: getAuthHeader() });
        const allCombinations = allCombosResponse.data.combinations || [];
        
        if (allCombinations.length > 0) {
          setEmissionsData(allCombinations.map(c => ({
            scope: c.scope,
            category: c.category,
            subcategory: c.subcategory || '',
            tco2e: 0
          })));
          setEmissionCombinations(allCombinations);
        } else {
          // No categories at all - start with empty list for manual addition
          setEmissionsData([]);
        }
      }
      
      // Fetch available categories for manual addition
      await fetchAvailableCategories();
      
      // Close change year dialog and open emissions dialog
      setShowChangeYearDialog(false);
      setChangeYearRecord(null);
      setChangeReason('');
      setShowEmissionsDialog(true);
      
      // Refresh base year records in background
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
    // Phase 1 Enhancement: Reset manual category states
    setShowAddCategoryForm(false);
    setNewCategoryEntry({ scope: '', category: '', subcategory: '', tco2e: 0 });
    setManuallyAddedCategories([]);
    setScope3Activities([]); // Reset Scope 3 activities
  };

  // Phase 1 Enhancement: Get allowed scopes based on scope group
  const getAllowedScopes = (scopeGroup) => {
    if (scopeGroup === 'scope3') {
      return ['scope3', 'Biogenic (Indirect)'];
    }
    // scope12 - Scope 1 & 2 section
    return ['scope1', 'scope2', 'Biogenic (Direct)', 'Sinks'];
  };

  // Phase 1 Enhancement: Fetch available categories from the system
  const fetchAvailableCategories = async () => {
    try {
      // Fetch from emission_categories collection for Scope 1 & 2
      const response = await axios.get(`${API}/emission-categories`, {
        headers: getAuthHeader()
      });
      const categories = response.data || [];
      setAvailableCategories(categories);
      
      // Fetch Scope 3 categories from scope3_ef collection
      const scope3Response = await axios.get(`${API}/scope3-ef/categories`, {
        headers: getAuthHeader()
      });
      setScope3Categories(scope3Response.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback to empty array
      setAvailableCategories([]);
      setScope3Categories([]);
    }
  };

  // Fetch activities for a selected Scope 3 category
  const fetchScope3Activities = async (category) => {
    if (!category) {
      setScope3Activities([]);
      return;
    }
    try {
      const response = await axios.get(`${API}/scope3-ef/activities?category=${encodeURIComponent(category)}`, {
        headers: getAuthHeader()
      });
      setScope3Activities(response.data || []);
    } catch (error) {
      console.error('Error fetching Scope 3 activities:', error);
      setScope3Activities([]);
    }
  };

  // Fetch fuel names for a Scope 1&2 category
  const fetchFuelNamesForCategory = async (category) => {
    if (!category) {
      setFuelNames([]);
      return;
    }
    try {
      const response = await axios.get(`${API}/base-year/fuel-names?category=${encodeURIComponent(category)}`, {
        headers: getAuthHeader()
      });
      setFuelNames(response.data || []);
    } catch (error) {
      console.error('Error fetching fuel names:', error);
      setFuelNames([]);
    }
  };

  // Fetch biogenic fuel names
  const fetchBiogenicFuels = async () => {
    try {
      const response = await axios.get(`${API}/base-year/biogenic-fuels`, {
        headers: getAuthHeader()
      });
      setBiogenicFuels(response.data || []);
    } catch (error) {
      console.error('Error fetching biogenic fuels:', error);
      setBiogenicFuels([]);
    }
  };

  // Fetch biogenic indirect subcategories for a category
  const fetchBiogenicIndirectSubcategories = async (category) => {
    if (!category) {
      setBiogenicIndirectSubcategories([]);
      return;
    }
    try {
      const response = await axios.get(`${API}/base-year/biogenic-indirect-subcategories?category=${encodeURIComponent(category)}`, {
        headers: getAuthHeader()
      });
      setBiogenicIndirectSubcategories(response.data || []);
    } catch (error) {
      console.error('Error fetching biogenic indirect subcategories:', error);
      setBiogenicIndirectSubcategories([]);
    }
  };

  // Phase 1 Enhancement: Get categories for selected scope
  const getCategoriesForScope = (scope) => {
    if (!scope) return [];
    
    // For Scope 3, return the C1, C2, etc. categories from scope3_ef
    if (scope === 'scope3') {
      return scope3Categories;
    }
    
    // For Biogenic (Direct), return biogenic fuel names
    if (scope === 'Biogenic (Direct)') {
      return biogenicFuels;
    }
    
    // For Biogenic (Indirect) in Scope 3, return specific categories
    if (scope === 'Biogenic (Indirect)') {
      // Return full category names from scope3Categories that match the allowed codes
      return scope3Categories.filter(cat => {
        const code = cat.split(' - ')[0].trim();
        return biogenicIndirectCategories.includes(code);
      });
    }
    
    // For Scope 1&2 regular categories, return fuel names if available
    if (['scope1', 'scope2'].includes(scope)) {
      // Return fuel names from the fuelNames state (populated when category is selected)
      if (fuelNames.length > 0) {
        return fuelNames;
      }
      // Fallback to predefined categories
      const categoryOptions = {
        'scope1': ['Stationary Combustion', 'Mobile Combustion', 'Fugitive Emissions', 'Process Emissions'],
        'scope2': ['Purchased Electricity', 'Purchased Steam', 'Purchased Heating', 'Purchased Cooling']
      };
      return categoryOptions[scope] || [];
    }
    
    // Map internal scope values to emission_categories scope values
    const scopeMapping = {
      'scope1': 'scope1',
      'scope2': 'scope2',
      'Sinks': 'sinks'
    };
    
    const mappedScope = scopeMapping[scope] || scope;
    
    // Filter categories by scope
    const filtered = availableCategories.filter(cat => {
      const catScope = (cat.scope || '').toLowerCase();
      return catScope === mappedScope.toLowerCase();
    });
    
    // Return unique category names
    const uniqueCategories = [...new Set(filtered.map(c => c.name || c.category))];
    return uniqueCategories;
  };

  // Get subcategories/activities based on scope and category
  const getSubcategoriesForCategory = (scope, category) => {
    if (!scope || !category) return [];
    
    // For Scope 3, return activities
    if (scope === 'scope3') {
      return scope3Activities;
    }
    
    // For Biogenic (Indirect), return biogenic subscope activities
    if (scope === 'Biogenic (Indirect)') {
      return biogenicIndirectSubcategories;
    }
    
    // For Biogenic (Direct), subcategory is optional text - return empty
    if (scope === 'Biogenic (Direct)') {
      return []; // Text input will be shown
    }
    
    // For Scope 1&2, return fuel names based on category
    if (['scope1', 'scope2'].includes(scope)) {
      return fuelNames;
    }
    
    return [];
  };

  // Phase 1 Enhancement: Check if a category exists in current GHG emissions
  const categoryExistsInCurrentEmissions = (scope, category, subcategory) => {
    return emissionCombinations.some(combo => 
      combo.scope === scope && 
      combo.category === category && 
      (combo.subcategory || '') === (subcategory || '')
    );
  };

  // Phase 1 Enhancement: Add a manual category entry
  const handleAddManualCategory = () => {
    if (!newCategoryEntry.scope || !newCategoryEntry.category) {
      toast.error('Please select both Scope and Category');
      return;
    }
    
    // Check if this combination already exists in emissionsData
    const exists = emissionsData.some(entry => 
      entry.scope === newCategoryEntry.scope && 
      entry.category === newCategoryEntry.category && 
      (entry.subcategory || '') === (newCategoryEntry.subcategory || '')
    );
    
    if (exists) {
      toast.error('This category already exists in the emissions list');
      return;
    }
    
    // Add to emissions data
    const newEntry = {
      scope: newCategoryEntry.scope,
      category: newCategoryEntry.category,
      subcategory: newCategoryEntry.subcategory || '',
      tco2e: parseFloat(newCategoryEntry.tco2e) || 0,
      isManuallyAdded: true // Track that this was manually added
    };
    
    setEmissionsData([...emissionsData, newEntry]);
    setManuallyAddedCategories([...manuallyAddedCategories, newEntry]);
    
    // Reset form
    setNewCategoryEntry({ scope: '', category: '', subcategory: '', tco2e: 0 });
    setShowAddCategoryForm(false);
    
    // Show warning if category doesn't exist in current emissions
    if (!categoryExistsInCurrentEmissions(newEntry.scope, newEntry.category, newEntry.subcategory)) {
      toast.warning('Note: This category does not exist in current GHG emissions data');
    } else {
      toast.success('Category added successfully');
    }
  };

  // Phase 1 Enhancement: Remove a category (any category, not just manually added)
  const handleRemoveCategory = (index) => {
    const entry = emissionsData[index];
    if (entry) {
      const updated = emissionsData.filter((_, i) => i !== index);
      setEmissionsData(updated);
      
      // Also remove from manually added if it was manually added
      if (entry.isManuallyAdded) {
        setManuallyAddedCategories(manuallyAddedCategories.filter(m => 
          !(m.scope === entry.scope && m.category === entry.category && m.subcategory === entry.subcategory)
        ));
      }
      toast.success('Category removed');
    }
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

  // Get sinks for a specific base year and facility (or all facilities for organization)
  // facilityId can be: 
  //   - a specific facility ID string
  //   - null to get sinks from ALL facilities (for organization-level)
  //   - an array of facility IDs (for organization-level with specific facilities)
  const getSinksForBaseYear = (baseYear, facilityId = null) => {
    console.log('[getSinksForBaseYear] Called with baseYear:', baseYear, 'facilityId:', facilityId);
    console.log('[getSinksForBaseYear] baseYearSinks count:', baseYearSinks.length);
    
    if (!baseYear || !baseYearSinks.length) {
      console.log('[getSinksForBaseYear] Early return - no baseYear or no sinks');
      return [];
    }
    
    const isFinancialYear = organization?.reporting_year_type === 'financial_year';
    console.log('[getSinksForBaseYear] isFinancialYear:', isFinancialYear);
    
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
    console.log('[getSinksForBaseYear] targetYear:', targetYear);
    
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
    
    // Get list of valid facility IDs to filter
    let validFacilityIds = null;
    if (facilityId) {
      if (Array.isArray(facilityId)) {
        validFacilityIds = facilityId;
      } else {
        validFacilityIds = [facilityId];
      }
    }
    // If facilityId is null, don't filter by facility (get all org's sinks)
    
    const result = baseYearSinks.filter(sink => {
      // Match facility if specified
      if (validFacilityIds && !validFacilityIds.includes(sink.facility_id)) return false;
      
      // Match year range
      const inRange = isInYearRange(sink);
      if (!inRange) {
        const dateInfo = parseSinkDate(sink);
        console.log('[getSinksForBaseYear] Sink excluded:', sink.facility_id?.slice(0, 8), 'dateInfo:', dateInfo, 'reason: not in year range');
      }
      return inRange;
    });
    
    console.log('[getSinksForBaseYear] Result count:', result.length);
    return result;
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

  // Get facility status based on base year configuration
  const getFacilityStatus = (facilityId) => {
    const scope12Record = getEntityRecord('facility', facilityId, 'scope12');
    const scope3Record = hasScope3Access ? getEntityRecord('facility', facilityId, 'scope3') : null;
    
    if (hasScope3Access) {
      if (scope12Record && scope3Record) return 'configured';
      if (scope12Record || scope3Record) return 'pending';
      return 'missing';
    } else {
      return scope12Record ? 'configured' : 'missing';
    }
  };

  // Filter facilities by search and status
  const filteredFacilities = visibleFacilities.filter(facility => {
    // Search filter
    const searchLower = facilitySearch.toLowerCase();
    const matchesSearch = !facilitySearch || 
      facility.name?.toLowerCase().includes(searchLower) ||
      facility.city?.toLowerCase().includes(searchLower) ||
      facility.state?.toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;
    
    // Status filter
    if (statusFilter === 'all') return true;
    const facilityStatus = getFacilityStatus(facility.id);
    return facilityStatus === statusFilter;
  });

  // Get status badge - returns JSX (not a component to avoid reconciliation issues)
  const getStatusBadge = (status) => {
    const config = {
      configured: { label: 'Configured', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
      pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 border-amber-200' },
      missing: { label: 'Missing', className: 'bg-stone-100 text-stone-600 border-stone-200' }
    };
    const { label, className } = config[status] || config.missing;
    return <Badge variant="outline" className={`text-xs ${className}`}>{label}</Badge>;
  };

  // Handle accordion toggle - only one can be open (facilities collapse when org opens and vice versa)
  const handleAccordionToggle = (facilityId) => {
    if (expandedFacility === facilityId) {
      setExpandedFacility(null);
    } else {
      setExpandedFacility(facilityId);
      setExpandedOrganization(false); // Collapse org when facility opens
    }
  };

  // Handle organization accordion toggle
  const handleOrgAccordionToggle = () => {
    if (expandedOrganization) {
      setExpandedOrganization(false);
    } else {
      setExpandedOrganization(true);
      setExpandedFacility(null); // Collapse facilities when org opens
    }
  };

  // Get organization status based on base year configuration
  const getOrganizationStatus = () => {
    if (!organization) return 'missing';
    const scope12Record = getEntityRecord('organization', organization.id, 'scope12');
    const scope3Record = hasScope3Access ? getEntityRecord('organization', organization.id, 'scope3') : null;
    
    if (hasScope3Access) {
      if (scope12Record && scope3Record) return 'configured';
      if (scope12Record || scope3Record) return 'pending';
      return 'missing';
    } else {
      return scope12Record ? 'configured' : 'missing';
    }
  };

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
    
    // Users can only view org-level records, not edit
    const isOrgReadOnly = entityType === 'organization' && user?.role === 'user';
    
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
              {!isOrgReadOnly && canEditRecordSync(record) && (
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
              {!isOrgReadOnly && (
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
              )}
              {!isOrgReadOnly && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRecord(record.id);
                  }}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        ) : (
          !isOrgReadOnly ? (
            <p className="text-xs text-text-muted flex items-center gap-1 mt-2">
              <Plus className="w-3 h-3" />
              Click to set up
            </p>
          ) : (
            <p className="text-xs text-text-muted mt-2">
              Not configured
            </p>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      {!hideTopHeader && (
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Base Year Emissions</h1>
          <p className="text-text-muted mt-1">
            Set up base year emissions for comparing and tracking GHG reduction progress
          </p>
        </div>
      )}

      {/* ========== UNIFIED BASE YEAR SECTION ========== */}
      <div className="space-y-4">
        {/* Section Header with Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Base Years
          </h2>
          
          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Search Box */}
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                type="text"
                placeholder="Search..."
                value={facilitySearch}
                onChange={(e) => setFacilitySearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            
            {/* Filter Chips */}
            <div className="flex gap-2 items-center">
              {['all', 'configured', 'pending', 'missing'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    statusFilter === filter
                      ? 'bg-primary text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Unified Accordion List */}
        <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
          
          {/* ========== ORGANIZATION ROW ========== */}
          {(user?.role === 'admin' || user?.role === 'user') && organization && (statusFilter === 'all' || statusFilter === getOrganizationStatus()) && (
            <div className="bg-gradient-to-r from-primary/5 to-transparent">
              {/* Organization Collapsed Row */}
              <button
                onClick={handleOrgAccordionToggle}
                className={`w-full px-4 py-3 flex items-center gap-4 hover:bg-stone-50/50 transition-colors text-left ${expandedOrganization ? 'bg-stone-50/50' : ''}`}
              >
                {/* Expand/Collapse Icon */}
                <div className="flex-shrink-0">
                  {expandedOrganization ? (
                    <ChevronDown className="w-5 h-5 text-text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-text-muted" />
                  )}
                </div>
                
                {/* Organization Name */}
                <div className="min-w-0 w-40 sm:w-48">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="font-semibold text-text-primary truncate">{organization.name}</p>
                  </div>
                </div>
                
                {/* Type Column */}
                <div className="hidden sm:block min-w-[100px]">
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                    Organization
                  </Badge>
                </div>
                
                {/* Scope 1 & 2 Base Year - Clickable Card */}
                <div 
                  className="hidden sm:block min-w-[120px] p-2 rounded-lg bg-blue-50/50 border border-blue-100 hover:bg-blue-100/50 transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const record = getEntityRecord('organization', organization.id, 'scope12');
                    if (record) {
                      setViewRecord(record);
                      setShowViewDialog(true);
                    } else if (user?.role === 'admin') {
                      handleEntityClick('organization', organization.id, organization.name, 'scope12');
                    }
                  }}
                >
                  <p className="text-xs text-blue-600 font-medium">Scope 1 & 2</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {getEntityRecord('organization', organization.id, 'scope12')?.base_year || '—'}
                  </p>
                </div>
                
                {/* Scope 3 Base Year - Clickable Card */}
                {hasScope3Access && (
                  <div 
                    className="hidden sm:block min-w-[120px] p-2 rounded-lg bg-purple-50/50 border border-purple-100 hover:bg-purple-100/50 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      const record = getEntityRecord('organization', organization.id, 'scope3');
                      if (record) {
                        setViewRecord(record);
                        setShowViewDialog(true);
                      } else if (user?.role === 'admin') {
                        handleEntityClick('organization', organization.id, organization.name, 'scope3');
                      }
                    }}
                  >
                    <p className="text-xs text-purple-600 font-medium">Scope 3</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {getEntityRecord('organization', organization.id, 'scope3')?.base_year || '—'}
                    </p>
                  </div>
                )}
                
                {/* Spacer */}
                <div className="flex-1" />
                
                {/* Status Badge */}
                <div className="flex-shrink-0">
                  {getStatusBadge(getOrganizationStatus())}
                </div>
                
                {/* View Only Badge for users */}
                {user?.role === 'user' && (
                  <Badge variant="outline" className="text-xs bg-stone-50 flex-shrink-0">View Only</Badge>
                )}
              </button>
              
              {/* Organization Expanded Content */}
              {expandedOrganization && (
                <div className="px-4 py-4 bg-stone-50/50 border-t border-stone-100">
                  <div className={`grid gap-4 ${hasScope3Access ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-md'}`}>
                    {/* Scope 1 & 2 Panel */}
                    {(() => {
                      const scope12Record = getEntityRecord('organization', organization.id, 'scope12');
                      const isOrgReadOnly = user?.role === 'user';
                      return (
                        <div className="bg-white rounded-lg border border-stone-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200">Scope 1 & 2</Badge>
                            {scope12Record ? (
                              <span className="font-semibold text-text-primary">{scope12Record.base_year}</span>
                            ) : (
                              getStatusBadge("missing")
                            )}
                          </div>
                          
                          {scope12Record ? (
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleViewHistory(scope12Record); }}>
                                <History className="w-3 h-3 mr-1" /> History
                              </Button>
                              {!isOrgReadOnly && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope12'); handleEditEmissions(scope12Record); }}>
                                    <Edit2 className="w-3 h-3 mr-1" /> Edit
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope12'); handleChangeYear(scope12Record); }}>
                                    <CalendarClock className="w-3 h-3 mr-1" /> Change
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(scope12Record.id); }}>
                                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : !isOrgReadOnly ? (
                            <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handleEntityClick('organization', organization.id, organization.name, 'scope12'); }}>
                              <Plus className="w-3 h-3 mr-1" /> Set Up Base Year
                            </Button>
                          ) : (
                            <p className="text-xs text-text-muted">Not configured</p>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Scope 3 Panel (if enabled) */}
                    {hasScope3Access && (() => {
                      const scope3Record = getEntityRecord('organization', organization.id, 'scope3');
                      const isOrgReadOnly = user?.role === 'user';
                      return (
                        <div className="bg-white rounded-lg border border-stone-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200">Scope 3</Badge>
                            {scope3Record ? (
                              <span className="font-semibold text-text-primary">{scope3Record.base_year}</span>
                            ) : (
                              getStatusBadge("missing")
                            )}
                          </div>
                          
                          {scope3Record ? (
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleViewHistory(scope3Record); }}>
                                <History className="w-3 h-3 mr-1" /> History
                              </Button>
                              {!isOrgReadOnly && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope3'); handleEditEmissions(scope3Record); }}>
                                    <Edit2 className="w-3 h-3 mr-1" /> Edit
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope3'); handleChangeYear(scope3Record); }}>
                                    <CalendarClock className="w-3 h-3 mr-1" /> Change
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(scope3Record.id); }}>
                                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : !isOrgReadOnly ? (
                            <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handleEntityClick('organization', organization.id, organization.name, 'scope3'); }}>
                              <Plus className="w-3 h-3 mr-1" /> Set Up Base Year
                            </Button>
                          ) : (
                            <p className="text-xs text-text-muted">Not configured</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* ========== FACILITY ROWS ========== */}
          {visibleFacilities.length === 0 ? (
            <div className="py-8 text-center text-text-muted border-t border-stone-100">
              {user?.role === 'user' 
                ? 'No facilities assigned to you yet.'
                : 'No facilities found. Add facilities first.'}
            </div>
          ) : filteredFacilities.length === 0 ? (
            <div className="py-8 text-center text-text-muted border-t border-stone-100">
              No facilities match your search or filter criteria.
            </div>
          ) : (
            filteredFacilities.map((facility) => {
              const isExpanded = expandedFacility === facility.id;
              const facilityStatus = getFacilityStatus(facility.id);
              const scope12Record = getEntityRecord('facility', facility.id, 'scope12');
              const scope3Record = hasScope3Access ? getEntityRecord('facility', facility.id, 'scope3') : null;
              
              return (
                <div key={facility.id} className="border-t border-stone-100">
                  {/* Collapsed Row */}
                  <button
                    onClick={() => handleAccordionToggle(facility.id)}
                    className={`w-full px-4 py-3 flex items-center gap-4 hover:bg-stone-50 transition-colors text-left ${isExpanded ? 'bg-stone-50' : ''}`}
                  >
                    {/* Expand/Collapse Icon */}
                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-text-muted" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-text-muted" />
                      )}
                    </div>
                    
                    {/* Facility Name & Location */}
                    <div className="min-w-0 w-40 sm:w-48">
                      <p className="font-medium text-text-primary truncate">{facility.name}</p>
                      <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3" />
                        {facility.city}, {facility.state}
                      </p>
                    </div>
                    
                    {/* Type Column */}
                    <div className="hidden sm:block min-w-[100px]">
                      <Badge variant="outline" className="bg-stone-50 text-stone-600 border-stone-200 text-xs">
                        Facility
                      </Badge>
                    </div>
                    
                    {/* Scope 1 & 2 Base Year - Clickable Card */}
                    <div 
                      className="hidden sm:block min-w-[120px] p-2 rounded-lg bg-blue-50/50 border border-blue-100 hover:bg-blue-100/50 transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (scope12Record) {
                          setViewRecord(scope12Record);
                          setShowViewDialog(true);
                        } else {
                          handleEntityClick('facility', facility.id, facility.name, 'scope12');
                        }
                      }}
                    >
                      <p className="text-xs text-blue-600 font-medium">Scope 1 & 2</p>
                      <p className="text-sm font-semibold text-text-primary">
                        {scope12Record?.base_year || '—'}
                      </p>
                    </div>
                    
                    {/* Scope 3 Base Year - Clickable Card */}
                    {hasScope3Access && (
                      <div 
                        className="hidden sm:block min-w-[120px] p-2 rounded-lg bg-purple-50/50 border border-purple-100 hover:bg-purple-100/50 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (scope3Record) {
                            setViewRecord(scope3Record);
                            setShowViewDialog(true);
                          } else {
                            handleEntityClick('facility', facility.id, facility.name, 'scope3');
                          }
                        }}
                      >
                        <p className="text-xs text-purple-600 font-medium">Scope 3</p>
                        <p className="text-sm font-semibold text-text-primary">
                          {scope3Record?.base_year || '—'}
                        </p>
                      </div>
                    )}
                    
                    {/* Spacer */}
                    <div className="flex-1" />
                    
                    {/* Status Badge */}
                    <div className="flex-shrink-0">
                      {getStatusBadge(facilityStatus)}
                    </div>
                  </button>
                  
                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 py-4 bg-stone-50/50 border-t border-stone-100">
                      <div className={`grid gap-4 ${hasScope3Access ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-md'}`}>
                        {/* Scope 1 & 2 Section */}
                        <div className="bg-white rounded-lg border border-stone-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200">Scope 1 & 2</Badge>
                            {scope12Record ? (
                              <span className="font-semibold text-text-primary">{scope12Record.base_year}</span>
                            ) : (
                              getStatusBadge("missing")
                            )}
                          </div>
                          
                          {scope12Record ? (
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleViewHistory(scope12Record); }}>
                                <History className="w-3 h-3 mr-1" /> History
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope12'); handleEditEmissions(scope12Record); }}>
                                <Edit2 className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope12'); handleChangeYear(scope12Record); }}>
                                <CalendarClock className="w-3 h-3 mr-1" /> Change
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(scope12Record.id); }}>
                                <Trash2 className="w-3 h-3 mr-1" /> Delete
                              </Button>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handleEntityClick('facility', facility.id, facility.name, 'scope12'); }}>
                              <Plus className="w-3 h-3 mr-1" /> Set Up Base Year
                            </Button>
                          )}
                        </div>
                        
                        {/* Scope 3 Section */}
                        {hasScope3Access && (
                          <div className="bg-white rounded-lg border border-stone-200 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200">Scope 3</Badge>
                              {scope3Record ? (
                                <span className="font-semibold text-text-primary">{scope3Record.base_year}</span>
                              ) : (
                                getStatusBadge("missing")
                              )}
                            </div>
                            
                            {scope3Record ? (
                              <div className="flex flex-wrap gap-2">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleViewHistory(scope3Record); }}>
                                  <History className="w-3 h-3 mr-1" /> History
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope3'); handleEditEmissions(scope3Record); }}>
                                  <Edit2 className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedScopeGroup('scope3'); handleChangeYear(scope3Record); }}>
                                  <CalendarClock className="w-3 h-3 mr-1" /> Change
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(scope3Record.id); }}>
                                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                                </Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); handleEntityClick('facility', facility.id, facility.name, 'scope3'); }}>
                                <Plus className="w-3 h-3 mr-1" /> Set Up Base Year
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Setup Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={(open) => { if (!open) { setShowSetupDialog(false); resetState(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Editable</span>
              </div>
              
              {/* Phase 1 Enhancement: Add Category Button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddCategoryForm(!showAddCategoryForm)}
                  className="text-xs"
                >
                  <PlusCircle className="w-4 h-4 mr-1" />
                  Add Category
                </Button>
              </div>
              
              {/* Phase 1 Enhancement: Add Category Form */}
              {showAddCategoryForm && (
                <div className="p-4 border border-dashed border-primary/50 rounded-lg bg-primary/5 space-y-3">
                  <h4 className="text-sm font-medium text-primary">Add New Category</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Scope *</Label>
                      <Select 
                        value={newCategoryEntry.scope} 
                        onValueChange={(val) => {
                          setNewCategoryEntry({...newCategoryEntry, scope: val, category: '', subcategory: ''});
                          setScope3Activities([]);
                          setFuelNames([]);
                          setBiogenicIndirectSubcategories([]);
                          // Fetch biogenic fuels when Biogenic (Direct) is selected
                          if (val === 'Biogenic (Direct)') {
                            fetchBiogenicFuels();
                          }
                        }}
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue placeholder="Select Scope" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAllowedScopes(selectedScopeGroup).map(scope => (
                            <SelectItem key={scope} value={scope}>{scope}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">
                        {newCategoryEntry.scope === 'Biogenic (Direct)' ? 'Fuel Name *' : 'Category *'}
                      </Label>
                      <Select 
                        value={newCategoryEntry.category} 
                        onValueChange={(val) => {
                          setNewCategoryEntry({...newCategoryEntry, category: val, subcategory: ''});
                          // Fetch appropriate subcategories based on scope
                          if (newCategoryEntry.scope === 'scope3') {
                            fetchScope3Activities(val);
                          } else if (newCategoryEntry.scope === 'Biogenic (Indirect)') {
                            fetchBiogenicIndirectSubcategories(val);
                          } else if (['scope1', 'scope2'].includes(newCategoryEntry.scope)) {
                            fetchFuelNamesForCategory(val);
                          }
                        }}
                        disabled={!newCategoryEntry.scope}
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue placeholder={newCategoryEntry.scope === 'Biogenic (Direct)' ? "Select Fuel" : "Select Category"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {getCategoriesForScope(newCategoryEntry.scope).map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                          {getCategoriesForScope(newCategoryEntry.scope).length === 0 && newCategoryEntry.scope && (
                            <SelectItem value="Other">Other</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">
                        {newCategoryEntry.scope === 'scope3' ? 'Activity' : 
                         newCategoryEntry.scope === 'Biogenic (Indirect)' ? 'Activity *' :
                         ['scope1', 'scope2'].includes(newCategoryEntry.scope) ? 'Fuel Name' :
                         'Subcategory'}
                        {newCategoryEntry.scope === 'Biogenic (Direct)' && ' (Optional)'}
                      </Label>
                      {/* Dropdown for Scope 3 activities */}
                      {newCategoryEntry.scope === 'scope3' ? (
                        <Select 
                          value={newCategoryEntry.subcategory || undefined} 
                          onValueChange={(val) => setNewCategoryEntry({...newCategoryEntry, subcategory: val})}
                          disabled={!newCategoryEntry.category}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Select Activity" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {scope3Activities.map(activity => (
                              <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                            ))}
                            {scope3Activities.length === 0 && newCategoryEntry.category && (
                              <SelectItem value="__loading__" disabled>Loading activities...</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : newCategoryEntry.scope === 'Biogenic (Indirect)' ? (
                        /* Dropdown for Biogenic (Indirect) activities with subscope=biogenic */
                        <Select 
                          value={newCategoryEntry.subcategory || undefined} 
                          onValueChange={(val) => setNewCategoryEntry({...newCategoryEntry, subcategory: val})}
                          disabled={!newCategoryEntry.category}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Select Activity" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {biogenicIndirectSubcategories.map(activity => (
                              <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                            ))}
                            {biogenicIndirectSubcategories.length === 0 && newCategoryEntry.category && (
                              <SelectItem value="__loading__" disabled>Loading activities...</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : ['scope1', 'scope2'].includes(newCategoryEntry.scope) && fuelNames.length > 0 ? (
                        /* Dropdown for Scope 1&2 fuel names */
                        <Select 
                          value={newCategoryEntry.subcategory || undefined} 
                          onValueChange={(val) => setNewCategoryEntry({...newCategoryEntry, subcategory: val})}
                          disabled={!newCategoryEntry.category}
                        >
                          <SelectTrigger className="mt-1 h-8">
                            <SelectValue placeholder="Select Fuel" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {fuelNames.map(fuel => (
                              <SelectItem key={fuel} value={fuel}>{fuel}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        /* Text input for Biogenic (Direct) and others */
                        <Input
                          className="mt-1 h-8"
                          placeholder={newCategoryEntry.scope === 'Biogenic (Direct)' ? "Optional description" : "Optional"}
                          value={newCategoryEntry.subcategory}
                          onChange={(e) => setNewCategoryEntry({...newCategoryEntry, subcategory: e.target.value})}
                        />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">tCO₂e *</Label>
                      <Input
                        type="number"
                        step="any"
                        className="mt-1 h-8"
                        placeholder="0.0000"
                        value={newCategoryEntry.tco2e}
                        onChange={(e) => setNewCategoryEntry({...newCategoryEntry, tco2e: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                  {/* Warning if category doesn't exist in current emissions */}
                  {newCategoryEntry.scope && newCategoryEntry.category && 
                   !categoryExistsInCurrentEmissions(newCategoryEntry.scope, newCategoryEntry.category, newCategoryEntry.subcategory) && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      For current emissions these categories are not there
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      setShowAddCategoryForm(false);
                      setNewCategoryEntry({ scope: '', category: '', subcategory: '', tco2e: 0 });
                    }}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleAddManualCategory}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
              
              {emissionsData.length === 0 && !showAddCategoryForm ? (
                <div className="py-4 text-center text-text-muted">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                  <p>No emission categories found.</p>
                  <p className="text-xs mt-1">Click &quot;Add Category&quot; to manually add base year emissions.</p>
                </div>
              ) : emissionsData.length > 0 && (
                <div className="max-h-72 overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scope</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Subcategory</TableHead>
                        <TableHead className="text-right">tCO₂e</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emissionsData.map((entry, idx) => (
                        <TableRow key={idx} className={entry.isManuallyAdded ? 'bg-blue-50/50' : entry.isSink ? 'bg-green-50/50' : ''}>
                          <TableCell className="text-xs">
                            {entry.scope}
                            {entry.isManuallyAdded && (
                              <span className="ml-1 text-[10px] text-blue-600 bg-blue-100 px-1 rounded">Manual</span>
                            )}
                            {entry.isSink && (
                              <span className="ml-1 text-[10px] text-green-600 bg-green-100 px-1 rounded">Sink</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{entry.category}</TableCell>
                          <TableCell className="text-xs">{entry.subcategory || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="any"
                              min={entry.scope === 'Sinks' ? undefined : "0"}
                              className={`w-28 text-right h-8 ${entry.tco2e < 0 ? 'text-green-600' : ''}`}
                              value={entry.tco2e}
                              onChange={(e) => handleEmissionValueChange(idx, e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleRemoveCategory(idx)}
                              title="Remove category"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
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
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Edit Base Year Emissions - {selectedEntity?.name}
            </DialogTitle>
            <DialogDescription>
              Edit base year emissions data. Changes will be tracked in version history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            <div className="p-3 bg-primary/10 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Base Year: {selectedYear}</span>
              </div>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Editable</span>
            </div>
            
            {/* Phase 1 Enhancement: Add Category Button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddCategoryForm(!showAddCategoryForm)}
                className="text-xs"
              >
                <PlusCircle className="w-4 h-4 mr-1" />
                Add Category
              </Button>
            </div>
            
            {/* Phase 1 Enhancement: Add Category Form */}
            {showAddCategoryForm && (
              <div className="p-4 border border-dashed border-primary/50 rounded-lg bg-primary/5 space-y-3">
                <h4 className="text-sm font-medium text-primary">Add New Category</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Scope *</Label>
                    <Select 
                      value={newCategoryEntry.scope} 
                      onValueChange={(val) => {
                        setNewCategoryEntry({...newCategoryEntry, scope: val, category: '', subcategory: ''});
                        setScope3Activities([]);
                        setFuelNames([]);
                        setBiogenicIndirectSubcategories([]);
                        if (val === 'Biogenic (Direct)') {
                          fetchBiogenicFuels();
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1 h-8">
                        <SelectValue placeholder="Select Scope" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAllowedScopes(selectedScopeGroup).map(scope => (
                          <SelectItem key={scope} value={scope}>{scope}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      {newCategoryEntry.scope === 'Biogenic (Direct)' ? 'Fuel Name *' : 'Category *'}
                    </Label>
                    <Select 
                      value={newCategoryEntry.category} 
                      onValueChange={(val) => {
                        setNewCategoryEntry({...newCategoryEntry, category: val, subcategory: ''});
                        if (newCategoryEntry.scope === 'scope3') {
                          fetchScope3Activities(val);
                        } else if (newCategoryEntry.scope === 'Biogenic (Indirect)') {
                          fetchBiogenicIndirectSubcategories(val);
                        } else if (['scope1', 'scope2'].includes(newCategoryEntry.scope)) {
                          fetchFuelNamesForCategory(val);
                        }
                      }}
                      disabled={!newCategoryEntry.scope}
                    >
                      <SelectTrigger className="mt-1 h-8">
                        <SelectValue placeholder={newCategoryEntry.scope === 'Biogenic (Direct)' ? "Select Fuel" : "Select Category"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {getCategoriesForScope(newCategoryEntry.scope).map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                        {getCategoriesForScope(newCategoryEntry.scope).length === 0 && newCategoryEntry.scope && (
                          <SelectItem value="Other">Other</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      {newCategoryEntry.scope === 'scope3' ? 'Activity' : 
                       newCategoryEntry.scope === 'Biogenic (Indirect)' ? 'Activity *' :
                       ['scope1', 'scope2'].includes(newCategoryEntry.scope) ? 'Fuel Name' :
                       'Subcategory'}
                      {newCategoryEntry.scope === 'Biogenic (Direct)' && ' (Optional)'}
                    </Label>
                    {newCategoryEntry.scope === 'scope3' ? (
                      <Select 
                        value={newCategoryEntry.subcategory || undefined} 
                        onValueChange={(val) => setNewCategoryEntry({...newCategoryEntry, subcategory: val})}
                        disabled={!newCategoryEntry.category}
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue placeholder="Select Activity" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {scope3Activities.map(activity => (
                            <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                          ))}
                          {scope3Activities.length === 0 && newCategoryEntry.category && (
                            <SelectItem value="__loading__" disabled>Loading activities...</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : newCategoryEntry.scope === 'Biogenic (Indirect)' ? (
                      <Select 
                        value={newCategoryEntry.subcategory || undefined} 
                        onValueChange={(val) => setNewCategoryEntry({...newCategoryEntry, subcategory: val})}
                        disabled={!newCategoryEntry.category}
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue placeholder="Select Activity" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {biogenicIndirectSubcategories.map(activity => (
                            <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                          ))}
                          {biogenicIndirectSubcategories.length === 0 && newCategoryEntry.category && (
                            <SelectItem value="__loading__" disabled>Loading activities...</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : ['scope1', 'scope2'].includes(newCategoryEntry.scope) && fuelNames.length > 0 ? (
                      <Select 
                        value={newCategoryEntry.subcategory || undefined} 
                        onValueChange={(val) => setNewCategoryEntry({...newCategoryEntry, subcategory: val})}
                        disabled={!newCategoryEntry.category}
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue placeholder="Select Fuel" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {fuelNames.map(fuel => (
                            <SelectItem key={fuel} value={fuel}>{fuel}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="mt-1 h-8"
                        placeholder={newCategoryEntry.scope === 'Biogenic (Direct)' ? "Optional description" : "Optional"}
                        value={newCategoryEntry.subcategory}
                        onChange={(e) => setNewCategoryEntry({...newCategoryEntry, subcategory: e.target.value})}
                      />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">tCO₂e *</Label>
                    <Input
                      type="number"
                      step="any"
                      className="mt-1 h-8"
                      placeholder="0.0000"
                      value={newCategoryEntry.tco2e}
                      onChange={(e) => setNewCategoryEntry({...newCategoryEntry, tco2e: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>
                {newCategoryEntry.scope && newCategoryEntry.category && 
                 !categoryExistsInCurrentEmissions(newCategoryEntry.scope, newCategoryEntry.category, newCategoryEntry.subcategory) && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    For current emissions these categories are not there
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setShowAddCategoryForm(false);
                    setNewCategoryEntry({ scope: '', category: '', subcategory: '', tco2e: 0 });
                  }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddManualCategory}>
                    Add
                  </Button>
                </div>
              </div>
            )}
            
            {emissionsData.length === 0 && !showAddCategoryForm ? (
              <div className="py-4 text-center text-text-muted">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                <p>No emission data found.</p>
                <p className="text-xs mt-1">Click &quot;Add Category&quot; to manually add base year emissions.</p>
              </div>
            ) : emissionsData.length > 0 && (
              <div className="max-h-72 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Subcategory</TableHead>
                      <TableHead className="text-right">tCO₂e</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emissionsData.map((entry, idx) => (
                      <TableRow key={idx} className={entry.isManuallyAdded ? 'bg-blue-50/50' : entry.isSink ? 'bg-green-50/50' : ''}>
                        <TableCell className="text-xs">
                          {entry.scope}
                          {entry.isManuallyAdded && (
                            <span className="ml-1 text-[10px] text-blue-600 bg-blue-100 px-1 rounded">Manual</span>
                          )}
                          {entry.isSink && (
                            <span className="ml-1 text-[10px] text-green-600 bg-green-100 px-1 rounded">Sink</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{entry.category}</TableCell>
                        <TableCell className="text-xs">{entry.subcategory || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            min={entry.scope === 'Sinks' ? undefined : "0"}
                            className={`w-28 text-right h-8 ${entry.tco2e < 0 ? 'text-green-600' : ''}`}
                            value={entry.tco2e}
                            onChange={(e) => handleEmissionValueChange(idx, e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveCategory(idx)}
                            title="Remove category"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {/* Justification field - always editable in edit mode */}
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
            
            {/* Notes field - always editable in edit mode */}
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
            
          </div>

          {/* Pinned action footer — keeps Save/Cancel visible when content
              scrolls (facility view often has many categories). */}
          <div className="flex justify-end gap-3 pt-3 border-t">
            <Button variant="outline" onClick={() => { setShowEmissionsDialog(false); resetState(); }}>
              Cancel
            </Button>
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
              View base year emissions data. Click Edit to modify values.
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
                    <span className={`text-xs px-2 py-1 rounded ${
                      user?.role === 'user' && !viewRecord?.facility_id
                        ? 'text-stone-600 bg-stone-100'
                        : 'text-green-600 bg-green-50'
                    }`}>
                      {user?.role === 'user' && !viewRecord?.facility_id ? 'View Only' : 'Editable'}
                    </span>
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
              
              {/* Sinks section - show total sinks value in a single row (only for Scope 1&2 and only if sinks are in saved emissions_data) */}
              {(viewRecord.scope_group || 'scope12') === 'scope12' && (() => {
                // Check if sinks are included in the saved base year configuration
                const hasSinksInConfig = viewRecord.emissions_data?.some(e => 
                  e.scope?.toLowerCase() === 'sinks'
                );
                if (!hasSinksInConfig) return null;
                
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
                  {/* Hide Delete/Edit for users viewing organization-level records */}
                  {!(user?.role === 'user' && !viewRecord?.facility_id) && (
                    <>
                      <Button 
                        variant="outline" 
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => {
                          setShowViewDialog(false);
                          handleDeleteRecord(viewRecord.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                      <Button variant="outline" onClick={() => { setShowViewDialog(false); setViewRecord(null); }}>
                        Close
                      </Button>
                      <Button 
                        onClick={() => {
                          setShowViewDialog(false);
                          handleEditEmissions(viewRecord);
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-1" />
                        Edit Emissions
                      </Button>
                    </>
                  )}
                  {user?.role === 'user' && !viewRecord?.facility_id && (
                    <Button variant="outline" onClick={() => { setShowViewDialog(false); setViewRecord(null); }}>
                      Close
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Version {version.version}</span>
                            {version.change_type && (
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                version.change_type === 'base_year_changed' ? 'bg-blue-100 text-blue-700' :
                                version.change_type === 'deleted' ? 'bg-red-100 text-red-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {version.change_type === 'base_year_changed' ? 'Base Year Changed' :
                                 version.change_type === 'deleted' ? 'Deleted' : 'Updated'}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-text-muted">
                            {new Date(version.changed_at).toLocaleString()}
                          </span>
                        </div>
                        
                        {/* Changed by info */}
                        {(version.changed_by_name || version.changed_by_email) && (
                          <p className="text-xs text-text-muted mb-2">
                            by {version.changed_by_name || version.changed_by_email}
                          </p>
                        )}
                        
                        {/* Change summary */}
                        {version.change_summary && (
                          <p className="text-sm font-medium text-primary mb-2">{version.change_summary}</p>
                        )}
                        
                        {/* Change reason (for base year changes) */}
                        {version.change_reason && (
                          <div className="bg-amber-50 border border-amber-100 rounded p-2 mb-2">
                            <p className="text-xs text-amber-700"><span className="font-medium">Reason:</span> {version.change_reason}</p>
                          </div>
                        )}
                        
                        {/* Base year change info */}
                        {version.change_type === 'base_year_changed' && version.previous_base_year && version.new_base_year && (
                          <div className="text-xs bg-blue-50 rounded p-2 mb-2">
                            <span className="text-red-500 line-through">{version.previous_base_year}</span>
                            <span className="mx-2">→</span>
                            <span className="text-green-600 font-medium">{version.new_base_year}</span>
                          </div>
                        )}
                        
                        {/* Added categories */}
                        {version.added_categories && version.added_categories.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-green-600 mb-1">Added ({version.added_categories.length}):</p>
                            <div className="bg-green-50 rounded p-2 space-y-1">
                              {version.added_categories.map((cat, cIdx) => (
                                <div key={cIdx} className="text-xs flex items-center gap-2">
                                  <span className="text-green-600">+</span>
                                  <span>{cat.scope} / {cat.category}{cat.subcategory && ` / ${cat.subcategory}`}</span>
                                  <span className="text-green-600 font-medium">{(parseFloat(cat.tco2e) || 0).toFixed(4)} tCO₂e</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Deleted categories */}
                        {version.deleted_categories && version.deleted_categories.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-red-600 mb-1">Deleted ({version.deleted_categories.length}):</p>
                            <div className="bg-red-50 rounded p-2 space-y-1">
                              {version.deleted_categories.map((cat, cIdx) => (
                                <div key={cIdx} className="text-xs flex items-center gap-2">
                                  <span className="text-red-600">−</span>
                                  <span className="line-through">{cat.scope} / {cat.category}{cat.subcategory && ` / ${cat.subcategory}`}</span>
                                  <span className="text-red-500">{(parseFloat(cat.tco2e) || 0).toFixed(4)} tCO₂e</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Changed values */}
                        {version.changed_values && version.changed_values.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-amber-600 mb-1">Modified ({version.changed_values.length}):</p>
                            <div className="bg-amber-50 rounded p-2 space-y-1">
                              {version.changed_values.map((change, cIdx) => (
                                <div key={cIdx} className="text-xs flex items-center gap-2">
                                  <span className="min-w-[180px]">{change.scope} / {change.category}{change.subcategory && ` / ${change.subcategory}`}</span>
                                  <span className="text-red-500 line-through">{(parseFloat(change.previous_value) || 0).toFixed(4)}</span>
                                  <span className="text-text-muted">→</span>
                                  <span className="text-green-600 font-medium">{(parseFloat(change.new_value) || 0).toFixed(4)} tCO₂e</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Fallback: Show legacy format or simple summary */}
                        {!version.change_summary && !version.added_categories && !version.deleted_categories && !version.changed_values && (
                          <div className="text-xs text-text-muted">
                            {version.changes && version.changes.length > 0 ? (
                              <div className="bg-stone-50 rounded p-2 space-y-1">
                                {version.changes.map((change, cIdx) => (
                                  <div key={cIdx} className="flex items-center gap-2">
                                    <span className="font-medium min-w-[200px]">
                                      {change.scope} / {change.category}{change.subcategory && ` / ${change.subcategory}`}
                                    </span>
                                    <span className="text-red-500 line-through">{(parseFloat(change.previous_value) || 0).toFixed(4)}</span>
                                    <span>→</span>
                                    <span className="text-green-600 font-medium">{(parseFloat(change.new_value) || 0).toFixed(4)} tCO₂e</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                <p>Total entries: {version.emissions_data?.length || version.previous_emissions_data?.length || 0}</p>
                                <p>Total tCO₂e: {((version.emissions_data || version.previous_emissions_data)?.reduce((sum, e) => sum + (parseFloat(e.tco2e) || 0), 0) || 0).toFixed(2)}</p>
                              </>
                            )}
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
