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
import { Download, FileText, Loader2, ChevronDown, History } from 'lucide-react';
import { useBRSRExport } from './useBRSRExport';
import { BRSRVersionsDialog } from './BRSRVersionsDialog';
import { useAuth } from '../../contexts/AuthContext';

export function BRSRExportButton({ reportingPeriod, organization }) {
  const { exportPDF, isExporting, progress } = useBRSRExport({
    reportingPeriod,
    organization
  });
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [versionsOpen, setVersionsOpen] = useState(false);

  if (isExporting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {progress || 'Generating...'}
      </Button>
    );
  }

  return (
    <>
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
        {isAdmin && (
          <DropdownMenuItem onClick={() => setVersionsOpen(true)} className="gap-2 cursor-pointer" data-testid="brsr-export-versions">
            <History className="w-4 h-4 text-stone-600" />
            Report versions
          </DropdownMenuItem>
        )}
        {/* Word export can be added later */}
        {/* <DropdownMenuItem onClick={exportWord} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-blue-600" />
          Download as Word
        </DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
    {isAdmin && <BRSRVersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} reportingPeriod={reportingPeriod} />}
    </>
  );
}

export default BRSRExportButton;
