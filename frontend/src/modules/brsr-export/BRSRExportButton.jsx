/**
 * BRSRExportButton Component
 *
 * Generates a framework report (BRSR or GRI) as PDF or Word (creates a new version) and lets admins view past versions.
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { FileText, FileType, Loader2, History, ChevronDown } from 'lucide-react';
import { useBRSRExport } from './useBRSRExport';
import { BRSRVersionsDialog } from './BRSRVersionsDialog';
import { useAuth } from '../../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

export function BRSRExportButton({ reportingPeriod, framework = 'brsr' }) {
  const { exportReport, isExporting, progress } = useBRSRExport({ reportingPeriod, framework });
  const { user, getAuthHeader } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const label = framework.toUpperCase();

  useEffect(() => {
    if (!isAdmin || !reportingPeriod || isExporting) return;
    axios.get(`${API}/api/${framework}-report/versions/${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() })
      .then((res) => setVersionCount((res.data.versions || []).length))
      .catch(() => setVersionCount(0));
  }, [isAdmin, reportingPeriod, isExporting, getAuthHeader, framework]);

  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-2 bg-[#1f7a4d] text-white hover:bg-[#186540]" disabled={isExporting || !reportingPeriod} data-testid={`${framework}-export-btn`}>
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {isExporting ? (progress || 'Generating...') : 'Generate Report'}
            {!isExporting && <ChevronDown className="w-4 h-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => exportReport('pdf')} data-testid={`${framework}-export-pdf`}>
            <FileText className="w-4 h-4 mr-2" /> PDF (.pdf)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportReport('docx')} data-testid={`${framework}-export-word`}>
            <FileType className="w-4 h-4 mr-2" /> Word (.docx)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isAdmin && versionCount > 0 && (
        <Button size="sm" className="gap-2 bg-stone-800 text-white hover:bg-stone-900" onClick={() => setVersionsOpen(true)} data-testid={`${framework}-export-versions`}>
          <History className="w-4 h-4" />
          View {label} Report Versions
        </Button>
      )}
      {isAdmin && <BRSRVersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} reportingPeriod={reportingPeriod} framework={framework} />}
    </div>
  );
}

export default BRSRExportButton;
