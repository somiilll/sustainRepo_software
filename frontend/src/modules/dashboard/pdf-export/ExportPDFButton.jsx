/**
 * ExportPDFButton - Button component for exporting ESG Dashboard to PDF
 */

import React from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useESGReportExport } from './useESGReportExport';
import { toast } from 'sonner';

export function ExportPDFButton({ 
  organization,
  dateRange,
  metrics,
  analytics,
  summary,
  filteredData,
  granularity,
  productionUnit,
  productionQty,
  className = '',
}) {
  const { generateReport, isGenerating, progress } = useESGReportExport();

  const handleExport = async () => {
    toast.info('Generating PDF report...', { id: 'pdf-export' });
    
    const result = await generateReport({
      organization,
      dateRange,
      metrics,
      analytics,
      summary,
      filteredData,
      granularity,
      productionUnit,
      productionQty,
    });

    if (result.success) {
      toast.success(`Report downloaded: ${result.filename}`, { id: 'pdf-export' });
    } else {
      toast.error(`Export failed: ${result.error}`, { id: 'pdf-export' });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isGenerating}
      className={`gap-2 ${className}`}
      data-testid="export-pdf-button"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Generating... {progress}%</span>
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          <span>Export PDF</span>
        </>
      )}
    </Button>
  );
}

export default ExportPDFButton;
