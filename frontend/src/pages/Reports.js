import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { FileText, Download, Filter, Building2, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Reports() {
  const [facilities, setFacilities] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
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
    output_format: 'docx'
  });
  const [generatingGhg, setGeneratingGhg] = useState(false);

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
    : enabledAccess.includes('scope1_2');

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
      const { download_token } = response.data;
      
      // Open direct download URL in new tab (bypasses iframe sandbox)
      window.open(`${API}/reports/download/${download_token}`, '_blank');
      
      toast.success('Report download started');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to download report');
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
      
      // Get download token and redirect to download URL
      const { download_token } = response.data;
      
      // Open direct download URL in new tab (bypasses iframe sandbox)
      window.open(`${API}/reports/download/${download_token}`, '_blank');
      
      toast.success('Combined report download started');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to download combined report');
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
    setGhgReportConfig(prev => ({
      ...prev,
      facility_ids: prev.facility_ids.includes(facilityId)
        ? prev.facility_ids.filter(id => id !== facilityId)
        : [...prev.facility_ids, facilityId]
    }));
  };

  const handleGhgSelectAll = () => {
    setGhgReportConfig(prev => ({
      ...prev,
      facility_ids: prev.facility_ids.length === facilities.length 
        ? [] 
        : facilities.map(f => f.id)
    }));
  };

  const handleGenerateGhgReport = async () => {
    if (ghgReportConfig.facility_ids.length === 0) {
      toast.error('Please select at least one facility');
      return;
    }
    if (!ghgReportConfig.reporting_period_start || !ghgReportConfig.reporting_period_end) {
      toast.error('Please select reporting period');
      return;
    }

    setGeneratingGhg(true);
    
    // Close dialog first
    setGhgDialogOpen(false);
    toast.info('Generating report, please wait...');
    
    try {
      const response = await axios.post(
        `${API}/reports/ghg-inventory`,
        ghgReportConfig,
        {
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Get download token and redirect to download URL
      const { download_token } = response.data;
      
      // Open direct download URL in new tab (bypasses iframe sandbox)
      window.open(`${API}/reports/download/${download_token}`, '_blank');
      
      toast.success('GHG Inventory Report download started!');
    } catch (error) {
      console.error('Error generating GHG report:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate report');
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
      output_format: 'docx'
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Reports</h1>
        <p className="text-text-secondary">Download comprehensive GHG emission reports</p>
      </div>

      {/* GHG Inventory Report Card - Scope 1 & 2 */}
      {hasScope12Access && (
        <Card className="p-6 border-2 border-green-200 rounded-xl bg-gradient-to-br from-green-50 to-white">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-xl">
              <FileText className="w-10 h-10 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-heading font-bold text-text-primary">GHG Inventory Report (Scope 1 & 2)</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Available</span>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                Generate a comprehensive Greenhouse Gas Inventory Report following ISO 14064-1 standard. 
                Includes organization details, facility information, emissions inventory, and analysis.
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
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-heading">Generate GHG Inventory Report (Scope 1 & 2)</DialogTitle>
                  </DialogHeader>
                
                <div className="space-y-6 py-4">
                  {/* Reporting Period */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-green-600" />
                      Reporting Period *
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="ghg_period_start">Start Period</Label>
                        <Input
                          id="ghg_period_start"
                          type="month"
                          value={ghgReportConfig.reporting_period_start}
                          max={ghgReportConfig.reporting_period_end || ''}
                          onChange={(e) => setGhgReportConfig(prev => ({ ...prev, reporting_period_start: e.target.value }))}
                          className="bg-stone-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ghg_period_end">End Period</Label>
                        <Input
                          id="ghg_period_end"
                          type="month"
                          value={ghgReportConfig.reporting_period_end}
                          min={ghgReportConfig.reporting_period_start || ''}
                          onChange={(e) => setGhgReportConfig(prev => ({ ...prev, reporting_period_end: e.target.value }))}
                          className="bg-stone-50"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={setFinancialYear}>
                        Current FY
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
                    
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-2 bg-stone-50 rounded-lg border">
                      {facilities.map((facility) => (
                        <label
                          key={facility.id}
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
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
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

      {/* Future Report Cards - Coming Soon */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Scope 1, 2 & 3 Report */}
        <Card className="p-4 border border-stone-200 rounded-xl bg-stone-50 opacity-70">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-stone-200 rounded-lg">
              <FileText className="w-6 h-6 text-stone-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-heading font-bold text-text-primary text-sm">Scope 1, 2 & 3 Report</h4>
                <span className="text-xs px-2 py-0.5 rounded bg-stone-200 text-stone-600">Coming Soon</span>
              </div>
              <p className="text-xs text-text-muted">Complete value chain emissions report including all 15 Scope 3 categories.</p>
            </div>
          </div>
        </Card>

        {/* Scope 3 Only Report */}
        <Card className="p-4 border border-stone-200 rounded-xl bg-stone-50 opacity-70">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-stone-200 rounded-lg">
              <FileText className="w-6 h-6 text-stone-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-heading font-bold text-text-primary text-sm">Scope 3 Only Report</h4>
                <span className="text-xs px-2 py-0.5 rounded bg-stone-200 text-stone-600">Coming Soon</span>
              </div>
              <p className="text-xs text-text-muted">Focused report on indirect value chain emissions.</p>
            </div>
          </div>
        </Card>

        {/* CBAM Report */}
        <Card className="p-4 border border-stone-200 rounded-xl bg-stone-50 opacity-70">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-stone-200 rounded-lg">
              <FileText className="w-6 h-6 text-stone-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-heading font-bold text-text-primary text-sm">CBAM Report</h4>
                <span className="text-xs px-2 py-0.5 rounded bg-stone-200 text-stone-600">Coming Soon</span>
              </div>
              <p className="text-xs text-text-muted">Carbon Border Adjustment Mechanism compliance report.</p>
            </div>
          </div>
        </Card>
      </div>

      {facilities.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No facilities available</h3>
          <p className="text-text-secondary mb-4">Add facilities first to generate reports</p>
        </div>
      )}

      <Card className="p-6 border border-stone-200 rounded-xl bg-white">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-3">Report Contents</h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Facility information and details</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Emissions summary for selected period (Scope 1, 2, Biogenic & Sinks)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Visual charts and graphs showing emissions breakdown</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Year-wise emission data breakdown</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Detailed emission records table with all parameters</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Historical tracking and trend analysis</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}