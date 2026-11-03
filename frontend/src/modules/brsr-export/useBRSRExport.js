/**
 * useBRSRExport Hook
 *
 * Generates framework reports (BRSR or GRI) on the backend and downloads them as PDF or Word.
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function saveBlob(data, filename, format) {
  const url = window.URL.createObjectURL(new Blob([data], { type: MIME[format] }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function useBRSRExport({ reportingPeriod, framework = 'brsr' }) {
  const { getAuthHeader } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const label = framework.toUpperCase();

  const exportReport = useCallback(async (format = 'pdf') => {
    if (!reportingPeriod) {
      toast.error('Please select a reporting period first');
      return;
    }
    setIsExporting(true);
    setProgress(`Generating ${label} Report...`);
    try {
      const response = await axios.post(
        `${API}/api/${framework}-report/generate/${encodeURIComponent(reportingPeriod)}`,
        null,
        { headers: getAuthHeader(), params: { format }, responseType: 'blob', timeout: 180000 },
      );
      const match = (response.headers['content-disposition'] || '').match(/filename="?([^"]+)"?/);
      saveBlob(response.data, match ? match[1] : `${label}_Report_${reportingPeriod.replace(/\s+/g, '_')}.${format}`, format);
      toast.success(`${label} Report downloaded as ${format === 'docx' ? 'Word' : 'PDF'}`);
    } catch (error) {
      console.error('Export failed:', error);
      let message = `Failed to generate ${label} report`;
      try {
        const body = error.response?.data instanceof Blob ? JSON.parse(await error.response.data.text()) : error.response?.data;
        message = body?.detail || message;
      } catch (parseError) { /* keep default message */ }
      toast.error(message);
    } finally {
      setIsExporting(false);
      setProgress('');
    }
  }, [reportingPeriod, getAuthHeader, framework, label]);

  return { exportReport, isExporting, progress };
}

export default useBRSRExport;
