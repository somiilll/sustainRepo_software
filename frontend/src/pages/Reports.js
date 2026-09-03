import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { MonthYearPicker } from '../components/ui/month-year-picker';
import { FileText, Download, Building2, Calendar, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import MISReportsFoundation from '../modules/mis-reports/MISReportsFoundation';
import { ModulePageHeader } from '../components/ModulePageHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to extract error message from API response
const getErrorMessage = (error, fallbackMessage = 'An error occurred') => {
  const errorDetail = error.response?.data?.detail;
  
  if (typeof errorDetail === 'string') {
    return errorDetail;
  } else if (Array.isArray(errorDetail)) {
    // Pydantic validation errors are arrays of {type, loc, msg, input, url}
    return errorDetail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
  } else if (errorDetail && typeof errorDetail === 'object') {
    return errorDetail.msg || errorDetail.message || JSON.stringify(errorDetail);
  }
  
  return fallbackMessage;
};

export default function Reports({ showMISFoundation = false }) {
  const [facilities, setFacilities] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startPeriod, setStartPeriod] = useState('');
  const [endPeriod, setEndPeriod] = useState('');
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [selectAll, setSelectAll] = useState(true);
  const { getAuthHeader, user } = useAuth();
  
  // GHG Inventory Report Dialog
  const [ghgDialogOpen, setGhgDialogOpen] = useState(false);
  const [ghgReportConfig, setGhgReportConfig] = useState({
    facility_ids: [],
    reporting_period_start: '',
    reporting_period_end: '',
    include_previous_years: false,
    output_format: 'docx',
    report_type: 'scope_1_2',  // 'scope_1_2' or 'scope_1_2_3'
    is_complete_organization: true  // Whether all org facilities are included
  });
  const [generatingGhg, setGeneratingGhg] = useState(false);
  
  // Confirmation dialog for all facilities selected
  const [showAllFacilitiesConfirm, setShowAllFacilitiesConfirm] = useState(false);

  // AI Report State
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiReportConfig, setAiReportConfig] = useState({
    facility_ids: [],
    reporting_period_start: '',
    reporting_period_end: ''
  });
  const [generatingAi, setGeneratingAi] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    fetchFacilities();
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      setOrganization(response.data);
    } catch (error) {
      console.error('Organization fetch error:', error);
    }
  };
  
  // Get enabled access (default to scope1_2 if null/undefined, empty array means no access)
  const enabledAccess = organization?.enabled_access;
  const hasScope12Access = enabledAccess === null || enabledAccess === undefined 
    ? true 
    : enabledAccess.includes('scope1_2') || enabledAccess.includes('scope1_2_3');
  
  // Check if organization has scope 3 access (for report type selection)
  const hasScope3Access = enabledAccess?.includes('scope1_2_3') || false;
  
  // Check if organization has GHG module enabled (hides GHG reports if disabled)
  const hasGhgEnabled = organization?.has_ghg !== false;

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      // Filter to only show active facilities
      const activeFacilities = response.data.filter(f => f.is_active !== false);
      setFacilities(activeFacilities);
      setSelectedFacilities(activeFacilities.map(f => f.id));
    } catch (error) {
      console.error('Reports facilities fetch error:', error);
      setFacilities([]);
      setSelectedFacilities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = async (facilityId, facilityName) => {
    if (!startPeriod || !endPeriod) {
      toast.error('Please select reporting period (start and end dates)');
      return;
    }

    if (new Date(startPeriod) > new Date(endPeriod)) {
      toast.error('Start period must be before end period');
      return;
    }

    setDownloadingId(facilityId);
    try {
      const response = await axios.get(
        `${API}/reports/facility/${facilityId}?start_period=${startPeriod}&end_period=${endPeriod}`,
        {
          headers: getAuthHeader()
        }
      );
      
      // Get download token and redirect to download URL
      const { download_token, filename } = response.data;
      const downloadUrl = `${API}/reports/download/${download_token}`;
      
      // Detect iframe and handle download accordingly
      const isInIframe = window.self !== window.top;
      if (isInIframe) {
        navigator.clipboard.writeText(downloadUrl).catch(() => {});
        prompt("If download doesn't start, open this URL manually:", downloadUrl);
      } else {
        window.location.href = downloadUrl;
        toast.success('Report download started');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to download report'));
      console.error(error);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAllReports = async () => {
    if (!startPeriod || !endPeriod) {
      toast.error('Please select reporting period (start and end dates)');
      return;
    }

    if (selectedFacilities.length === 0) {
      toast.error('Please select at least one facility');
      return;
    }

    setDownloadingId('combined');
    toast.info(`Generating combined report for ${selectedFacilities.length} facilities...`);
    
    try {
      const response = await axios.post(
        `${API}/reports/combined?start_period=${startPeriod}&end_period=${endPeriod}`,
        selectedFacilities,
        {
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Get download token and trigger download
      const { download_token, filename } = response.data;
      const downloadUrl = `${API}/reports/download/${download_token}`;
      window.location.href = downloadUrl;
      toast.success('Combined report download started');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to download combined report'));
      console.error(error);
    } finally {
      setDownloadingId(null);
    }
  };

  const toggleFacility = (facilityId) => {
    setSelectedFacilities(prev => 
      prev.includes(facilityId)
        ? prev.filter(id => id !== facilityId)
        : [...prev, facilityId]
    );
    setSelectAll(false);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedFacilities([]);
    } else {
      setSelectedFacilities(facilities.map(f => f.id));
    }
    setSelectAll(!selectAll);
  };

  // GHG Inventory Report functions
  const handleGhgFacilityToggle = (facilityId) => {
    setGhgReportConfig(prev => {
      const isSelected = prev.facility_ids.includes(facilityId);
      const newFacilityIds = isSelected
        ? prev.facility_ids.filter(id => id !== facilityId)
        : [...prev.facility_ids, facilityId];
      
      return {
        ...prev,
        facility_ids: newFacilityIds
      };
    });
  };

  const handleGhgSelectAll = () => {
    setGhgReportConfig(prev => {
      const allSelected = prev.facility_ids.length === facilities.length;
      return {
        ...prev,
        facility_ids: allSelected ? [] : facilities.map(f => f.id)
      };
    });
  };

  const handleGenerateGhgReport = async () => {
    if (ghgReportConfig.facility_ids.length === 0) {
      toast.error('Please select at least one facility to generate the report');
      return;
    }
    if (!ghgReportConfig.reporting_period_start) {
      toast.error('Please select a Start Period for the reporting period');
      return;
    }
    if (!ghgReportConfig.reporting_period_end) {
      toast.error('Please select an End Period for the reporting period');
      return;
    }

    // If all facilities are selected, show confirmation dialog
    const allFacilitiesSelected = ghgReportConfig.facility_ids.length === facilities.length && facilities.length > 0;
    if (allFacilitiesSelected) {
      setShowAllFacilitiesConfirm(true);
      return;
    }

    // Not all facilities selected - proceed with is_complete_organization = false
    await proceedWithReportGeneration(false);
  };

  const proceedWithReportGeneration = async (isCompleteOrg) => {
    setShowAllFacilitiesConfirm(false);
    setGeneratingGhg(true);
    
    // Close dialog first
    setGhgDialogOpen(false);
    toast.info('Generating report, please wait...');
    
    try {
      const response = await axios.post(
        `${API}/reports/ghg-inventory`,
        {
          ...ghgReportConfig,
          is_complete_organization: isCompleteOrg
        },
        {
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Get download token and trigger download
      const { download_token, filename } = response.data;
      const downloadUrl = `${API}/reports/download/${download_token}`;
      window.location.href = downloadUrl;
      toast.success('GHG Inventory Report download started!');
    } catch (error) {
      console.error('Error generating GHG report:', error);
      toast.error(getErrorMessage(error, 'Failed to generate report'));
    } finally {
      setGeneratingGhg(false);
    }
  };

  const resetGhgForm = () => {
    setGhgReportConfig({
      facility_ids: [],
      reporting_period_start: '',
      reporting_period_end: '',
      include_previous_years: false,
      output_format: 'docx',
      report_type: 'scope_1_2'
    });
  };

  const setFinancialYear = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    setGhgReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${year}-04`,
      reporting_period_end: `${year + 1}-03`
    }));
  };

  const setPreviousFinancialYear = () => {
    const now = new Date();
    const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const prevYear = currentFyStart - 1;
    setGhgReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${prevYear}-04`,
      reporting_period_end: `${prevYear + 1}-03`
    }));
  };

  const setPreviousCalendarYear = () => {
    const prevYear = new Date().getFullYear() - 1;
    setGhgReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${prevYear}-01`,
      reporting_period_end: `${prevYear}-12`
    }));
  };

  const setLast12Months = () => {
    const now = new Date();
    const lastYear = new Date(now);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    setGhgReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${lastYear.getFullYear()}-${String(lastYear.getMonth() + 1).padStart(2, '0')}`,
      reporting_period_end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }));
  };

  // AI Report Functions
  const handleAiFacilityToggle = (facilityId) => {
    setAiReportConfig(prev => ({
      ...prev,
      facility_ids: prev.facility_ids.includes(facilityId)
        ? prev.facility_ids.filter(id => id !== facilityId)
        : [...prev.facility_ids, facilityId]
    }));
  };

  const handleAiSelectAll = () => {
    setAiReportConfig(prev => ({
      ...prev,
      facility_ids: prev.facility_ids.length === facilities.length 
        ? [] 
        : facilities.map(f => f.id)
    }));
  };

  const resetAiForm = () => {
    setAiReportConfig({
      facility_ids: [],
      reporting_period_start: '',
      reporting_period_end: ''
    });
  };

  const setAiFinancialYear = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    setAiReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${year}-04`,
      reporting_period_end: `${year + 1}-03`
    }));
  };

  const setAiPreviousFinancialYear = () => {
    const now = new Date();
    const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const prevYear = currentFyStart - 1;
    setAiReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${prevYear}-04`,
      reporting_period_end: `${prevYear + 1}-03`
    }));
  };

  const setAiPreviousCalendarYear = () => {
    const prevYear = new Date().getFullYear() - 1;
    setAiReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${prevYear}-01`,
      reporting_period_end: `${prevYear}-12`
    }));
  };

  const setAiLast12Months = () => {
    const now = new Date();
    const lastYear = new Date(now);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    setAiReportConfig(prev => ({
      ...prev,
      reporting_period_start: `${lastYear.getFullYear()}-${String(lastYear.getMonth() + 1).padStart(2, '0')}`,
      reporting_period_end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }));
  };

  const handleGenerateAiReport = async () => {
    if (aiReportConfig.facility_ids.length === 0) {
      toast.error('Please select at least one facility');
      return;
    }
    if (!aiReportConfig.reporting_period_start || !aiReportConfig.reporting_period_end) {
      toast.error('Please select reporting period');
      return;
    }

    setGeneratingAi(true);
    
    try {
      const response = await axios.post(
        `${API}/reports/ai-summary`,
        aiReportConfig,
        {
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Download the PDF
      if (response.data.download_token) {
        const downloadUrl = `${API}/reports/download/${response.data.download_token}`;
        window.location.href = downloadUrl;
        toast.success('AI Summary PDF downloaded successfully!');
        setAiDialogOpen(false);
      }
    } catch (error) {
      console.error('Error generating AI report:', error);
      toast.error(getErrorMessage(error, 'Failed to generate AI summary'));
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleConfigureMISReport = (templateId) => {
    if (templateId === 'ghg_inventory') {
      resetGhgForm();
      setGhgDialogOpen(true);
    }
    if (templateId === 'ai_executive_summary') {
      resetAiForm();
      setAiDialogOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      {showMISFoundation ? (
        <MISReportsFoundation onConfigureReport={handleConfigureMISReport} />
      ) : (
        <ModulePageHeader title="Reports" icon={FileText} iconClassName="border-teal-200 bg-teal-50 text-teal-700" testId="reports" />
      )}

      {/* GHG Inventory Report Card - Only show if org has GHG module enabled */}
      {hasScope12Access && hasGhgEnabled && (
        <Card className={`${showMISFoundation ? 'hidden' : ''} p-6 border-2 border-green-200 rounded-xl bg-gradient-to-br from-green-50 to-white`}>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-xl">
              <FileText className="w-10 h-10 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-heading font-bold text-text-primary">GHG Inventory Report</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Available</span>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                Generate a comprehensive Greenhouse Gas Inventory Report following ISO 14064-1 standard. 
                Includes organization details, facility information, emissions inventory, and analysis.
                {hasScope3Access ? ' Supports Scope 1, 2, 3 & Biogenic emissions.' : ' Covers Scope 1, 2 & Biogenic emissions.'}
              </p>
              <Dialog open={ghgDialogOpen} onOpenChange={setGhgDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => { resetGhgForm(); setGhgDialogOpen(true); }}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="generate-ghg-inventory-btn"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Generate Report
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto !p-4 !gap-2">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-heading">Generate GHG Inventory Report</DialogTitle>
                  </DialogHeader>
                
                <div className="space-y-4">
                  {/* Report Type Selection - Only show if org has scope 3 access */}
                  {hasScope3Access && (
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Report Type *</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="report_type"
                            value="scope_1_2"
                            checked={ghgReportConfig.report_type === 'scope_1_2'}
                            onChange={(e) => setGhgReportConfig(prev => ({ ...prev, report_type: e.target.value }))}
                            className="text-green-600"
                          />
                          <span>Scope 1 & 2</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="report_type"
                            value="scope_1_2_3"
                            checked={ghgReportConfig.report_type === 'scope_1_2_3'}
                            onChange={(e) => setGhgReportConfig(prev => ({ ...prev, report_type: e.target.value }))}
                            className="text-green-600"
                          />
                          <span>Scope 1, 2 & 3</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Reporting Period */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-green-600" />
                      Reporting Period *
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="ghg_period_start">Start Period</Label>
                        <MonthYearPicker
                          id="ghg_period_start"
                          value={ghgReportConfig.reporting_period_start}
                          maxDate={ghgReportConfig.reporting_period_end || undefined}
                          disableFuture={true}
                          onChange={(val) => setGhgReportConfig(prev => ({ ...prev, reporting_period_start: val }))}
                          placeholder="Select start month"
                          className="bg-stone-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ghg_period_end">End Period</Label>
                        <MonthYearPicker
                          id="ghg_period_end"
                          value={ghgReportConfig.reporting_period_end}
                          minDate={ghgReportConfig.reporting_period_start || undefined}
                          disableFuture={true}
                          onChange={(val) => setGhgReportConfig(prev => ({ ...prev, reporting_period_end: val }))}
                          placeholder="Select end month"
                          className="bg-stone-50"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button type="button" variant="outline" size="sm" onClick={setPreviousFinancialYear}>
                        Previous FY
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={setPreviousCalendarYear}>
                        Previous CY
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={setLast12Months}>
                        Last 12 Months
                      </Button>
                    </div>
                  </div>

                  {/* Facility Selection */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-green-600" />
                        Select Facilities *
                      </Label>
                      <Button type="button" variant="outline" size="sm" onClick={handleGhgSelectAll}>
                        {ghgReportConfig.facility_ids.length === facilities.length ? 'Deselect All' : 'Select All'}
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto p-2 bg-stone-50 rounded-lg border">
                      {facilities.map((facility) => (
                        <div key={facility.id} className="space-y-2">
                          <label
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                              ghgReportConfig.facility_ids.includes(facility.id)
                                ? 'bg-green-100 border border-green-400'
                                : 'bg-white border border-stone-200 hover:border-green-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={ghgReportConfig.facility_ids.includes(facility.id)}
                              onChange={() => handleGhgFacilityToggle(facility.id)}
                              className="sr-only"
                            />
                            {ghgReportConfig.facility_ids.includes(facility.id) ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                            ) : (
                              <div className="w-5 h-5 border-2 border-stone-300 rounded flex-shrink-0" />
                            )}
                            <div className="flex-1">
                              <p className="font-medium text-text-primary">{facility.name}</p>
                              <p className="text-xs text-text-muted">{facility.city}, {facility.state}</p>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-text-muted">
                      {ghgReportConfig.facility_ids.length} of {facilities.length} facilities selected
                    </p>
                  </div>

                  {/* Additional Options */}
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ghgReportConfig.include_previous_years}
                        onChange={(e) => setGhgReportConfig(prev => ({ ...prev, include_previous_years: e.target.checked }))}
                        className="rounded text-green-600"
                      />
                      <div>
                        <p className="font-medium text-text-primary">Include Previous Years Data</p>
                        <p className="text-xs text-text-muted">Add historical emissions comparison section</p>
                      </div>
                    </label>
                  </div>

                  {/* Output Format Selection */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Output Format</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg cursor-pointer flex-1 border-2 transition-colors"
                        style={{ borderColor: ghgReportConfig.output_format === 'docx' ? '#16a34a' : 'transparent' }}>
                        <input
                          type="radio"
                          name="output_format"
                          value="docx"
                          checked={ghgReportConfig.output_format === 'docx'}
                          onChange={(e) => setGhgReportConfig(prev => ({ ...prev, output_format: e.target.value }))}
                          className="text-green-600"
                        />
                        <div>
                          <p className="font-medium text-text-primary">Word Document (.docx)</p>
                          <p className="text-xs text-text-muted">Editable format</p>
                        </div>
                      </label>
                      {/* PDF option temporarily hidden
                      <label className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg cursor-pointer flex-1 border-2 transition-colors"
                        style={{ borderColor: ghgReportConfig.output_format === 'pdf' ? '#16a34a' : 'transparent' }}>
                        <input
                          type="radio"
                          name="output_format"
                          value="pdf"
                          checked={ghgReportConfig.output_format === 'pdf'}
                          onChange={(e) => setGhgReportConfig(prev => ({ ...prev, output_format: e.target.value }))}
                          className="text-green-600"
                        />
                        <div>
                          <p className="font-medium text-text-primary">PDF Document (.pdf)</p>
                          <p className="text-xs text-text-muted">Fixed format for sharing</p>
                        </div>
                      </label>
                      */}
                    </div>
                  </div>

                  {/* Generate Button */}
                  <div className="flex gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => setGhgDialogOpen(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleGenerateGhgReport}
                      disabled={generatingGhg || ghgReportConfig.facility_ids.length === 0 || !ghgReportConfig.reporting_period_start || !ghgReportConfig.reporting_period_end}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      data-testid="download-ghg-report-btn"
                    >
                      {generatingGhg ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Generate & Download
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Card>
      )}

      {/* All Facilities Confirmation Dialog */}
      <Dialog open={showAllFacilitiesConfirm} onOpenChange={setShowAllFacilitiesConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading">Confirm Report Scope</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-text-secondary mb-4">
              Does this include all the facilities/plants in the organization?
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => proceedWithReportGeneration(false)}
              disabled={generatingGhg}
            >
              No
            </Button>
            <Button
              onClick={() => proceedWithReportGeneration(true)}
              disabled={generatingGhg}
              className="bg-green-600 hover:bg-green-700"
            >
              Yes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Report Card - Only show if org has GHG module enabled */}
      {hasScope12Access && hasGhgEnabled && (
        <Card className={`${showMISFoundation ? 'hidden' : ''} p-6 border-2 border-purple-200 rounded-xl bg-gradient-to-br from-purple-50 to-white`}>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Sparkles className="w-10 h-10 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-heading font-bold text-text-primary">AI Executive Summary</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">AI-Powered</span>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                Generate an AI-powered executive summary of your emissions data. Perfect for board presentations, 
                stakeholder reports, and quick insights.
              </p>
              <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => { resetAiForm(); setAiDialogOpen(true); }}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    data-testid="generate-ai-report-btn"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate AI Summary
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto !p-4 !gap-2">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-heading flex items-center gap-2">
                      <Sparkles className="w-6 h-6 text-purple-600" />
                      AI Executive Summary
                    </DialogTitle>
                  </DialogHeader>
                
                  <div className="space-y-4">
                    {/* Reporting Period */}
                    <div className="space-y-4">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-purple-600" />
                        Reporting Period *
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="ai_period_start">Start Period</Label>
                          <MonthYearPicker
                            id="ai_period_start"
                            value={aiReportConfig.reporting_period_start}
                            maxDate={aiReportConfig.reporting_period_end || undefined}
                            disableFuture={true}
                            onChange={(val) => setAiReportConfig(prev => ({ ...prev, reporting_period_start: val }))}
                            placeholder="Select start month"
                            className="bg-stone-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ai_period_end">End Period</Label>
                          <MonthYearPicker
                            id="ai_period_end"
                            value={aiReportConfig.reporting_period_end}
                            minDate={aiReportConfig.reporting_period_start || undefined}
                            disableFuture={true}
                            onChange={(val) => setAiReportConfig(prev => ({ ...prev, reporting_period_end: val }))}
                            placeholder="Select end month"
                            className="bg-stone-50"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button type="button" variant="outline" size="sm" onClick={setAiPreviousFinancialYear}>
                          Previous FY
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={setAiPreviousCalendarYear}>
                          Previous CY
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={setAiLast12Months}>
                          Last 12 Months
                        </Button>
                      </div>
                    </div>

                    {/* Facility Selection */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-purple-600" />
                          Select Facilities *
                        </Label>
                        <Button type="button" variant="outline" size="sm" onClick={handleAiSelectAll}>
                          {aiReportConfig.facility_ids.length === facilities.length ? 'Deselect All' : 'Select All'}
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-2 bg-stone-50 rounded-lg border">
                        {facilities.map((facility) => (
                          <label
                            key={facility.id}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                              aiReportConfig.facility_ids.includes(facility.id)
                                ? 'bg-purple-100 border border-purple-400'
                                : 'bg-white border border-stone-200 hover:border-purple-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={aiReportConfig.facility_ids.includes(facility.id)}
                              onChange={() => handleAiFacilityToggle(facility.id)}
                              className="sr-only"
                            />
                            {aiReportConfig.facility_ids.includes(facility.id) ? (
                              <CheckCircle2 className="w-5 h-5 text-purple-600" />
                            ) : (
                              <div className="w-5 h-5 border-2 border-stone-300 rounded" />
                            )}
                            <div>
                              <p className="font-medium text-text-primary">{facility.name}</p>
                              <p className="text-xs text-text-muted">{facility.city}, {facility.state}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <p className="text-sm text-text-muted">
                        {aiReportConfig.facility_ids.length} of {facilities.length} facilities selected
                      </p>
                    </div>

                    {/* Generate Button */}
                    <div className="flex flex-col gap-3 pt-4 border-t">
                      {generatingAi && (
                        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                          </svg>
                          Report generation typically takes about a minute. Please wait while the AI analyzes your data.
                        </p>
                      )}
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setAiDialogOpen(false)} className="flex-1">
                          Cancel
                        </Button>
                        <Button
                          onClick={handleGenerateAiReport}
                          disabled={generatingAi || aiReportConfig.facility_ids.length === 0 || !aiReportConfig.reporting_period_start || !aiReportConfig.reporting_period_end}
                          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                          data-testid="generate-ai-summary-btn"
                        >
                          {generatingAi ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Generating PDF...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 mr-2" />
                              Generate & Download PDF
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </Card>
      )}

      {!showMISFoundation && facilities.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No facilities available</h3>
          <p className="text-text-secondary mb-4">Add facilities first to generate reports</p>
        </div>
      )}

      {!showMISFoundation && (
        <Card className="p-6 border border-stone-200 rounded-xl bg-white">
          <h3 className="text-lg font-heading font-bold text-text-primary mb-3">Report Contents</h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Facility information and details</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Emissions summary for selected period (Scope 1, 2, Biogenic & Sinks)</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Visual charts and graphs showing emissions breakdown</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Year-wise emission data breakdown</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Detailed emission records table with all parameters</span></li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>Historical tracking and trend analysis</span></li>
          </ul>
        </Card>
      )}
    </div>
  );
}