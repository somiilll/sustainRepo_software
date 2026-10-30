/**
 * BRSRExportButton Component
 *
 * Generates a BRSR report PDF (creates a new version) and lets admins view past versions.
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '../../components/ui/button';
import { FileText, Loader2, History } from 'lucide-react';
import { useBRSRExport } from './useBRSRExport';
import { BRSRVersionsDialog } from './BRSRVersionsDialog';
import { useAuth } from '../../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

export function BRSRExportButton({ reportingPeriod, organization }) {
  const { exportPDF, isExporting, progress } = useBRSRExport({ reportingPeriod, organization });
  const { user, getAuthHeader } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionCount, setVersionCount] = useState(0);

  useEffect(() => {
    if (!isAdmin || !reportingPeriod || isExporting) return;
    axios.get(`${API}/api/brsr-report/versions/${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() })
      .then((res) => setVersionCount((res.data.versions || []).length))
      .catch(() => setVersionCount(0));
  }, [isAdmin, reportingPeriod, isExporting, getAuthHeader]);

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" className="gap-2 bg-[#1f7a4d] text-white hover:bg-[#186540]" onClick={exportPDF} disabled={isExporting} data-testid="brsr-export-btn">
        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {isExporting ? (progress || 'Generating...') : 'Generate Report'}
      </Button>
      {isAdmin && versionCount > 0 && (
        <Button size="sm" className="gap-2 bg-stone-800 text-white hover:bg-stone-900" onClick={() => setVersionsOpen(true)} data-testid="brsr-export-versions">
          <History className="w-4 h-4" />
          View BRSR Report Versions
        </Button>
      )}
      {isAdmin && <BRSRVersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} reportingPeriod={reportingPeriod} />}
    </div>
  );
}

export default BRSRExportButton;
