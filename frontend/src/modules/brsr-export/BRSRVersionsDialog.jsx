import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { useDateFormatter } from '../../hooks/useDateFormatter';

const API = process.env.REACT_APP_BACKEND_URL;

export function BRSRVersionsDialog({ open, onOpenChange, reportingPeriod }) {
  const { getAuthHeader } = useAuth();
  const { formatDateTime } = useDateFormatter();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    if (!open || !reportingPeriod) return;
    setLoading(true);
    axios.get(`${API}/api/brsr-report/versions/${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() })
      .then((res) => setVersions(res.data.versions || []))
      .catch((error) => toast.error(error.response?.data?.detail || 'Failed to load report versions'))
      .finally(() => setLoading(false));
  }, [open, reportingPeriod, getAuthHeader]);

  const download = useCallback(async (version) => {
    setDownloading(version.version);
    try {
      const res = await axios.get(`${API}/api/brsr-report/versions/${encodeURIComponent(reportingPeriod)}/${version.version}/download`, { headers: getAuthHeader(), responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = version.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download this version');
    } finally {
      setDownloading(null);
    }
  }, [reportingPeriod, getAuthHeader]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="brsr-versions-dialog">
        <DialogHeader><DialogTitle>BRSR report versions - {reportingPeriod}</DialogTitle></DialogHeader>
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto my-8" /> : versions.length === 0 ? (
          <p className="text-sm text-stone-500 py-6 text-center" data-testid="brsr-versions-empty">No report has been downloaded for this period yet.</p>
        ) : (
          <table className="w-full text-sm" data-testid="brsr-versions-table">
            <thead><tr className="text-left text-stone-500 border-b"><th className="py-2">Version</th><th>Downloaded</th><th>By</th><th /></tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b" data-testid={`brsr-version-row-${v.version}`}>
                  <td className="py-2 font-semibold">v{v.version}</td>
                  <td>{formatDateTime(v.created_at)}</td>
                  <td>{v.created_by?.name || v.created_by?.email || '-'}</td>
                  <td className="text-right">
                    <Button size="sm" variant="outline" onClick={() => download(v)} disabled={downloading === v.version} data-testid={`brsr-version-download-${v.version}`}>
                      {downloading === v.version ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
