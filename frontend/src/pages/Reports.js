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
    description_of_change: '',
    include_previous_years: false
  });
  const [generatingGhg, setGeneratingGhg] = useState(false);

  useEffect(() => {
    fetchFacilities();
  }, []);

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
          headers: getAuthHeader(),
          responseType: 'blob'
        }
      );
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const fileName = `GHG_Report_${facilityName.replace(/\s+/g, '_')}_${startPeriod}_to_${endPeriod}.docx`;
      const url = window.URL.createObjectURL(blob);
      
      // Try multiple download methods
      const newWindow = window.open(url, '_blank');
      
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      toast.success('Report downloaded successfully');
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
          },
          responseType: 'blob'
        }
      );
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const fileName = `Combined_GHG_Report_${startPeriod}_to_${endPeriod}.docx`;
      const url = window.URL.createObjectURL(blob);
      
      // Try multiple download methods
      const newWindow = window.open(url, '_blank');
      
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      toast.success('Combined report downloaded successfully');
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
    
    // Close dialog first to avoid interference with download
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
          },
          responseType: 'blob'
        }
      );
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const fileName = `GHG_Inventory_Report_${ghgReportConfig.reporting_period_start}_to_${ghgReportConfig.reporting_period_end}.docx`;
      const url = window.URL.createObjectURL(blob);
      
      // Try multiple download methods
      // Method 1: window.open (forces browser to handle the file)
      const newWindow = window.open(url, '_blank');
      
      // Method 2: If popup blocked, use link click as fallback
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      toast.success('GHG Inventory Report downloaded successfully!');
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
      description_of_change: '',
      include_previous_years: false
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
      {/* Hidden download link */}
      <a 
        ref={downloadLinkRef} 
        style={{ display: 'none' }} 
        aria-hidden="true"
      />
      
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Reports</h1>
        <p className="text-text-secondary">Download comprehensive GHG emission reports</p>
      </div>

      {/* GHG Inventory Report Card */}
      <Card className="p-6 border-2 border-green-200 rounded-xl bg-gradient-to-br from-green-50 to-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <FileText className="w-10 h-10 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-heading font-bold text-text-primary mb-1">GHG Inventory Report</h3>
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
                  Generate GHG Inventory Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-heading">Generate GHG Inventory Report</DialogTitle>
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
                    <Label className="text-base font-semibold">Additional Options</Label>
                    
                    <div className="space-y-2">
                      <Label htmlFor="ghg_description">Description of Change (for revision tracking)</Label>
                      <Input
                        id="ghg_description"
                        value={ghgReportConfig.description_of_change}
                        onChange={(e) => setGhgReportConfig(prev => ({ ...prev, description_of_change: e.target.value }))}
                        placeholder="e.g., Initial Report, Q2 Update, Annual Review"
                        className="bg-stone-50"
                      />
                    </div>

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

      <Card className="p-6 border border-stone-200 rounded-xl bg-white">
        <div className="flex items-center gap-3 mb-4">
          <Filter className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-heading font-bold text-text-primary">Report Configuration</h3>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-period">Start Period *</Label>
              <Input
                id="start-period"
                type="month"
                value={startPeriod}
                onChange={(e) => setStartPeriod(e.target.value)}
                className="bg-stone-50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-period">End Period *</Label>
              <Input
                id="end-period"
                type="month"
                value={endPeriod}
                onChange={(e) => setEndPeriod(e.target.value)}
                className="bg-stone-50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select Facilities to Include</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
                className="h-8"
              >
                {selectAll ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-lg p-3 bg-stone-50">
              <div className="space-y-2">
                {facilities.map((facility) => (
                  <label
                    key={facility.id}
                    className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFacilities.includes(facility.id)}
                      onChange={() => toggleFacility(facility.id)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">{facility.name}</p>
                      <p className="text-xs text-text-muted">{facility.address}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-text-muted">
              {selectedFacilities.length} of {facilities.length} facilities selected
            </p>
          </div>

          {selectedFacilities.length > 0 && (
            <Button
              onClick={handleDownloadAllReports}
              disabled={!startPeriod || !endPeriod || downloadingId === 'combined'}
              className="w-full bg-secondary hover:bg-secondary/90 text-white rounded-full"
              data-testid="download-combined-report-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              {downloadingId === 'combined' ? 'Generating Report...' : `Download Report (${selectedFacilities.length} facilities)`}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {facilities.filter(f => selectedFacilities.includes(f.id)).map((facility) => (
          <Card key={facility.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`report-card-${facility.id}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-heading font-bold text-text-primary mb-2">{facility.name}</h3>
            <p className="text-sm text-text-muted mb-4">{facility.address}</p>
            {facility.sector && (
              <div className="inline-block px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full mb-4">
                {facility.sector}
              </div>
            )}
            <Button
              onClick={() => handleDownloadReport(facility.id, facility.name)}
              disabled={downloadingId === facility.id || !startPeriod || !endPeriod}
              className="w-full bg-primary hover:bg-primary/90 text-white rounded-full transition-all active:scale-95"
              data-testid={`download-report-${facility.id}`}
            >
              {downloadingId === facility.id ? (
                'Generating...'
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download Report
                </>
              )}
            </Button>
          </Card>
        ))}
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
            <span>Emissions summary for selected period (Scope 1, 2 & Biogenic)</span>
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