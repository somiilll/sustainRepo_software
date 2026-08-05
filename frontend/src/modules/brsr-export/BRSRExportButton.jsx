/**
 * BRSRExportButton Component
 * 
 * Download button for generating BRSR reports in PDF format.
 */

import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Download, FileText, Loader2, ChevronDown } from 'lucide-react';
import { useBRSRExport } from './useBRSRExport';

export function BRSRExportButton({ reportingPeriod, organization }) {
  const { exportPDF, isExporting, progress } = useBRSRExport({
    reportingPeriod,
    organization
  });

  if (isExporting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {progress || 'Generating...'}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="brsr-export-btn">
          <Download className="w-4 h-4" />
          Download
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportPDF} className="gap-2 cursor-pointer" data-testid="brsr-export-pdf">
          <FileText className="w-4 h-4 text-red-600" />
          Download as PDF
        </DropdownMenuItem>
        {/* Word export can be added later */}
        {/* <DropdownMenuItem onClick={exportWord} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-blue-600" />
          Download as Word
        </DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default BRSRExportButton;
