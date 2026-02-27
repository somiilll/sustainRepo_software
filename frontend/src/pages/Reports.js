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
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `GHG_Report_${facilityName.replace(/\s+/g, '_')}_${startPeriod}_to_${endPeriod}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
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
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Combined_GHG_Report_${startPeriod}_to_${endPeriod}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
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

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'GHG_Inventory_Report.docx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('GHG Inventory Report generated successfully!');
      setGhgDialogOpen(false);
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
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Reports</h1>
        <p className="text-text-secondary">Download comprehensive GHG emission reports</p>
      </div>

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