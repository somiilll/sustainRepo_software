import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
import { Building, Building2, CalendarClock, Check, X, Loader2, History, Plus, Edit2, Trash2, AlertTriangle, Info } from 'lucide-react';

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
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showChangeYearDialog, setShowChangeYearDialog] = useState(false);
  
  // Setup flow states
  const [selectedEntity, setSelectedEntity] = useState(null); // { type: 'organization' | 'facility', id, name }
  const [oldestYearInfo, setOldestYearInfo] = useState(null);
  const [setupStep, setSetupStep] = useState('prompt'); // 'prompt', 'select_year', 'enter_emissions'
  const [selectedYear, setSelectedYear] = useState('');
  const [useOldestYear, setUseOldestYear] = useState(null);
  
  // Emissions entry states
  const [emissionCombinations, setEmissionCombinations] = useState([]);
  const [emissionsData, setEmissionsData] = useState([]);
  const [savingEmissions, setSavingEmissions] = useState(false);
  
  // History view state
  const [historyRecord, setHistoryRecord] = useState(null);
  
  // Change year states
  const [changeYearRecord, setChangeYearRecord] = useState(null);
  const [newBaseYear, setNewBaseYear] = useState('');
  const [changingYear, setChangingYear] = useState(false);

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

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
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
      // Show existing record for editing
      setEmissionsData(existingRecord.emissions_data || []);
      setSelectedYear(existingRecord.base_year);
      setShowEmissionsDialog(true);
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
    await fetchEmissionCombinations(yearNum);
    setSetupStep('enter_emissions');
  };

  const fetchEmissionCombinations = async (year = null) => {
    try {
      let url = `${API}/base-year-emissions/emission-combinations/${selectedEntity.type}/${selectedEntity.id}`;
      if (year) {
        url += `?year=${year}`;
      }
      
      const response = await axios.get(url, { headers: getAuthHeader() });
      
      const combinations = response.data.combinations || [];
      setEmissionCombinations(combinations);
      
      // Use the values from the API response (will have actual tCO2e if year was specified)
      setEmissionsData(combinations.map(c => ({
        scope: c.scope,
        category: c.category,
        subcategory: c.subcategory || '',
        tco2e: c.tco2e || 0  // Use actual emissions if available
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
      
      const payload = {
        organization_id: selectedEntity.type === 'organization' ? selectedEntity.id : organization.id,
        facility_id: selectedEntity.type === 'facility' ? selectedEntity.id : null,
        base_year: selectedYear,
        base_year_type: oldestYearInfo?.reporting_year_type || organization?.reporting_year_type || 'calendar_year',
        is_oldest_year: useOldestYear === true,
        emissions_data: emissionsData
      };
      
      if (existingRecord) {
        // Update existing record
        await axios.put(`${API}/base-year-emissions/${existingRecord.id}`, {
          emissions_data: emissionsData,
          base_year: selectedYear
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

  const handleViewHistory = (record) => {
    setHistoryRecord(record);
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

  const handleChangeYear = (record) => {
    setChangeYearRecord(record);
    setNewBaseYear(record.base_year);
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
  };

  const getEntityRecord = (entityType, entityId) => {
    return baseYearRecords.find(r => 
      entityType === 'organization' 
        ? (r.organization_id === entityId && !r.facility_id)
        : r.facility_id === entityId
    );
  };

  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    const isFinancialYear = organization?.reporting_year_type === 'financial_year';
    
    for (let y = currentYear; y >= currentYear - 20; y--) {
      if (isFinancialYear) {
        years.push({ value: `FY ${y}-${y + 1}`, label: `FY ${y}-${y + 1}` });
      } else {
        years.push({ value: String(y), label: String(y) });
      }
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
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChangeYear(getEntityRecord('organization', organization.id));
                      }}
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Change Year
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRecord(getEntityRecord('organization', organization.id).id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
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
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRecord(record.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
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
                    {generateYearOptions().map(opt => (
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
                <Button className="flex-1" onClick={handleYearSelected}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step: Enter Emissions */}
          {setupStep === 'enter_emissions' && (
            <div className="space-y-4">
              <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Base Year: {selectedYear}</span>
              </div>
              
              {emissionsData.length === 0 ? (
                <div className="py-4 text-center text-text-muted">
                  No emission categories found
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
                      {emissionsData.map((entry, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{entry.scope}</TableCell>
                          <TableCell className="text-xs">{entry.category}</TableCell>
                          <TableCell className="text-xs">{entry.subcategory || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              className="w-28 text-right h-8"
                              value={entry.tco2e}
                              onChange={(e) => handleEmissionValueChange(idx, e.target.value)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setSetupStep('select_year')}>
                  Back
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleSaveBaseYear}
                  disabled={savingEmissions}
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
              <Edit2 className="w-5 h-5" />
              Edit Base Year Emissions - {selectedEntity?.name}
            </DialogTitle>
            <DialogDescription>
              Update the base year emissions data. Changes will be tracked in version history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Base Year: {selectedYear}</span>
            </div>
            
            {emissionsData.length === 0 ? (
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
                    {emissionsData.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{entry.scope}</TableCell>
                        <TableCell className="text-xs">{entry.category}</TableCell>
                        <TableCell className="text-xs">{entry.subcategory || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="w-28 text-right h-8"
                            value={entry.tco2e}
                            onChange={(e) => handleEmissionValueChange(idx, e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowEmissionsDialog(false); resetState(); }}>
                Cancel
              </Button>
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
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Version History
            </DialogTitle>
            <DialogDescription>
              View all changes made to this base year emissions record
            </DialogDescription>
          </DialogHeader>

          {historyRecord && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-50 rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Current Version:</span> {historyRecord.version}
                </p>
                <p className="text-sm text-text-muted">
                  <span className="font-medium">Base Year:</span> {historyRecord.base_year}
                </p>
              </div>

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
                                  {change.previous_value?.toFixed(4)} tCO₂e
                                </span>
                                <span className="text-text-muted">→</span>
                                <span className="text-green-600 font-medium">
                                  {change.new_value?.toFixed(4)} tCO₂e
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-text-muted">
                          <p>Total entries: {version.emissions_data?.length || 0}</p>
                          <p>Total tCO₂e: {version.emissions_data?.reduce((sum, e) => sum + (e.tco2e || 0), 0).toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-text-muted">
                  No previous versions found
                </div>
              )}
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
                    {generateYearOptions().map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">
                  <strong>Note:</strong> Changing the base year will keep your existing emissions data entries. 
                  If you want to recalculate emissions based on the new year's data, you can edit the emissions values after changing the year.
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
