import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CornerDownRight, DatabaseZap, FileJson, FileSearch, Files, Info, Pencil, Search, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { errText } from './api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { EditDialog } from './EditDialog';
import { DocsDialog, EvidenceDialog, FactorDialog, WhyDialog } from './RowDialogs';
import { PENDING, SCOPE_COLOR, SCOPE_LABEL, STATUS_BAR, STATUS_CLASS, STATUS_LABEL, STATUS_ORDER, fmtCr, fmtDate, fmtN, rstate, saveBlob, scopeOf } from './utils';

const PER = 50;
const TABS = ['pending', 'all', 'ready', 'check', 'input', 'unreadable', 'approved', 'rejected'];

const Ring = ({ pct }) => {
  const r = 26; const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={r} fill="none" stroke="#e7e5e4" strokeWidth="6" /><circle cx="32" cy="32" r={r} fill="none" stroke="#16a34a" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 32 32)" /></svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{Math.round(pct * 100)}%</span>
    </div>
  );
};

const LEVEL_CLASS = { certain: 'border-emerald-300 bg-emerald-50 text-emerald-800', likely: 'border-sky-300 bg-sky-50 text-sky-800', uncertain: 'border-amber-300 bg-amber-50 text-amber-800', guess: 'border-red-300 bg-red-50 text-red-800' };
const INPUT_LABEL = { km_travelled: 'Distance', qty_passenger: 'Passengers', qty_room: 'Rooms', qty_nights: 'Nights', qty_days_travelled: 'Days' };
const QtyCell = ({ r }) => {
  const extra = Object.entries(r.calc?.fields || {}).filter(([k]) => INPUT_LABEL[k]);
  const pq = r.raw_quantity; const pu = (r.raw_unit || '').trim(); const cq = r.quantity; const cu = r.unit || '';
  const same = cq == null || (pq != null && Math.abs(cq - pq) < 1e-9 && (!pu || pu.toLowerCase() === cu.toLowerCase()));
  return (
    <div>
      {pq != null ? <><b>{fmtN(pq, 3)}</b> <span className="text-stone-500">{pu || cu}</span></> : cq != null ? <><b>{fmtN(cq, 3)}</b> <span className="text-stone-500">{cu}</span></> : <span className="text-stone-400">No quantity</span>}
      {pq != null && !same && <div className="text-xs text-stone-500" title="The value used for the emissions calculation">→ {fmtN(cq, 3)} {cu} for calculation</div>}
      {extra.map(([k, v]) => <div key={k} className="text-xs text-stone-500" data-testid={`ocr-input-${r.row_id}-${k}`}>{INPUT_LABEL[k]}: <b>{fmtN(v, 3)}</b> {r.calc.fields[`${k}_unit`] || ''}</div>)}
      {r.amount != null && <div className="text-xs text-stone-500">{r.currency === 'INR' ? '₹' : `${r.currency || ''} `}{fmtN(r.amount)}</div>}
    </div>
  );
};

export const ReviewTab = ({ api, meta, jobId, onOpenJob, onBackToInbox, goUpload }) => {
  const inbox = !jobId;
  const [rows, setRows] = useState(null);
  const [jobMeta, setJobMeta] = useState(null);
  const [jobList, setJobList] = useState([]);
  const [filter, setFilter] = useState(inbox ? 'pending' : 'all');
  const [scope, setScope] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(new Set());
  const [jobsSel, setJobsSel] = useState(new Set());
  const [dlg, setDlg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveRes, setSaveRes] = useState(null);

  const jobOf = useCallback((r) => r._job || jobId, [jobId]);
  const actLabel = useCallback((id) => meta.activities.find((a) => a.id === id)?.label || id, [meta]);
  const actOf = useCallback((id) => meta.activities.find((a) => a.id === id), [meta]);

  const load = useCallback(async () => {
    if (inbox) {
      const jobs = (await api.jobs()).filter((j) => j.status === 'done').sort((a, b) => (b.created || 0) - (a.created || 0));
      const lists = await Promise.all(jobs.map(async (j) => (await api.rows(j.job_id)).map((r) => ({ ...r, _job: j.job_id, _rid: r.row_id, row_id: `${j.job_id}:${r.row_id}`, parent_id: r.parent_id ? `${j.job_id}:${r.parent_id}` : r.parent_id }))));
      setJobList(jobs); setRows(lists.flat()); setJobMeta({ documents: [], metrics: {}, credits: 0 });
    } else {
      const [job, rs] = await Promise.all([api.job(jobId), api.rows(jobId)]);
      setJobMeta(job); setRows(rs);
    }
  }, [api, inbox, jobId]);

  useEffect(() => { setRows(null); setSel(new Set()); setPage(0); setFilter(inbox ? 'pending' : 'all'); setJobsSel(new Set()); load().catch((e) => toast.error(errText(e, 'Could not load the extraction'))); }, [load, inbox]);

  const inScope = useCallback((r) => !r.derived && (!jobsSel.size || jobsSel.has(r._job || jobId)), [jobsSel, jobId]);
  const [counts, scopes] = useMemo(() => {
    const c = { all: 0, ready: 0, check: 0, input: 0, unreadable: 0, approved: 0, rejected: 0, pending: 0 }; const sc = {};
    (rows || []).filter(inScope).forEach((r) => { c.all++; c[rstate(r)] = (c[rstate(r)] || 0) + 1; if (PENDING.includes(rstate(r))) c.pending++; sc[scopeOf(r)] = (sc[scopeOf(r)] || 0) + 1; });
    return [c, sc];
  }, [rows, inScope]);
  const parents = useMemo(() => {
    const t = q.toLowerCase();
    return (rows || []).filter((r) => inScope(r) && (filter === 'all' || (filter === 'pending' ? PENDING.includes(rstate(r)) : rstate(r) === filter)) && (scope === 'all' || scopeOf(r) === scope)
      && (!t || [r.extracted_item, r.original_text, r.vendor, r.file, r.activity_label, r.ghg?.subcategory_label, r.ghg?.category_label].join(' ').toLowerCase().includes(t)));
  }, [rows, inScope, filter, scope, q]);
  const kids = useMemo(() => { const k = {}; (rows || []).filter((r) => r.derived).forEach((r) => { (k[r.parent_id] = k[r.parent_id] || []).push(r); }); return k; }, [rows]);
  const pages = Math.max(1, Math.ceil(parents.length / PER));
  const slice = parents.slice(Math.min(page, pages - 1) * PER, (Math.min(page, pages - 1) + 1) * PER);

  const setReview = async (ids, state) => {
    const byJob = {};
    ids.forEach((id) => { const r = rows.find((x) => x.row_id === id); if (r) (byJob[jobOf(r)] = byJob[jobOf(r)] || []).push(r._rid || r.row_id); });
    let blocked = 0; let updated = 0;
    try {
      for (const [j, list] of Object.entries(byJob)) { const res = await api.review(j, list, state); blocked += res.blocked?.length || 0; updated += res.updated || 0; }
      if (blocked) toast.warning(`${blocked} record(s) not approved yet: they need a quantity, facility and period first (use Edit)`);
      else if (state === 'approved') toast.success(`${updated} record(s) approved`);
      setSel(new Set()); await load();
    } catch (e) { toast.error(errText(e)); }
  };

  const answer = async (r, kind, val) => {
    const body = kind === 'factor' ? { remember: true, scope: 'vendor', factor_id: val } : { remember: true, scope: 'vendor', activity_id: kind === 'act' ? val : r.activity_id };
    if (kind === 'ctx') body.use_context = val;
    try { await api.edit(jobOf(r), r.item_id, body); toast.success('Answered - similar lines will be classified this way'); await load(); } catch (e) { toast.error(`Could not save: ${errText(e)}`); }
  };

  const saveGhg = async (id) => {
    setSaving(true);
    try { const res = await api.saveToGhg(id); setSaveRes(res); await load(); if (res.saved && !res.failed.length) toast.success(`${res.saved} line(s) saved`); } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  };
  const exportJson = async (id, all) => { try { const r = await api.exportJson(id, all); saveBlob(r.data, `extraction_${id}${all ? '_all' : ''}.json`); } catch (e) { toast.error(errText(e)); } };

  if (rows === null || !jobMeta) return <div className="space-y-3" data-testid="ocr-review-loading">{[70, 100, 90].map((w) => <div key={w} className="h-10 animate-pulse rounded bg-stone-100" style={{ width: `${w}%` }} />)}</div>;
  if (inbox && !jobList.length) return <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-500" data-testid="ocr-review-empty">No finished extractions yet. <button type="button" className="text-emerald-700 underline" onClick={goUpload}>Go to Upload</button></div>;
  if (!inbox && ['running', 'queued'].includes(jobMeta.status)) return <div className="rounded-xl border border-stone-200 p-10 text-center text-stone-600">This extraction is still running. Its progress is on the Upload tab.</div>;

  const selJobs = inbox ? jobList.filter((j) => !jobsSel.size || jobsSel.has(j.job_id)) : [];
  const unsaved = rows.filter((r) => (inScope(r) || r.derived) && rstate(r) === 'approved' && !r.review?.saved).length;
  const exportId = inbox ? (selJobs.length === 1 ? selJobs[0].job_id : null) : jobId;
  const good = (counts.ready || 0) + (counts.approved || 0);
  const noFac = rows.filter((r) => inScope(r) && !r.facility?.id && rstate(r) !== 'rejected').length;
  const credits = inbox ? selJobs.reduce((a, j) => a + (j.credits || 0), 0) : jobMeta.credits;
  const docs = inbox ? [] : jobMeta.documents || [];

  const answerUi = (r) => {
    const d = r.decision || {}; const st = rstate(r);
    if (!d.question || st === 'approved' || st === 'rejected') return null;
    const a = actOf(r.activity_id);
    let opts;
    if (a?.context_key === 'use_context' && /use|used|where|vehicle|equipment/i.test(d.question)) opts = Object.entries(meta.use_context).map(([k, v]) => ['ctx', k, v.split(' (')[0]]);
    else if (d.factor_match) { const fs = [d.factor_match, ...(d.alternatives || []).map((x) => x.factor)].filter((f, i, arr) => f && arr.findIndex((g) => g?.id === f.id) === i).slice(0, 8); const common = fs.length > 1 && fs.every((f) => f.name.split(' - ')[0] === fs[0].name.split(' - ')[0]); opts = fs.map((f) => ['factor', f.id, (common ? f.name.split(' - ').slice(1).join(' - ') : f.name).slice(0, 42)]); }
    else opts = [r.activity_id, ...(d.alternatives || []).map((x) => x.activity_id)].filter((x, i, s) => x && actOf(x) && s.indexOf(x) === i).slice(0, 3).map((id) => ['act', id, actLabel(id).split(' (')[0].slice(0, 42)]);
    return (
      <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs"><div className="mb-1 font-medium text-sky-900">{d.question}</div>
        <div className="flex flex-wrap gap-1">{opts.map(([t, v, l]) => <button key={v} type="button" className="rounded border border-sky-300 bg-white px-2 py-0.5 hover:bg-sky-100" onClick={() => answer(r, t, v)} data-testid={`ocr-answer-${r.row_id}-${v}`}>{l}</button>)}
          <button type="button" className="rounded border border-dashed border-sky-300 bg-white px-2 py-0.5" onClick={() => setDlg({ type: 'edit', row: r })}>Other...</button></div></div>
    );
  };

  const rowEl = (r, child = false) => {
    const st = rstate(r); const g = r.ghg || {}; const sc = scopeOf(r);
    const src = r.source || {};
    const where = src.sheet ? `${src.sheet} · row ${src.row}` : src.page ? `page ${src.page}` : '';
    const checks = (r.checks || []).filter((c) => c.level !== 'info').slice(0, child ? 1 : 2);
    return (
      <tr key={r.row_id} className={`border-b align-top ${child ? 'bg-stone-50/70' : ''} ${sel.has(r.row_id) ? 'bg-emerald-50/60' : ''}`} data-testid={`ocr-row-${r.row_id}`}>
        <td className="p-2">{!child && <input type="checkbox" checked={sel.has(r.row_id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(r.row_id); else n.delete(r.row_id); return n; })} aria-label="Select row" data-testid={`ocr-select-${r.row_id}`} />}</td>
        <td className="min-w-[220px] p-2"><div className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SCOPE_COLOR[sc] }} />
          <div>{child && <CornerDownRight className="mr-1 inline h-3.5 w-3.5 text-stone-400" />}<span className="font-medium text-stone-900">{r.extracted_item}</span>
            {child ? <div className="text-xs text-stone-500">Added automatically · linked to the line above</div> : <>
              {r.original_text && r.original_text !== r.extracted_item && <div className="text-xs italic text-stone-500">"{r.original_text.slice(0, 90)}"</div>}
              <div className="text-xs text-stone-500" title={r.file}>{r.file}{where ? ` · ${where}` : ''}{r.vendor ? ` · ${r.vendor}` : ''}</div></>}</div></div></td>
        <td className="p-2"><QtyCell r={r} /></td>
        <td className="min-w-[200px] p-2"><span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: SCOPE_COLOR[sc] }}>{g.scope_label || SCOPE_LABEL[sc] || 'Unclassified'}</span>
          {r.calc?.ef_method === 'activity' && <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800" title="Physical quantity multiplied by an average emission factor" data-testid={`ocr-method-tag-${r.row_id}`}>Average Data Based</span>}
          {r.calc?.ef_method === 'spend' && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800" title="No physical quantity - calculated from the amount spent">Spend-based</span>}
          <div className="mt-1 text-xs text-stone-700">{(g.category_label || '').replace(/^C\d+ - /, '')}</div><div className="text-xs text-stone-500">{g.subcategory_label}</div>
          {r.modules?.length > 0 && <div className="text-xs text-stone-400">Also in {r.modules.map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')}</div>}</td>
        <td className="min-w-[140px] p-2 text-sm">{r.facility?.id ? <div className="font-medium">{r.facility.name}</div> : <div className="font-medium text-amber-700">No facility</div>}
          <div className="text-xs text-stone-500">{r.reporting_period || 'No period'}{r.period?.allocation ? ` · split ${r.period.allocation.map((a) => `${a.period.slice(5)} ${Math.round(a.share * 100)}%`).join(' / ')}` : ''}</div></td>
        <td className="min-w-[200px] max-w-[260px] p-2"><div className="flex flex-wrap items-center gap-1"><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[st]}`} title={(r.trust?.reasons || []).join('\n')} data-testid={`ocr-status-${r.row_id}`}>{STATUS_LABEL[st] || st}</span>{r.review?.saved && <span className="rounded-full border border-emerald-300 bg-emerald-600 px-2 py-0.5 text-xs text-white" data-testid={`ocr-saved-${r.row_id}`}>Saved</span>}{r.review?.edited && <span className="text-[10px] text-stone-500">edited</span>}</div>
          {!child && ['input', 'check', 'unreadable'].includes(st) && (r.state?.state === 'couldnt_read' || r.state?.state === 'failed' ? r.state.reason : r.trust?.reasons?.[0]) && <div className="mt-1 text-xs text-stone-600" data-testid={`ocr-need-${r.row_id}`}>{r.state?.state === 'couldnt_read' || r.state?.state === 'failed' ? r.state.reason : r.trust.reasons[0]}</div>}
          {!r.facility?.id && !child && <div className="text-xs text-amber-700">Facility not set</div>}
          {!child && (r.read_tags || []).length > 0 && <div className="mt-1 flex flex-col gap-1" data-testid={`ocr-read-tags-${r.row_id}`}>{r.read_tags.map((t) => <div key={t.id} className="flex flex-wrap items-center gap-1 text-[11px]"><span className={`rounded border px-1.5 py-0.5 ${LEVEL_CLASS[t.level] || LEVEL_CLASS.uncertain}`} title={`AI read '${t.text}' as ${t.role}`} data-testid={`ocr-read-level-${r.row_id}-${t.id}`}>{t.text}: {t.role} · {t.level}</span>{(t.tags || []).map((g) => <span key={g} className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600" data-testid={`ocr-read-tag-${r.row_id}-${t.id}-${g}`}>{g.replace(/_/g, ' ')}</span>)}</div>)}</div>}
          {!child && answerUi(r)}
          {r.review?.save_error && !r.review?.saved && <div className="mt-1 rounded border border-rose-200 bg-rose-50 p-1.5 text-xs text-rose-800" data-testid={`ocr-save-error-${r.row_id}`}>{r.review.save_error}{/factor/i.test(r.review.save_error) && <button type="button" className="ml-1 font-semibold underline" onClick={() => setDlg({ type: 'factor', row: r })}>Choose factor</button>}</div>}
          <ul className="mt-1 space-y-0.5 text-xs">{checks.map((c) => <li key={c.message} className={c.level === 'error' ? 'text-rose-700' : 'text-amber-700'}>{c.message}</li>)}</ul></td>
        <td className="p-2"><div className="flex gap-1">
          {!child && !r.review?.saved && <>
            {st !== 'approved' && <button type="button" className="rounded p-1 text-emerald-700 hover:bg-emerald-50" title="Approve" onClick={() => setReview([r.row_id], 'approved')} data-testid={`ocr-approve-${r.row_id}`}><Check className="h-4 w-4" /></button>}
            {st !== 'rejected' && <button type="button" className="rounded p-1 text-rose-600 hover:bg-rose-50" title="Reject" onClick={() => setReview([r.row_id], 'rejected')} data-testid={`ocr-reject-${r.row_id}`}><X className="h-4 w-4" /></button>}
            <button type="button" className="rounded p-1 hover:bg-stone-100" title="Edit" onClick={() => setDlg({ type: 'edit', row: r })} data-testid={`ocr-edit-${r.row_id}`}><Pencil className="h-4 w-4" /></button></>}
          <button type="button" className="rounded p-1 hover:bg-stone-100" title="See it on the document" onClick={() => setDlg({ type: 'evidence', row: r })} data-testid={`ocr-evidence-${r.row_id}`}><FileSearch className="h-4 w-4" /></button>
          <button type="button" className="rounded p-1 hover:bg-stone-100" title="Why this classification" onClick={() => setDlg({ type: 'why', row: r })} data-testid={`ocr-why-${r.row_id}`}><Info className="h-4 w-4" /></button></div></td>
      </tr>
    );
  };

  return (
    <div className="space-y-5" data-testid="ocr-review-tab">
      <div className="flex flex-wrap items-center gap-3">
        {!inbox && <Button variant="ghost" size="sm" onClick={onBackToInbox} data-testid="ocr-back-inbox"><ArrowLeft className="mr-1 h-4 w-4" />All pending items</Button>}
        <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold text-stone-900">{inbox ? 'Review' : 'Review extracted data'}</h2>
          <p className="text-sm text-stone-500">{inbox ? `Everything that still needs you, from ${selJobs.length} extraction${selJobs.length === 1 ? '' : 's'} · ${counts.all} line${counts.all === 1 ? '' : 's'}` : `${jobMeta.names.length} file${jobMeta.names.length > 1 ? 's' : ''} · ${fmtDate(jobMeta.created)} · ${jobMeta.mode === 'think' ? 'Deep read' : 'Standard'} · ${jobMeta.metrics?.items ?? '?'} lines read in ${jobMeta.metrics?.seconds ?? '?'}s`}</p></div>
        <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-stone-400" /><input className="w-60 rounded-md border border-stone-300 py-2 pl-8 pr-2 text-sm" placeholder="Search item, vendor, category..." value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} data-testid="ocr-search" /></div>
        {!inbox && <Button variant="outline" onClick={() => setDlg({ type: 'docs' })} data-testid="ocr-docs-button"><Files className="mr-1 h-4 w-4" />Documents ({docs.length})</Button>}
        <Button variant="outline" disabled={!exportId} onClick={() => exportJson(exportId, true)} data-testid="ocr-export-all"><FileJson className="mr-1 h-4 w-4" />Export all</Button>
        <Button variant="outline" disabled={!exportId} title={exportId ? '' : 'Pick one extraction below to export'} onClick={() => exportJson(exportId, false)} data-testid="ocr-export-approved"><Save className="mr-1 h-4 w-4" />Export approved</Button>
        <Button disabled={!exportId || saving || unsaved === 0} title={exportId ? 'Create GHG emission records (with calculation) and Water records, each with the source document as evidence' : 'Pick one extraction below to save'} onClick={() => saveGhg(exportId)} data-testid="ocr-save-ghg"><DatabaseZap className="mr-1 h-4 w-4" />{saving ? 'Saving...' : `Save approved (${unsaved})`}</Button>
      </div>
      {inbox && (
        <div className="rounded-xl border border-stone-200 bg-white p-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Show lines from</div>
          <div className="flex flex-wrap gap-2"><button type="button" className={`rounded-full border px-3 py-1 text-xs ${jobsSel.size ? 'border-stone-300' : 'border-emerald-600 bg-emerald-50 font-semibold'}`} onClick={() => { setJobsSel(new Set()); setPage(0); }} data-testid="ocr-jobs-all">All extractions · {jobList.length}</button>
            {jobList.map((j) => <button key={j.job_id} type="button" className={`max-w-[260px] truncate rounded-full border px-3 py-1 text-xs ${jobsSel.has(j.job_id) ? 'border-emerald-600 bg-emerald-50 font-semibold' : 'border-stone-300'}`} title={j.names.join(', ')}
              onClick={() => { setJobsSel((s) => { const n = new Set(s); if (n.has(j.job_id)) n.delete(j.job_id); else n.add(j.job_id); return n; }); setPage(0); setSel(new Set()); }} data-testid={`ocr-jobs-${j.job_id}`}>{j.names[0]}{j.names.length > 1 ? ` +${j.names.length - 1}` : ''} · {rows.filter((r) => !r.derived && r._job === j.job_id && PENDING.includes(rstate(r))).length} to do</button>)}</div></div>
      )}
      <div className="grid gap-5 rounded-xl border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-[auto_1.4fr_1fr_auto]" data-testid="ocr-summary">
        <div className="flex items-center gap-3"><Ring pct={counts.all ? good / counts.all : 0} /><div><b>{good} of {counts.all} ready</b><div className="text-xs text-stone-500">approved or ready to approve</div></div></div>
        <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Review status</div>
          <div className="flex h-2 overflow-hidden rounded-full bg-stone-100">{STATUS_ORDER.filter((k) => counts[k]).map((k) => <i key={k} style={{ width: `${(100 * counts[k]) / (counts.all || 1)}%`, background: STATUS_BAR[k] }} />)}</div>
          <div className="mt-2 flex flex-wrap gap-x-3 text-xs">{STATUS_ORDER.filter((k) => counts[k]).map((k) => <button key={k} type="button" className="text-stone-700 hover:underline" onClick={() => { setFilter(k); setPage(0); }}>{counts[k]} {STATUS_LABEL[k]}</button>)}</div></div>
        <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">By scope</div><div className="flex flex-wrap gap-1">{Object.entries(scopes).sort().map(([k, v]) => <button key={k} type="button" className={`rounded-full border px-2 py-0.5 text-xs ${scope === k ? 'border-stone-900 font-semibold' : 'border-stone-200'}`} style={{ color: SCOPE_COLOR[k] }} onClick={() => { setScope(scope === k ? 'all' : k); setPage(0); }} data-testid={`ocr-scope-${k}`}>{SCOPE_LABEL[k] || k} · {v}</button>)}</div></div>
        <div className="text-right"><div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Credits used</div><div className="text-2xl font-semibold">{fmtCr(credits)}</div></div>
      </div>
      {counts.input > 0 && <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm"><span className="flex-1"><b>{counts.input} line{counts.input > 1 ? 's need' : ' needs'} a quick answer</b> - for example, where a fuel was used. Answer inline and similar lines are remembered.</span>{filter !== 'ask' && <Button size="sm" variant="outline" onClick={() => setFilter('ask')}>Show questions</Button>}</div>}
      {noFac > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><b>{noFac} record{noFac > 1 ? 's have' : ' has'} no facility.</b> Use Edit to assign one, or choose facilities before the next extraction.</div>}
      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {TABS.filter((k) => k !== 'unreadable' || counts[k] > 0).map((k) => <button key={k} type="button" className={`rounded-full border px-3 py-1 text-sm ${filter === k ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-900' : 'border-stone-200 text-stone-600'}`} onClick={() => { setFilter(k); setPage(0); }} data-testid={`ocr-tab-${k}`}>{k === 'pending' ? 'To do' : k === 'all' ? 'All' : STATUS_LABEL[k]} <span className="text-xs text-stone-500">{counts[k] || 0}</span></button>)}
        </div>
        {sel.size > 0 && <div className="flex items-center gap-2 border-b bg-emerald-50/60 p-2 text-sm"><b>{sel.size} selected</b><Button size="sm" onClick={() => setReview([...sel], 'approved')} data-testid="ocr-bulk-approve">Approve</Button><Button size="sm" variant="outline" onClick={() => setReview([...sel], 'rejected')} data-testid="ocr-bulk-reject">Reject</Button><Button size="sm" variant="ghost" onClick={() => setReview([...sel], 'reset')}>Reset</Button><Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear selection</Button></div>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-stone-50 text-left text-xs text-stone-500">
          <th className="p-2"><input type="checkbox" aria-label="Select page" checked={slice.length > 0 && slice.every((r) => sel.has(r.row_id))} onChange={(e) => setSel((s) => { const n = new Set(s); slice.forEach((r) => (e.target.checked ? n.add(r.row_id) : n.delete(r.row_id))); return n; })} data-testid="ocr-select-all" /></th>
          <th className="p-2">Line item</th><th className="p-2">Quantity</th><th className="p-2">Classification</th><th className="p-2">Facility · period</th><th className="p-2">Confidence · status</th><th className="p-2" /></tr></thead>
          <tbody>{slice.length ? slice.map((r) => <React.Fragment key={r.row_id}>{rowEl(r)}{(kids[r.row_id] || []).map((k) => rowEl(k, true))}</React.Fragment>) : <tr><td colSpan={8} className="p-8 text-center text-stone-500" data-testid="ocr-no-rows">No records match</td></tr>}</tbody></table></div>
        <div className="flex items-center justify-between border-t p-3 text-sm text-stone-600"><span>{parents.length} line{parents.length === 1 ? '' : 's'} (+ linked rows) · page {Math.min(page, pages - 1) + 1} of {pages}</span>
          <span className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button></span></div>
      </div>
      {dlg?.type === 'edit' && <EditDialog row={dlg.row} meta={meta} jobOf={jobOf} api={api} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); load(); }} />}
      {dlg?.type === 'factor' && <FactorDialog row={dlg.row} jobOf={jobOf} api={api} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); load(); }} />}
      {saveRes && (
        <Dialog open onOpenChange={(o) => !o && setSaveRes(null)}>
          <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" data-testid="ocr-save-result">
            <DialogHeader><DialogTitle>{saveRes.saved} saved{saveRes.failed.length ? `, ${saveRes.failed.length} not saved` : ''}</DialogTitle></DialogHeader>
            {saveRes.saved > 0 && <p className="text-sm text-emerald-800">Each saved line is now a GHG emission record (with its calculation) or a Water withdrawal record, with the source document attached as evidence. Find them under Emissions and Environment > Water.</p>}
            {saveRes.failed.map((f) => (
              <div key={f.row_id} className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm" data-testid={`ocr-save-failed-${f.row_id}`}><b>{f.label}</b><div className="text-rose-800">{f.reason}</div>
                {f.needs_factor && <Button size="sm" variant="outline" className="mt-1" onClick={() => { const r = rows.find((x) => x.row_id === f.row_id || x._rid === f.row_id); setSaveRes(null); if (r) setDlg({ type: 'factor', row: r }); }}>Choose emission factor</Button>}</div>))}
          </DialogContent>
        </Dialog>)}
      {dlg?.type === 'why' && <WhyDialog row={dlg.row} actLabel={actLabel} jobOf={jobOf} api={api} onClose={() => setDlg(null)} />}
      {dlg?.type === 'evidence' && <EvidenceDialog row={dlg.row} jobOf={jobOf} api={api} onClose={() => setDlg(null)} />}
      {dlg?.type === 'docs' && <DocsDialog docs={docs} skipped={jobMeta.skipped || []} onClose={() => setDlg(null)} />}
    </div>
  );
};
