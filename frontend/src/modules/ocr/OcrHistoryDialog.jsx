import React from 'react';
import { History, Loader2, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';

const statusStyle = (status) => ({
  saved: 'bg-emerald-100 text-emerald-800',
  resolved: 'bg-teal-100 text-teal-800',
  rejected: 'bg-stone-200 text-stone-700',
  failed: 'bg-red-100 text-red-800',
  processing: 'bg-sky-100 text-sky-800',
  queued: 'bg-amber-100 text-amber-800',
  cleared: 'bg-slate-100 text-slate-700',
}[status] || 'bg-stone-100 text-stone-700');

const formatUploadedAt = (value) => (value ? new Date(value).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}) : 'Unknown time');

export const OcrHistoryDialog = ({ open, onOpenChange, history, loading, error }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl p-0" hideCloseButton data-testid="ocr-history-dialog">
      <DialogClose className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900" data-testid="ocr-history-close-button">
        <X className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Close history</span>
      </DialogClose>
      <DialogHeader className="border-b border-stone-200 px-6 py-5 pr-12">
        <DialogTitle className="flex items-center gap-2 text-emerald-950" data-testid="ocr-history-title"><History className="h-5 w-5" />OCR History</DialogTitle>
        <DialogDescription data-testid="ocr-history-description">Uploaded source-file activity for your organization.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto px-6 py-2" data-testid="ocr-history-list">
        {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-stone-600" data-testid="ocr-history-loading"><Loader2 className="h-4 w-4 animate-spin" />Loading history</div>}
        {!loading && error && <p className="py-8 text-sm text-red-700" role="alert" data-testid="ocr-history-error">{error}</p>}
        {!loading && !error && history.length === 0 && <p className="py-10 text-center text-sm text-stone-500" data-testid="ocr-history-empty">No uploaded files yet.</p>}
        {!loading && !error && history.map((entry) => <div key={entry.id} className="flex min-w-0 items-center gap-3 border-b border-stone-100 py-4" data-testid={`ocr-history-row-${entry.id}`}>
          <History className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-stone-900" data-testid={`ocr-history-file-${entry.id}`}>{entry.filename}</p>
            <p className="mt-1 text-xs text-stone-500" data-testid={`ocr-history-uploaded-by-${entry.id}`}>Uploaded by {entry.uploaded_by_name} · {formatUploadedAt(entry.uploaded_at)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle(entry.status)}`} data-testid={`ocr-history-status-${entry.id}`}>{entry.status}</span>
        </div>)}
      </div>
    </DialogContent>
  </Dialog>
);