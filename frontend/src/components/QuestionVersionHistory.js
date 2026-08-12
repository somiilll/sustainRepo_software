import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Clock, History, Loader2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { useAuth } from '../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
};

const formatDate = (timestamp) => timestamp ? new Date(timestamp).toLocaleString() : 'Timestamp unavailable';

const eventStyle = (eventType) => {
  if (eventType === 'APPROVED') return { label: 'Update Approved', icon: CheckCircle2, tone: 'text-green-700 bg-green-50 border-green-200' };
  if (eventType === 'REJECTED') return { label: 'Update Rejected', icon: XCircle, tone: 'text-red-700 bg-red-50 border-red-200' };
  if (eventType === 'SUBMITTED') return { label: 'Submitted for Approval', icon: Clock, tone: 'text-blue-700 bg-blue-50 border-blue-200' };
  return { label: eventType.replace(/_/g, ' '), icon: History, tone: 'text-stone-700 bg-stone-50 border-stone-200' };
};

export const QuestionVersionHistory = ({ open, onOpenChange, framework, questionKey, reportingYear }) => {
  const { getAuthHeader } = useAuth();
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !framework || !questionKey || !reportingYear) return;
    let active = true;
    const loadTimeline = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await axios.get(
          `${API}/esg-questionnaire/timeline/${encodeURIComponent(framework)}/${encodeURIComponent(questionKey)}/${encodeURIComponent(reportingYear)}`,
          { headers: getAuthHeader() },
        );
        if (active) setTimeline(response.data);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.detail || 'Unable to load this question timeline.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadTimeline();
    return () => { active = false; };
  }, [open, framework, questionKey, reportingYear, getAuthHeader]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="question-version-history-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="question-version-history-title">
            <History className="w-5 h-5 text-primary" /> Question Version History
          </DialogTitle>
          <p className="text-sm text-text-muted" data-testid="question-version-history-identity">
            {framework} · {reportingYear}
          </p>
        </DialogHeader>

        {loading && <div className="py-10 text-center text-text-muted" data-testid="question-version-history-loading"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading timeline…</div>}
        {error && <div className="py-6 text-red-700" data-testid="question-version-history-error">{error}</div>}
        {!loading && !error && timeline && (
          <div className="space-y-4" data-testid="question-version-history-content">
            {timeline.evidence_state === 'FOUND_PARTIAL' && (
              <div className="border border-amber-200 bg-amber-50 text-amber-800 text-sm p-3" data-testid="question-version-history-partial-warning">
                Some older, unscoped events were excluded to avoid mixing reporting years.
              </div>
            )}
            {timeline.events.length === 0 ? (
              <div className="py-8 text-center text-text-muted" data-testid="question-version-history-empty">No safely linked history is available for this question and reporting year.</div>
            ) : timeline.events.map((event, index) => {
              const style = eventStyle(event.event_type);
              const Icon = style.icon;
              return (
                <article key={`${event.source}-${event.timestamp}-${index}`} className="border border-stone-200 p-4" data-testid={`question-timeline-event-${index}`}>
                  <div className="flex items-start justify-between gap-3">
                    <Badge className={`border ${style.tone}`} data-testid={`question-timeline-event-type-${index}`}><Icon className="w-3 h-3 mr-1" />{style.label}</Badge>
                    <time className="text-xs text-text-muted" data-testid={`question-timeline-event-time-${index}`}>{formatDate(event.timestamp)}</time>
                  </div>
                  <div className="mt-3 text-sm text-text-secondary space-y-1">
                    {event.requester && <p>Requested by: <strong>{event.requester.name || event.requester.email}</strong></p>}
                    {event.approver && <p>{event.event_type === 'REJECTED' ? 'Rejected' : 'Approved'} by: <strong>{event.approver.name || event.approver.email}</strong></p>}
                    {event.rejection_reason && <p className="text-red-700">Reason: {event.rejection_reason}</p>}
                  </div>
                  {(event.submitted_value !== null && event.submitted_value !== undefined || event.final_value !== null && event.final_value !== undefined) && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                      <div className="border border-blue-100 bg-blue-50 p-2" data-testid={`question-timeline-submitted-value-${index}`}><span className="block text-xs text-text-muted">Submitted value</span><pre className="whitespace-pre-wrap break-words font-sans">{formatValue(event.submitted_value)}</pre></div>
                      <div className="border border-green-100 bg-green-50 p-2" data-testid={`question-timeline-final-value-${index}`}><span className="block text-xs text-text-muted">Final approved value</span><pre className="whitespace-pre-wrap break-words font-sans">{formatValue(event.final_value)}</pre></div>
                    </div>
                  )}
                  {event.approver_edited && <p className="mt-3 text-xs text-amber-700" data-testid={`question-timeline-approver-edit-${index}`}>Approver modified the submitted value before approval.</p>}
                </article>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};