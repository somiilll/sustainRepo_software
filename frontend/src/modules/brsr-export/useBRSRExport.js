/**
 * useBRSRExport Hook
 * 
 * Handles fetching all BRSR data and generating the PDF report.
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { BRSRReportGenerator } from './BRSRReportGenerator';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export function useBRSRExport({ reportingPeriod, organization }) {
  const { getAuthHeader } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState('');

  const fetchSectionAData = async (headers) => {
    try {
      const res = await axios.get(
        `${API}/api/esg-questionnaire/responses/BRSR/section_a/${encodeURIComponent(reportingPeriod)}`,
        { headers }
      );
      return res.data.responses || {};
    } catch (error) {
      console.warn('Failed to fetch Section A data:', error);
      return {};
    }
  };

  const fetchSectionBData = async (headers) => {
    try {
      const [configsRes, responsesRes] = await Promise.all([
        axios.get(`${API}/api/esg-questionnaire/configs`, {
          params: { framework: 'BRSR', section: 'section_b' },
          headers
        }).catch(() => ({ data: { configs: [] } })),
        axios.get(
          `${API}/api/esg-questionnaire/responses/BRSR/section_b/${encodeURIComponent(reportingPeriod)}`,
          { headers }
        ).catch(() => ({ data: { responses: {} } }))
      ]);
      
      return {
        configs: configsRes.data.configs || [],
        responses: responsesRes.data.responses || {}
      };
    } catch (error) {
      console.warn('Failed to fetch Section B data:', error);
      return { configs: [], responses: {} };
    }
  };

  const fetchSectionCData = async (headers) => {
    try {
      const [configsRes, responsesRes] = await Promise.all([
        axios.get(`${API}/api/esg-questionnaire/configs`, {
          params: { framework: 'BRSR', section: 'section_c' },
          headers
        }).catch(() => ({ data: { configs: [] } })),
        axios.get(
          `${API}/api/esg-questionnaire/responses/BRSR/section_c/${encodeURIComponent(reportingPeriod)}`,
          { headers }
        ).catch(() => ({ data: { responses: {} } }))
      ]);
      
      return {
        configs: configsRes.data.configs || [],
        responses: responsesRes.data.responses || {}
      };
    } catch (error) {
      console.warn('Failed to fetch Section C data:', error);
      return { configs: [], responses: {} };
    }
  };

  const exportPDF = useCallback(async () => {
    if (!reportingPeriod) {
      toast.error('Please select a reporting period first');
      return;
    }

    setIsExporting(true);
    setProgress('Fetching data...');

    try {
      const headers = getAuthHeader();

      // Fetch all section data in parallel
      setProgress('Loading Section A...');
      const sectionAPromise = fetchSectionAData(headers);
      
      setProgress('Loading Section B...');
      const sectionBPromise = fetchSectionBData(headers);
      
      setProgress('Loading Section C...');
      const sectionCPromise = fetchSectionCData(headers);

      const [sectionAData, sectionBResult, sectionCResult] = await Promise.all([
        sectionAPromise,
        sectionBPromise,
        sectionCPromise
      ]);

      setProgress('Generating PDF...');

      // Create the report generator
      const generator = new BRSRReportGenerator({
        organization: organization || {},
        reportingPeriod,
        sectionAData,
        sectionBData: sectionBResult.responses,
        sectionBConfigs: sectionBResult.configs,
        sectionCData: sectionCResult.responses,
        sectionCConfigs: sectionCResult.configs,
      });

      // Generate and save
      await generator.generate();
      generator.save();

      toast.success('BRSR Report downloaded successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to generate BRSR report');
    } finally {
      setIsExporting(false);
      setProgress('');
    }
  }, [reportingPeriod, organization, getAuthHeader]);

  return {
    exportPDF,
    isExporting,
    progress
  };
}

export default useBRSRExport;
