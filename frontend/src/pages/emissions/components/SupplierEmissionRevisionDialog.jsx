import React from 'react';
import { History, Lock, PencilLine } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'Not submitted');

export default function SupplierEmissionRevisionDialog({ open, onOpenChange, history }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="supplier-emission-revision-history-dialog">
        <DialogHeader>
          <DialogTitle data-testid="supplier-emission-revision-history-title">Supplier emission revision history</DialogTitle>
        </DialogHeader>
        <div className="space-y-3" data-testid="supplier-emission-revision-history-list">
          {(history?.revisions || []).map((revision) => (
            <div className="border border-stone-200 p-4" key={revision.id} data-testid={`supplier-emission-revision-${revision.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {revision.is_current_revision ? <PencilLine className="h-4 w-4 text-emerald-700" /> : <Lock className="h-4 w-4 text-stone-500" />}
                  <span className="font-medium" data-testid={`supplier-emission-revision-label-${revision.id}`}>Revision {revision.revision_number}</span>
                </div>
                <Badge variant={revision.is_current_revision ? 'default' : 'secondary'} data-testid={`supplier-emission-revision-status-${revision.id}`}>
                  {revision.is_current_revision ? 'Current revision' : 'Historical revision'}
                </Badge>
              </div>
              <div className="mt-3 grid gap-1 text-sm text-stone-600 sm:grid-cols-2" data-testid={`supplier-emission-revision-details-${revision.id}`}>
                <span>{revision.scope} · {revision.category}</span>
                <span>{revision.reporting_period}</span>
                <span>{Number(revision.total_emissions || 0).toFixed(4)} tCO₂e</span>
                <span>{revision.status === 'submitted' ? `Submitted ${formatDate(revision.submitted_at)}` : `Reopened ${formatDate(revision.reopened_at || revision.created_at)}`}</span>
              </div>
            </div>
          ))}
          {!history?.revisions?.length && <p className="text-sm text-stone-500" data-testid="supplier-emission-revision-history-empty"><History className="mr-2 inline h-4 w-4" />No revisions are available.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}