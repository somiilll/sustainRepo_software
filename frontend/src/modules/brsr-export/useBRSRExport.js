/**
 * useBRSRExport Hook
 * 
 * Handles downloading BRSR reports from the backend.
 * The backend generates pixel-perfect PDFs using Playwright/Chromium.
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export function useBRSRExport({ reportingPeriod, organization }) {
  const { getAuthHeader } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState('');

  const exportPDF = useCallback(async () => {
    if (!reportingPeriod) {
      toast.error('Please select a reporting period first');
      return;
    }

    setIsExporting(true);
    setProgress('Generating BRSR Report...');

    try {
      const headers = getAuthHeader();

      // Call backend endpoint to generate PDF
      const response = await axios.get(
        `${API}/api/brsr-report/generate/${encodeURIComponent(reportingPeriod)}`,
        {
          headers,
          responseType: 'blob', // Important: expect binary data
          timeout: 120000, // 2 minute timeout for PDF generation
        }
      );

      // Create download link
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `BRSR_Report_${reportingPeriod.replace(/\s+/g, '_')}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('BRSR Report downloaded successfully');
    } catch (error) {
      console.error('Export failed:', error);
      const message = error.response?.data?.detail || 'Failed to generate BRSR report';
      toast.error(message);
    } finally {
      setIsExporting(false);
      setProgress('');
    }
  }, [reportingPeriod, getAuthHeader]);

  // Preview HTML (for debugging)
  const previewHTML = useCallback(async () => {
    if (!reportingPeriod) {
      toast.error('Please select a reporting period first');
      return;
    }

    try {
      const headers = getAuthHeader();
      const url = `${API}/api/brsr-report/preview/${encodeURIComponent(reportingPeriod)}`;
      
      // Open in new tab
      const response = await axios.get(url, { headers });
      const htmlContent = response.data;
      
      // Open HTML in new window
      const previewWindow = window.open('', '_blank');
      previewWindow.document.write(htmlContent);
      previewWindow.document.close();
    } catch (error) {
      console.error('Preview failed:', error);
      toast.error('Failed to generate preview');
    }
  }, [reportingPeriod, getAuthHeader]);

  return {
    exportPDF,
    previewHTML,
    isExporting,
    progress
  };
}

export default useBRSRExport;
