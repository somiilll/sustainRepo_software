import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { useDateFormatter } from '../../hooks/useDateFormatter';
import { saveBlob } from './useBRSRExport';

const API = process.env.REACT_APP_BACKEND_URL;
const FORMATS = [{ key: 'pdf', label: 'PDF' }, { key: 'docx', label: 'Word' }];

export function BRSRVersionsDialog({ open, onOpenChange, reportingPeriod, framework = 'brsr' }) {
  const { getAuthHeader } = useAuth();
  const { formatDateTime } = useDateFormatter();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const label = framework.toUpperCase();

  useEffect(() => {
    if (!open || !reportingPeriod) return;
    setLoading(true);
    axios.get(`${API}/api/${framework}-report/versions/${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() })
      .then((res) => setVersions(res.data.versions || []))
      .catch((error) => toast.error(error.response?.data?.detail || 'Failed to load report versions'))
      .finally(() => setLoading(false));
  }, [open, reportingPeriod, getAuthHeader, framework]);

  const download = useCallback(async (version, format) => {
    setDownloading(`${version.version}-${format}`);
    try {
      const res = await axios.get(`${API}/api/${framework}-report/versions/${encodeURIComponent(reportingPeriod)}/${version.version}/download`, {
        headers: getAuthHeader(), params: { format }, responseType: 'blob',
      });
      saveBlob(res.data, version.filenames?.[format] || version.filename, format);
    } catch (error) {
      toast.error('Failed to download this version');
    } finally {
      setDownloading(null);
    }
  }, [reportingPeriod, getAuthHeader, framework]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid={`${framework}-versions-dialog`}>
        <DialogHeader><DialogTitle>{label} report versions - {reportingPeriod}</DialogTitle></DialogHeader>
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto my-8" /> : versions.length === 0 ? (
          <p className="text-sm text-stone-500 py-6 text-center" data-testid={`${framework}-versions-empty`}>No report has been generated for this period yet.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm" data-testid={`${framework}-versions-table`}>
              <thead><tr className="text-left text-stone-500 border-b"><th className="py-2">Version</th><th>Generated</th><th>By</th><th className="text-right">Download</th></tr></thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b" data-testid={`${framework}-version-row-${v.version}`}>
                    <td className="py-2 font-semibold">v{v.version}</td>
                    <td>{formatDateTime(v.created_at)}</td>
                    <td>{v.created_by?.name || v.created_by?.email || '-'}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-2">
                        {FORMATS.filter((f) => (v.formats || ['pdf']).includes(f.key)).map((f) => (
                          <Button key={f.key} size="sm" variant="outline" className="gap-1" onClick={() => download(v, f.key)}
                            disabled={downloading === `${v.version}-${f.key}`} data-testid={`${framework}-version-download-${v.version}-${f.key}`}>
                            {downloading === `${v.version}-${f.key}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {f.label}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
