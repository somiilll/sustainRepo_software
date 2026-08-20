import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Clock, History, Loader2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { useAuth } from '../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ───────────── Key humanization ───────────── */

const ABBREVIATIONS = {
  bod: 'BoD', kmp: 'KMP', fy: 'FY', pct: '%', csr: 'CSR', esg: 'ESG',
  ghg: 'GHG', co2: 'CO₂', co2e: 'CO₂e', ngrbc: 'NGRBC', sdg: 'SDG',
  capex: 'CapEx', rd: 'R&D', coi: 'CoI', kmps: 'KMPs', id: 'ID',
};

const humanize = (key) => {
  if (!key || typeof key !== 'string') return String(key ?? '');
  return key
    .split('_')
    .map((w) => ABBREVIATIONS[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

/* ───────────── Structure detection ───────────── */

const isArrayOfObjects = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((item) => item && typeof item === 'object' && !Array.isArray(item));

const isTabularObject = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const vals = Object.values(v);
  if (vals.length === 0) return false;
  if (!vals.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return false;
  const sets = vals.map((x) => new Set(Object.keys(x)));
  const union = new Set(sets.flatMap((s) => [...s]));
  const avg = sets.reduce((s, ks) => s + [...union].filter((k) => ks.has(k)).length, 0) / sets.length;
  return avg / union.size > 0.5;
};

/* ───────────── Primitive cell renderer ───────────── */

const CellValue = ({ value }) => {
  if (value === null || value === undefined || value === '') return <span className="text-stone-300">–</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  return <span>{String(value)}</span>;
};

/* ───────────── Table from array of objects ───────────── */

const ArrayTable = ({ rows }) => {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-stone-100">
            <th className="text-left p-2 border border-stone-200 font-medium text-stone-600">#</th>
            {cols.map((c) => (
              <th key={c} className="text-left p-2 border border-stone-200 font-medium text-stone-600">{humanize(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-stone-50">
              <td className="p-2 border border-stone-200 text-stone-500">{i + 1}</td>
              {cols.map((c) => (
                <td key={c} className="p-2 border border-stone-200 text-stone-600"><CellValue value={row[c]} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ───────────── Table from nested object {row: {col: val}} ───────────── */

const NestedTable = ({ data }) => {
  const rowKeys = Object.keys(data);
  const colKeys = [...new Set(rowKeys.flatMap((rk) => Object.keys(data[rk])))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-stone-100">
            <th className="text-left p-2 border border-stone-200 font-medium text-stone-600">Category</th>
            {colKeys.map((c) => (
              <th key={c} className="text-left p-2 border border-stone-200 font-medium text-stone-600">{humanize(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk) => (
            <tr key={rk} className="hover:bg-stone-50">
              <td className="p-2 border border-stone-200 font-medium text-stone-700">{humanize(rk)}</td>
              {colKeys.map((c) => (
                <td key={c} className="p-2 border border-stone-200 text-stone-600"><CellValue value={data[rk]?.[c]} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ───────────── Recursive smart value renderer ───────────── */

const SmartValue = ({ value }) => {
  if (value === null || value === undefined || value === '') return <span className="text-stone-400 text-sm">–</span>;
  if (typeof value === 'boolean') return <span className="text-sm text-stone-700">{value ? 'Yes' : 'No'}</span>;
  if (typeof value !== 'object') return <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{String(value)}</p>;

  // Array of objects → table
  if (isArrayOfObjects(value)) return <ArrayTable rows={value} />;

  // Simple array of primitives
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-stone-400 text-sm">Empty list</span>;
    return (
      <ul className="list-disc list-inside text-sm text-stone-700 space-y-0.5">
        {value.map((item, i) => <li key={i}>{String(item)}</li>)}
      </ul>
    );
  }

  // Nested tabular object → table
  if (isTabularObject(value)) return <NestedTable data={value} />;

  // Flat/mixed object → recursive key-value pairs
  return (
    <div className="space-y-2">
      {Object.entries(value).map(([k, v]) => {
        const isComplex = v && typeof v === 'object';
        return (
          <div key={k}>
            <span className="text-xs font-medium text-stone-500">{humanize(k)}</span>
            {isComplex ? (
              <div className="ml-3 mt-1 pl-3 border-l-2 border-stone-200">
                <SmartValue value={v} />
              </div>
            ) : (
              <div className="ml-3 text-sm text-stone-700"><CellValue value={v} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ───────────── Value display wrapper (adds label + bg) ───────────── */

const ValueDisplay = ({ value, label, bgClass, borderClass }) => (
  <div className={`border ${borderClass} ${bgClass} rounded-lg p-3`}>
    <span className="block text-xs font-medium text-stone-500 mb-2">{label}</span>
    <SmartValue value={value} />
  </div>
);

/* ───────────── Event styling ───────────── */

const formatDate = (ts) => (ts ? new Date(ts).toLocaleString() : 'Timestamp unavailable');

const EVENT_STYLES = {
  APPROVED:  { label: 'Update Approved',        icon: CheckCircle2, tone: 'text-green-700 bg-green-50 border-green-200' },
  REJECTED:  { label: 'Update Rejected',        icon: XCircle,      tone: 'text-red-700 bg-red-50 border-red-200' },
  SUBMITTED: { label: 'Submitted for Approval',  icon: Clock,        tone: 'text-blue-700 bg-blue-50 border-blue-200' },
  CREATED:   { label: 'Response Created',        icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  UPDATED:   { label: 'Response Updated',        icon: History,      tone: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
};

const eventStyle = (type) =>
  EVENT_STYLES[type] || { label: type.replace(/_/g, ' '), icon: History, tone: 'text-stone-700 bg-stone-50 border-stone-200' };

const actorLabel = (type) => {
  if (type === 'CREATED' || type === 'UPDATED') return 'Saved by';
  return 'Requested by';
};

const valueLabels = (type) => {
  if (type === 'APPROVED')  return ['Proposed value', 'Final approved value'];
  if (type === 'REJECTED')  return ['Proposed value', 'Rejected proposed value'];
  if (type === 'SUBMITTED') return ['Old value', 'Proposed value'];
  return ['Old value', 'New value'];
};

const valueBg = (type, side) => {
  if (side === 'left')  return { bg: 'bg-stone-50/60', border: 'border-stone-200' };
  if (type === 'REJECTED') return { bg: 'bg-red-50/60', border: 'border-red-100' };
  return { bg: 'bg-green-50/60', border: 'border-green-100' };
};

/* ───────────── Main component ───────────── */

export const QuestionVersionHistory = ({ open, onOpenChange, framework, questionKey, reportingYear }) => {
  const { getAuthHeader } = useAuth();
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !framework || !questionKey || !reportingYear) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(
          `${API}/esg-questionnaire/timeline/${encodeURIComponent(framework)}/${encodeURIComponent(questionKey)}/${encodeURIComponent(reportingYear)}`,
          { headers: getAuthHeader() },
        );
        if (active) setTimeline(res.data);
      } catch (e) {
        if (active) setError(e.response?.data?.detail || 'Unable to load timeline.');
      } finally {
        if (active) setLoading(false);
      }
    })();
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
              timeline.events.map((event, idx) => {
                const style = eventStyle(event.event_type);
                const Icon = style.icon;
                const hasValues = event.submitted_value != null || event.final_value != null;
                const [leftLabel, rightLabel] = valueLabels(event.event_type);
                const leftBg = valueBg(event.event_type, 'left');
                const rightBg = valueBg(event.event_type, 'right');

                return (
                  <article key={`${event.source}-${event.timestamp}-${idx}`} className="border border-stone-200 rounded-lg p-4" data-testid={`question-timeline-event-${idx}`}>
                    <div className="flex items-start justify-between gap-3">
                      <Badge className={`border ${style.tone}`} data-testid={`question-timeline-event-type-${idx}`}>
                        <Icon className="w-3 h-3 mr-1" />{style.label}
                      </Badge>
                      <time className="text-xs text-text-muted" data-testid={`question-timeline-event-time-${idx}`}>
                        {formatDate(event.timestamp)}
                      </time>
                    </div>

                    <div className="mt-3 text-sm text-text-secondary space-y-0.5">
                      {event.requester && (
                        <p>{actorLabel(event.event_type)}: <strong>{event.requester.name || event.requester.email}</strong></p>
                      )}
                      {event.approver && (
                        <p>{event.event_type === 'REJECTED' ? 'Rejected' : 'Approved'} by: <strong>{event.approver.name || event.approver.email}</strong></p>
                      )}
                      {event.rejection_reason && <p className="text-red-700">Reason: {event.rejection_reason}</p>}
                    </div>

                    {hasValues && (
                      <div className={`mt-3 grid gap-3 ${rightLabel ? 'sm:grid-cols-2' : ''}`}>
                        <ValueDisplay value={event.submitted_value} label={leftLabel} bgClass={leftBg.bg} borderClass={leftBg.border} />
                        {rightLabel && <ValueDisplay value={event.final_value} label={rightLabel} bgClass={rightBg.bg} borderClass={rightBg.border} />}
                      </div>
                    )}

                    {event.approver_edited && (
                      <p className="mt-3 text-xs text-amber-700" data-testid={`question-timeline-approver-edit-${idx}`}>
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
