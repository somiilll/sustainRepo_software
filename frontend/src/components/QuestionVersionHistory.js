import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Clock, History, Loader2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { useAuth } from '../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Known abbreviation mappings for BRSR/GRI keys
const ABBREVIATIONS = {
  bod: 'BoD', kmp: 'KMP', fy: 'FY', pct: '%', csr: 'CSR', esg: 'ESG',
  ghg: 'GHG', co2: 'CO2', co2e: 'CO2e', ngrbc: 'NGRBC', sdg: 'SDG',
  r_d: 'R&D', capex: 'CapEx', rd: 'R&D', coi: 'CoI', kmps: 'KMPs',
};

const humanizeKey = (key) => {
  if (!key || typeof key !== 'string') return String(key ?? '');
  return key
    .split('_')
    .map((word) => ABBREVIATIONS[word.toLowerCase()] || (word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
};

// Detect if a value is a "tabular" nested object: {row: {col: val}, ...}
const isTabularObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.values(value);
  if (entries.length === 0) return false;
  // All children must be plain objects (not arrays)
  if (!entries.every((v) => v && typeof v === 'object' && !Array.isArray(v))) return false;
  // Collect all inner keys – they should mostly overlap
  const keySets = entries.map((v) => new Set(Object.keys(v)));
  const union = new Set(keySets.flatMap((s) => [...s]));
  const avgOverlap = keySets.reduce((sum, s) => sum + [...union].filter((k) => s.has(k)).length, 0) / keySets.length;
  return avgOverlap / union.size > 0.5; // >50% key overlap → tabular
};

// Render a tabular value as an HTML table
const TableRenderer = ({ value }) => {
  const rowKeys = Object.keys(value);
  const allColKeys = [...new Set(rowKeys.flatMap((rk) => Object.keys(value[rk])))];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-stone-100">
            <th className="text-left p-2 border border-stone-200 font-medium text-stone-600">Category</th>
            {allColKeys.map((ck) => (
              <th key={ck} className="text-left p-2 border border-stone-200 font-medium text-stone-600">
                {humanizeKey(ck)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk) => (
            <tr key={rk} className="hover:bg-stone-50">
              <td className="p-2 border border-stone-200 font-medium text-stone-700">{humanizeKey(rk)}</td>
              {allColKeys.map((ck) => {
                const cell = value[rk]?.[ck];
                return (
                  <td key={ck} className="p-2 border border-stone-200 text-stone-600">
                    {cell === null || cell === undefined || cell === '' ? (
                      <span className="text-stone-300">-</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Render a flat object as a key-value list
const FlatObjectRenderer = ({ value }) => (
  <div className="space-y-1">
    {Object.entries(value).map(([k, v]) => (
      <div key={k} className="flex items-start gap-2 text-sm">
        <span className="text-stone-500 font-medium shrink-0">{humanizeKey(k)}:</span>
        <span className="text-stone-700 break-words">
          {v === null || v === undefined || v === '' ? (
            <span className="text-stone-300">-</span>
          ) : typeof v === 'object' ? (
            JSON.stringify(v)
          ) : (
            String(v)
          )}
        </span>
      </div>
    ))}
  </div>
);

// Smart value renderer: detects structure and picks the right format
const ValueDisplay = ({ value, label, bgClass, borderClass }) => {
  if (value === null || value === undefined || value === '') {
    return (
      <div className={`border ${borderClass} ${bgClass} rounded-lg p-3`}>
        <span className="block text-xs font-medium text-stone-500 mb-1">{label}</span>
        <span className="text-stone-400 text-sm">--</span>
      </div>
    );
  }

  // Simple string or number
  if (typeof value !== 'object') {
    return (
      <div className={`border ${borderClass} ${bgClass} rounded-lg p-3`}>
        <span className="block text-xs font-medium text-stone-500 mb-1">{label}</span>
        <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{String(value)}</p>
      </div>
    );
  }

  // Array
  if (Array.isArray(value)) {
    return (
      <div className={`border ${borderClass} ${bgClass} rounded-lg p-3`}>
        <span className="block text-xs font-medium text-stone-500 mb-2">{label}</span>
        {value.length === 0 ? (
          <span className="text-stone-400 text-sm">Empty list</span>
        ) : (
          <ul className="list-disc list-inside text-sm text-stone-700 space-y-0.5">
            {value.map((item, i) => (
              <li key={i}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Nested tabular object → render as table
  if (isTabularObject(value)) {
    return (
      <div className={`border ${borderClass} ${bgClass} rounded-lg p-3`}>
        <span className="block text-xs font-medium text-stone-500 mb-2">{label}</span>
        <TableRenderer value={value} />
      </div>
    );
  }

  // Flat object → render as key-value pairs
  return (
    <div className={`border ${borderClass} ${bgClass} rounded-lg p-3`}>
      <span className="block text-xs font-medium text-stone-500 mb-2">{label}</span>
      <FlatObjectRenderer value={value} />
    </div>
  );
};

const formatDate = (timestamp) =>
  timestamp ? new Date(timestamp).toLocaleString() : 'Timestamp unavailable';

const eventStyle = (eventType) => {
  if (eventType === 'APPROVED')
    return { label: 'Update Approved', icon: CheckCircle2, tone: 'text-green-700 bg-green-50 border-green-200' };
  if (eventType === 'REJECTED')
    return { label: 'Update Rejected', icon: XCircle, tone: 'text-red-700 bg-red-50 border-red-200' };
  if (eventType === 'SUBMITTED')
    return { label: 'Submitted for Approval', icon: Clock, tone: 'text-blue-700 bg-blue-50 border-blue-200' };
  if (eventType === 'CREATED')
    return { label: 'Response Created', icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (eventType === 'UPDATED')
    return { label: 'Response Updated', icon: History, tone: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
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

        {loading && (
          <div className="py-10 text-center text-text-muted" data-testid="question-version-history-loading">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading timeline...
          </div>
        )}
        {error && <div className="py-6 text-red-700" data-testid="question-version-history-error">{error}</div>}
        {!loading && !error && timeline && (
          <div className="space-y-4" data-testid="question-version-history-content">
            {timeline.evidence_state === 'FOUND_PARTIAL' && (
              <div className="border border-amber-200 bg-amber-50 text-amber-800 text-sm p-3 rounded-lg" data-testid="question-version-history-partial-warning">
                Some older, unscoped events were excluded to avoid mixing reporting years.
              </div>
            )}
            {timeline.events.length === 0 ? (
              <div className="py-8 text-center text-text-muted" data-testid="question-version-history-empty">
                No safely linked history is available for this question and reporting year.
              </div>
            ) : (
              timeline.events.map((event, index) => {
                const style = eventStyle(event.event_type);
                const Icon = style.icon;
                const hasValues = event.submitted_value !== null && event.submitted_value !== undefined
                  || event.final_value !== null && event.final_value !== undefined;

                return (
                  <article
                    key={`${event.source}-${event.timestamp}-${index}`}
                    className="border border-stone-200 rounded-lg p-4"
                    data-testid={`question-timeline-event-${index}`}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <Badge className={`border ${style.tone}`} data-testid={`question-timeline-event-type-${index}`}>
                        <Icon className="w-3 h-3 mr-1" />{style.label}
                      </Badge>
                      <time className="text-xs text-text-muted" data-testid={`question-timeline-event-time-${index}`}>
                        {formatDate(event.timestamp)}
                      </time>
                    </div>

                    {/* Actor info */}
                    <div className="mt-3 text-sm text-text-secondary space-y-0.5">
                      {event.requester && (
                        <p>{event.event_type === 'CREATED' || event.event_type === 'UPDATED' ? 'Saved by' : 'Requested by'}: <strong>{event.requester.name || event.requester.email}</strong></p>
                      )}
                      {event.approver && (
                        <p>
                          {event.event_type === 'REJECTED' ? 'Rejected' : 'Approved'} by:{' '}
                          <strong>{event.approver.name || event.approver.email}</strong>
                        </p>
                      )}
                      {event.rejection_reason && (
                        <p className="text-red-700">Reason: {event.rejection_reason}</p>
                      )}
                    </div>

                    {/* Values: smart rendering */}
                    {hasValues && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ValueDisplay
                          value={event.submitted_value}
                          label={event.event_type === 'REJECTED' ? 'Current value' : event.event_type === 'SUBMITTED' ? 'Proposed value' : 'Old value'}
                          bgClass="bg-stone-50/60"
                          borderClass="border-stone-200"
                        />
                        <ValueDisplay
                          value={event.final_value}
                          label={event.event_type === 'REJECTED' ? 'Rejected proposed value' : event.event_type === 'SUBMITTED' ? 'Awaiting approval' : 'New value'}
                          bgClass={event.event_type === 'REJECTED' ? 'bg-red-50/60' : 'bg-green-50/60'}
                          borderClass={event.event_type === 'REJECTED' ? 'border-red-100' : 'border-green-100'}
                        />
                      </div>
                    )}

                    {event.approver_edited && (
                      <p className="mt-3 text-xs text-amber-700" data-testid={`question-timeline-approver-edit-${index}`}>
                        Approver modified the submitted value before approval.
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
