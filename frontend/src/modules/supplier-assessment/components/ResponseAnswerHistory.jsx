import React from 'react';
import { CheckCircle2, CircleDot, FileText, MessageSquare, RotateCcw, X, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';

const dateTime = (value) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const answerText = (answer) => typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : answer === undefined || answer === null || answer === '' ? 'Not answered' : String(answer);

const eventDetails = (entry) => {
  if (entry.event === 'supplier_submission') return { label: `Supplier Response (v${entry.supplier_revision || 1})`, date: entry.submitted_at, Icon: CheckCircle2, node: 'bg-emerald-500', card: 'border-emerald-100 bg-emerald-50/60', detail: 'Supplier submitted this response.' };
  if (entry.event === 'supplier_clarification_resubmitted') return { label: `Supplier Revision (v${entry.supplier_revision || 2})`, date: entry.replied_at, Icon: RotateCcw, node: 'bg-blue-500', card: 'border-blue-100 bg-blue-50/60', detail: entry.supplier_reply ? `Reply to reviewer: ${entry.supplier_reply}` : 'Supplier resubmitted the response or evidence without a written reply.' };
  if (entry.needs_resubmission) return { label: 'Reviewer Feedback', date: entry.reviewed_at, Icon: MessageSquare, node: 'bg-amber-500', card: 'border-amber-100 bg-amber-50/65', detail: entry.reviewer_note || 'Clarification requested.' };
  if (entry.status === 'accepted') return { label: 'Response Accepted', date: entry.reviewed_at, Icon: CheckCircle2, node: 'bg-emerald-600', card: 'border-emerald-100 bg-emerald-50/60', detail: entry.reviewer_note || 'Response accepted by reviewer.' };
  return { label: 'Response Rejected', date: entry.reviewed_at, Icon: XCircle, node: 'bg-rose-500', card: 'border-rose-100 bg-rose-50/60', detail: entry.reviewer_note || `Reviewer score: ${entry.reviewer_score ?? 0}` };
};

export const ResponseAnswerHistory = ({ history, questionId, onClose }) => {
  return <section className="flex h-full min-w-0 flex-col overflow-hidden bg-white" data-testid={`response-review-history-${questionId}`}>
  <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-5 py-4 text-white"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-sm font-bold text-white" data-testid={`response-review-history-title-${questionId}`}>Answer Details &amp; History</h2><span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-200" data-testid={`response-review-history-count-${questionId}`}>{history?.length || 0}</span></div><Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 border border-white/20 text-white hover:bg-white/15 hover:text-white" aria-label="Close answer details and history" title="Close history" onClick={onClose} data-testid="response-review-history-close-button"><X className="h-4 w-4" /></Button></div></div>
  <div className="flex-1 overflow-y-auto bg-slate-50/60 px-4 py-5" data-testid={`response-review-history-scroll-${questionId}`}>
    {history?.length ? <ol>{history.map((entry, index) => {
      const event = eventDetails(entry); const { Icon } = event;
      return <li key={`${entry.event || entry.status}-${entry.reviewed_at || entry.submitted_at || entry.replied_at}-${index}`} className="relative pb-5 pl-9 last:pb-0" data-testid={`response-review-history-entry-${questionId}-${index}`}>
        {index < history.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-0.25rem)] w-0.5 bg-slate-200" />}
        <span className={`absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full text-white shadow-sm ring-4 ring-white ${event.node}`}><Icon className="h-3.5 w-3.5" /></span>
        <div className={`rounded-md border p-3 ${event.card}`}><p className="text-sm font-bold text-slate-950">{event.label}</p><p className="mt-0.5 text-xs font-medium text-slate-500">{dateTime(event.date)}</p><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-700" data-testid={`response-review-history-detail-${questionId}-${index}`}>{event.detail}</p>{entry.reviewer_name && <p className="mt-2 text-xs font-semibold text-slate-600" data-testid={`response-review-history-reviewer-${questionId}-${index}`}>Reviewed by {entry.reviewer_name}</p>}{entry.supplier_answer_snapshot !== undefined && <div className="mt-3 border-t border-slate-200/80 pt-2 text-xs text-slate-600" data-testid={`response-review-history-answer-${questionId}-${index}`}><span className="font-bold text-slate-800">Answer:</span> {answerText(entry.supplier_answer_snapshot)}</div>}{entry.evidence_snapshot?.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-600" data-testid={`response-review-history-evidence-${questionId}-${index}`}><FileText className="h-3.5 w-3.5 text-rose-500" />{entry.evidence_snapshot.length} evidence file{entry.evidence_snapshot.length === 1 ? '' : 's'}</p>}</div>
      </li>;
    })}</ol> : <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-center"><span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><CircleDot className="h-5 w-5 text-slate-400" /></span><p className="mt-3 text-xs text-slate-500" data-testid={`response-review-history-empty-${questionId}`}>History appears after the first submission.</p></div>}
  </div>
</section>;
};