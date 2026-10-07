import React from 'react';
import { CheckCircle2, CircleDot, FileText, MessageSquare, RotateCcw, XCircle } from 'lucide-react';

const dateTime = (value) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const answerText = (answer) => typeof answer === 'boolean' ? (answer ? 'Yes' : 'No') : answer === undefined || answer === null || answer === '' ? 'Not answered' : String(answer);

const eventDetails = (entry) => {
  if (entry.event === 'supplier_submission') return { label: `Supplier Response (v${entry.supplier_revision || 1})`, date: entry.submitted_at, Icon: CheckCircle2, color: 'text-emerald-600', detail: 'Supplier submitted this response.' };
  if (entry.event === 'supplier_clarification_resubmitted') return { label: `Supplier Revision (v${entry.supplier_revision || 2})`, date: entry.replied_at, Icon: RotateCcw, color: 'text-sky-600', detail: entry.supplier_reply || 'Supplier updated the response or evidence.' };
  if (entry.needs_resubmission) return { label: 'Reviewer Feedback', date: entry.reviewed_at, Icon: MessageSquare, color: 'text-amber-500', detail: entry.reviewer_note || 'Clarification requested.' };
  if (entry.status === 'accepted') return { label: 'Response Accepted', date: entry.reviewed_at, Icon: CheckCircle2, color: 'text-emerald-600', detail: entry.reviewer_note || 'Response accepted by reviewer.' };
  return { label: 'Response Rejected', date: entry.reviewed_at, Icon: XCircle, color: 'text-rose-600', detail: entry.reviewer_note || `Reviewer score: ${entry.reviewer_score ?? 0}` };
};

export const ResponseAnswerHistory = ({ history, questionId }) => <aside className="border-t border-stone-200 bg-[#fbfcfb] xl:border-l xl:border-t-0" data-testid={`response-review-history-${questionId}`}>
  <div className="border-b border-stone-200 bg-white px-5 py-4"><h2 className="text-sm font-bold text-stone-950" data-testid={`response-review-history-title-${questionId}`}>Answer Details &amp; History</h2><p className="mt-1 text-xs text-stone-500">Response history</p></div>
  <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-5 py-5" data-testid={`response-review-history-scroll-${questionId}`}>
    {history?.length ? <ol className="space-y-5">{history.map((entry, index) => {
      const event = eventDetails(entry); const { Icon } = event;
      return <li key={`${entry.event || entry.status}-${entry.reviewed_at || entry.submitted_at || entry.replied_at}-${index}`} className="relative pl-8" data-testid={`response-review-history-entry-${questionId}-${index}`}>
        {index < history.length - 1 && <span className="absolute left-[7px] top-5 h-[calc(100%+0.75rem)] w-px bg-stone-200" />}
        <span className={`absolute left-0 top-0.5 ${event.color}`}><Icon className="h-4 w-4 fill-current" /></span>
        <p className="text-sm font-semibold text-stone-950">{event.label}</p><p className="mt-0.5 text-xs text-stone-500">{dateTime(event.date)}</p>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-stone-700" data-testid={`response-review-history-detail-${questionId}-${index}`}>{event.detail}</p>
        {entry.reviewer_name && <p className="mt-2 text-xs font-medium text-stone-600" data-testid={`response-review-history-reviewer-${questionId}-${index}`}>Reviewed by {entry.reviewer_name}</p>}
        {entry.supplier_answer_snapshot !== undefined && <p className="mt-2 text-xs text-stone-600" data-testid={`response-review-history-answer-${questionId}-${index}`}><span className="font-semibold">Answer:</span> {answerText(entry.supplier_answer_snapshot)}</p>}
        {entry.evidence_snapshot?.length > 0 && <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-600" data-testid={`response-review-history-evidence-${questionId}-${index}`}><FileText className="h-3.5 w-3.5" />Evidence attached</p>}
      </li>;
    })}</ol> : <div className="flex min-h-40 flex-col items-center justify-center text-center"><CircleDot className="h-5 w-5 text-stone-300" /><p className="mt-2 text-xs text-stone-500" data-testid={`response-review-history-empty-${questionId}`}>History appears after the first submission.</p></div>}
  </div>
</aside>;
