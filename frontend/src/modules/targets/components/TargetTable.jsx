/**
 * TargetTable — list view of all org targets.
 */
import React from 'react';
import { format } from 'date-fns';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Edit, Trash2, Inbox } from 'lucide-react';
import { TARGET_MODES } from '../constants';

const modeLabel = (id) => TARGET_MODES.find((m) => m.value === id)?.label || id;

export default function TargetTable({
  rows,
  onEdit,
  onDelete,
  canManage,
  loading,
}) {
  if (loading) {
    return (
      <Card className="p-8 text-center text-text-muted" data-testid="targets-loading">
        Loading targets…
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden border-stone-200" data-testid="targets-table">
      <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-center gap-3 text-xs font-semibold text-stone-600 uppercase tracking-wider">
        <div className="flex-1 min-w-[200px]">Name</div>
        <div className="w-72">Target Type</div>
        <div className="w-44">Created By</div>
        <div className="w-32">Created</div>
        <div className="w-32">Last Updated</div>
        {canManage && <div className="w-28 text-right">Actions</div>}
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center" data-testid="targets-empty-state">
          <Inbox className="w-12 h-12 mx-auto text-stone-300 mb-2" />
          <p className="text-sm text-text-muted">No targets configured yet.</p>
          {canManage && (
            <p className="text-xs text-text-muted mt-1">Click <span className="font-medium">Add Target</span> to get started.</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          {rows.map((t) => (
            <div
              key={t.id}
              className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50 transition-colors"
              data-testid={`target-row-${t.id}`}
            >
              <div className="flex-1 min-w-[200px] text-sm font-medium text-text-primary truncate" title={t.name}>
                {t.name}
              </div>
              <div className="w-72 text-sm text-text-secondary truncate">
                {modeLabel(t.target_mode)}
              </div>
              <div className="w-44 text-sm text-text-secondary truncate" title={t.created_by_email}>
                {t.created_by_name || t.created_by_email || '—'}
              </div>
              <div className="w-32 text-xs text-text-secondary">
                {t.created_at ? format(new Date(t.created_at), 'd MMM yyyy') : '—'}
              </div>
              <div className="w-32 text-xs text-text-secondary">
                {t.updated_at ? format(new Date(t.updated_at), 'd MMM yyyy') : '—'}
              </div>
              {canManage && (
                <div className="w-28 flex items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => onEdit?.(t)}
                    title="Edit target"
                    data-testid={`target-edit-${t.id}`}
                  >
                    <Edit className="w-3.5 h-3.5 text-stone-600" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                    onClick={() => onDelete?.(t)}
                    title="Delete target"
                    data-testid={`target-delete-${t.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
