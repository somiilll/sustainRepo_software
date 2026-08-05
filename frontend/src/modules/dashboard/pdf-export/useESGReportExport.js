/**
 * useESGReportExport - Hook for generating ESG Dashboard PDF reports
 */

import { useState, useCallback } from 'react';
import { ESGReportGenerator } from './ESGReportGenerator';

export function useESGReportExport() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const generateReport = useCallback(async (options) => {
    setIsGenerating(true);
    setProgress(0);
    setError(null);

    try {
      setProgress(5);
      
      // Create generator instance
      const generator = new ESGReportGenerator({
        organization: options.organization,
        dateRange: options.dateRange,
        metrics: options.metrics,
        analytics: options.analytics,
        summary: options.summary,
        filteredData: options.filteredData,
        granularity: options.granularity,
        productionUnit: options.productionUnit,
        productionQty: options.productionQty,
      });

      setProgress(10);

      // Generate the PDF with timeout protection
      const generatePromise = generator.generate();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF generation timeout - took too long')), 60000)
      );
      
      await Promise.race([generatePromise, timeoutPromise]);

      setProgress(90);

      // Generate filename
      const orgName = options.organization?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'ESG';
      const date = new Date().toISOString().split('T')[0];
      const filename = `${orgName}_ESG_Report_${date}.pdf`;

      // Save the PDF
      generator.save(filename);

      setProgress(100);
      
      return { success: true, filename };
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError(err.message || 'Failed to generate report');
      return { success: false, error: err.message };
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    generateReport,
    isGenerating,
    progress,
    error,
  };
}

export default useESGReportExport;
