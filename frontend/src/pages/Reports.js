import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { FileText, Download } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Reports() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const { getAuthHeader } = useAuth();

  useEffect(() => {
    fetchFacilities();
  }, []);

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      setFacilities(response.data);
    } catch (error) {
      toast.error('Failed to load facilities');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = async (facilityId, facilityName) => {
    setDownloadingId(facilityId);
    try {
      const response = await axios.get(`${API}/reports/facility/${facilityId}`, {
        headers: getAuthHeader(),
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `GHG_Report_${facilityName.replace(/\s+/g, '_')}.docx`);
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {facilities.map((facility) => (
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
              disabled={downloadingId === facility.id}
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
            <span>Comprehensive emissions summary (Scope 1 & 2)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Visual charts and graphs</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Detailed emission records by reporting period</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Historical tracking and trends</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}