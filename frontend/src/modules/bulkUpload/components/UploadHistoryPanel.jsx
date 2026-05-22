/**
 * UploadHistoryPanel — recent upload sessions list.
 */
import React from 'react';
import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { FileSpreadsheet } from 'lucide-react';

export default function UploadHistoryPanel({ sessions }) {
  if (!sessions || sessions.length === 0) return null;
  return (
    <Card className="p-4" data-testid="upload-history-panel">
      <h3 className="font-semibold mb-3">Recent Uploads</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between p-2 bg-stone-50 rounded text-sm"
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="font-medium">{session.filename || `Upload ${session.id?.slice(0, 8)}`}</span>
              <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                {session.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-text-muted">
              <span>{session.success_count || 0} valid / {session.total_rows || 0} total</span>
              <span>{session.total_emissions_tco2e?.toFixed(2) || 0} tCO2e</span>
              <span>{new Date(session.uploaded_at || session.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
