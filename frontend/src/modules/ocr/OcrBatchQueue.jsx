import React from 'react';
import { CheckCircle2, Clock3, Loader2, StopCircle, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';

const statusIcon = {
  queued: Clock3,
  processing: Loader2,
  cancel_requested: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: StopCircle,
};

const statusTone = {
  queued: 'text-slate-500',
  processing: 'text-emerald-700',
  cancel_requested: 'text-amber-700',
  completed: 'text-emerald-700',
  failed: 'text-red-700',
  cancelled: 'text-amber-700',
};

export const OcrBatchQueue = ({ queue, onCancel, onCancelFile, canCancelProcessing, cancelling, cancellingFileIds = [] }) => {
  if (!queue?.length) return null;
  const canCancel = canCancelProcessing && queue.some((file) => ['queued', 'processing'].includes(file.status));
  return (
    <section className="border border-slate-200 bg-white" aria-label="Batch processing status" data-testid="ocr-batch-queue">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2" data-testid="ocr-batch-queue-heading">
        <span className="text-xs font-semibold uppercase text-slate-600" data-testid="ocr-batch-queue-title">Batch queue</span>
        {canCancel && onCancel ? <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={cancelling} data-testid="ocr-cancel-processing-button">{cancelling ? 'Cancelling' : 'Cancel processing'}</Button> : null}
      </div>
      <div className="divide-y divide-slate-100">
        {queue.map((file) => {
          const Icon = statusIcon[file.status] || Clock3;
          return (
            <div key={file.id} className="flex items-center gap-3 px-3 py-2.5" data-testid={`ocr-batch-file-${file.id}`}>
              <Icon className={`h-4 w-4 shrink-0 ${statusTone[file.status] || statusTone.queued} ${['processing', 'cancel_requested'].includes(file.status) ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800" data-testid={`ocr-batch-file-name-${file.id}`}>{file.filename}</span>
              <span className={`text-xs font-medium capitalize ${statusTone[file.status] || statusTone.queued}`} data-testid={`ocr-batch-file-status-${file.id}`}>{file.status === 'cancel_requested' ? 'cancelling' : file.status}</span>
              {onCancelFile && file.uploadId && ['queued', 'processing'].includes(file.status) && (
                <Button type="button" size="sm" variant="ghost" onClick={() => onCancelFile(file)} disabled={cancellingFileIds.includes(file.id)} className="h-7 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800" data-testid={`ocr-cancel-invoice-${file.id}-button`}>
                  {cancellingFileIds.includes(file.id) ? 'Cancelling' : 'Cancel'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};