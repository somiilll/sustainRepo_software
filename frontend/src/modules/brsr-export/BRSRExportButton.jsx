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
import { Download, FileSpreadsheet, FileText, Loader2, ChevronDown } from 'lucide-react';
import { useBRSRExport } from './useBRSRExport';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export function BRSRExportButton({ reportingPeriod, organization }) {
  const { getAuthHeader } = useAuth();
  const [isExportingMappings, setIsExportingMappings] = useState(false);
  const { exportPDF, isExporting, progress } = useBRSRExport({
    reportingPeriod,
    organization
  });

  const exportMappings = async () => {
    setIsExportingMappings(true);
    try {
      const response = await axios.get(`${API}/api/brsr-report/kpi-mappings.xlsx`, {
        headers: getAuthHeader(),
        params: { generated_at: Date.now() },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'kpi_definitions_brsr_mappings_updated.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('KPI mapping workbook downloaded');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to download KPI mapping workbook');
    } finally {
      setIsExportingMappings(false);
    }
  };

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
        <DropdownMenuItem onClick={exportMappings} disabled={isExportingMappings} className="gap-2 cursor-pointer" data-testid="brsr-export-kpi-mappings">
          {isExportingMappings ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-700" />}
          KPI definitions & BRSR mappings
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
