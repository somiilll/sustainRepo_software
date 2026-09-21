import React from 'react';
import { History, Loader2, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';

const statusStyle = (status) => ({
  Saved: 'bg-emerald-100 text-emerald-800',
  'Partially Saved': 'bg-teal-100 text-teal-800',
  'Rejected All': 'bg-stone-200 text-stone-700',
  Error: 'bg-red-100 text-red-800',
  Processing: 'bg-sky-100 text-sky-800',
  'Event Cancelled': 'bg-slate-100 text-slate-700',
  'Pending Review': 'bg-amber-100 text-amber-800',
  Rejected: 'bg-stone-200 text-stone-700',
}[status] || 'bg-stone-100 text-stone-700');

const formatUploadedAt = (value) => (value ? new Date(value).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}) : 'Unknown time');

export const OcrHistoryDialog = ({ open, onOpenChange, history, loading, error }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-6xl p-0" hideCloseButton data-testid="ocr-history-dialog">
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
        {!loading && !error && history.map((entry) => <section key={entry.id} className="border-b border-stone-100 py-4" data-testid={`ocr-history-row-${entry.id}`}>
          <div className="flex min-w-0 items-center gap-3">
            <History className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900" data-testid={`ocr-history-file-${entry.id}`}>{entry.filename}</p>
              <p className="mt-1 text-xs text-stone-500" data-testid={`ocr-history-uploaded-by-${entry.id}`}>Uploaded by {entry.uploaded_by_name} · {formatUploadedAt(entry.uploaded_at)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(entry.status)}`} data-testid={`ocr-history-status-${entry.id}`}>{entry.status}</span>
          </div>
          {entry.status !== 'Event Cancelled' && <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200" data-testid={`ocr-history-details-${entry.id}`}>
            {entry.rows?.length ? <table className="w-full min-w-[780px] text-left text-xs" data-testid={`ocr-history-details-table-${entry.id}`}>
              <thead className="bg-stone-50 text-stone-500"><tr><th className="px-3 py-2 font-semibold">Item extracted</th><th className="px-3 py-2 font-semibold">Scope</th><th className="px-3 py-2 font-semibold">Category</th><th className="px-3 py-2 font-semibold">Subcategory</th><th className="px-3 py-2 font-semibold">Reporting period</th><th className="px-3 py-2 font-semibold">Outcome</th></tr></thead>
              <tbody>{entry.rows.map((row, index) => <tr key={row.id || `${entry.id}-${index}`} className="border-t border-stone-100 text-stone-700" data-testid={`ocr-history-item-${entry.id}-${index}`}><td className="max-w-[20rem] truncate px-3 py-2 font-medium text-stone-900">{row.item_description || '—'}</td><td className="px-3 py-2">{row.scope || '—'}</td><td className="px-3 py-2">{row.category || '—'}</td><td className="px-3 py-2">{row.subcategory || '—'}</td><td className="px-3 py-2">{row.reporting_period || '—'}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 font-semibold ${statusStyle(row.status)}`}>{row.status}</span></td></tr>)}</tbody>
            </table> : <p className="px-3 py-4 text-xs text-stone-500" data-testid={`ocr-history-no-details-${entry.id}`}>No extracted rows are retained for this older file.</p>}
          </div>}
        </section>)}
      </div>
    </DialogContent>
  </Dialog>
);