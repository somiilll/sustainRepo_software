import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, RotateCw, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { errText } from './api';
import { STATUS_BAR, STATUS_LABEL, STATUS_ORDER, SCOPE_LABEL, ago, fileKind, fmtCr, fmtWait, mmss } from './utils';
import { FacilityDialog } from './FacilityDialog';

const KIND_ICON = { pdf: FileText, img: ImageIcon, sheet: FileSpreadsheet, other: FileText };
const STAGES = [['queued', 'Uploaded'], ['reading', 'Reading documents'], ['classifying', 'Classifying lines'], ['building rows', 'Building records'], ['done', 'Ready to review']];

const targetPct = (p) => {
  const st = p.stage || 'queued';
  if (st === 'queued') return [2, 5];
  if (st === 'reading') {
    const f = (p.files_done || 0) / Math.max(p.files_total || 1, 1);
    return [5 + 55 * f, 5 + 55 * Math.min(1, f + 1 / Math.max(p.files_total || 1, 1))];
  }
  if (st === 'classifying') return [60 + 33 * ((p.done || 0) / Math.max(p.total || 1, 1)), 93];
  if (st === 'building rows') return [94, 99];
  return [100, 100];
};

const countPdfPages = async (f) => {
  if (f.size > 25e6) return 3;
  try {
    const t = new TextDecoder('latin1').decode(await f.arrayBuffer());
    return Math.min(Math.max((t.match(/\/Type\s*\/Page(?![s\w])/g) || []).length, 1), 10);
  } catch { return 2; }
};

const LiveCard = ({ j, onCancel }) => {
  const p = j.progress || {};
  const queued = j.status === 'queued';
  const stI = Math.max(0, STAGES.findIndex(([k]) => k === (p.stage || 'queued')));
  const [lo, hi] = targetPct(p);
  const pct = Math.min(hi - 0.5, Math.max(lo, lo + (hi - lo) * 0.3));
  const elapsed = Math.max(0, Date.now() / 1000 - j.created);
  const msg = queued ? (j.wait_seconds ? `Number ${j.position || 1} in line · about ${fmtWait(j.wait_seconds)} until it starts` : 'Starting now...')
    : p.stage === 'reading' ? (p.message ? `Read ${p.message}` : `Reading ${p.files_total || j.names.length} file(s)...`)
      : p.stage === 'classifying' ? `${p.done ?? 0} of ${p.total ?? '?'} distinct items classified`
        : p.stage === 'building rows' ? 'Mapping formula fields, adding linked rows, running checks' : 'Starting...';
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm" data-testid={`ocr-live-${j.job_id}`}>
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
        <h3 className="font-semibold text-stone-900">{queued ? (j.wait_seconds ? 'Waiting in line' : 'Starting') : `Extracting ${j.names.length} file${j.names.length > 1 ? 's' : ''}`}</h3>
        <span className="text-sm tabular-nums text-stone-500">{mmss(elapsed)}</span>
        <span className="ml-auto rounded-full border border-stone-200 px-2 py-0.5 text-xs text-stone-600">{j.mode === 'think' ? 'Deep read' : 'Standard'}</span>
      </div>
      <p className="mt-1 truncate text-sm text-stone-500">{j.names.slice(0, 4).join(', ')}{j.names.length > 4 ? ` +${j.names.length - 4} more` : ''}</p>
      {!queued && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {STAGES.map(([k, l], i) => (
            <span key={k} className={`flex items-center gap-1 ${i < stI ? 'text-emerald-700' : i === stI ? 'font-semibold text-stone-900' : 'text-stone-400'}`}>
              {i < stI ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className={`h-2 w-2 rounded-full ${i === stI ? 'bg-emerald-600' : 'bg-stone-300'}`} />}{l}{i < STAGES.length - 1 && <span className="ml-1 text-stone-300">›</span>}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-emerald-600 transition-all duration-1000" style={{ width: `${queued ? 3 : pct}%` }} /></div>
      <div className="mt-2 flex items-center justify-between text-sm text-stone-600"><span>{msg}</span>{!queued && <b>{Math.round(pct)}%</b>}</div>
      {!queued && (
        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs text-stone-500">
          <div className="rounded-lg bg-stone-50 p-2">Files read<div className="text-base font-semibold text-stone-900">{p.files_done ?? 0} / {p.files_total ?? j.names.length}</div></div>
          <div className="rounded-lg bg-stone-50 p-2">Lines found<div className="text-base font-semibold text-stone-900">{p.items ?? 0}</div></div>
          <div className="rounded-lg bg-stone-50 p-2">Credits used<div className="text-base font-semibold text-stone-900">{fmtCr(p.credits ?? 0)}</div></div>
        </div>
      )}
      <Button variant="ghost" size="sm" className="mt-3" disabled={j.cancelling} onClick={() => onCancel(j.job_id)} data-testid={`ocr-cancel-${j.job_id}`}><X className="mr-1 h-4 w-4" />{j.cancelling ? 'Cancelling...' : 'Cancel'}</Button>
    </div>
  );
};

const DoneCard = ({ j, onOpen, onDismiss }) => {
  const rv = j.review || {};
  const total = Object.values(rv).reduce((a, b) => a + b, 0);
  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-5 shadow-sm" data-testid={`ocr-done-${j.job_id}`}>
      <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><h3 className="font-semibold text-emerald-950">Extraction complete</h3><span className="text-sm text-stone-500">{j.metrics?.seconds ?? ''}s</span></div>
      <p className="mt-1 truncate text-sm text-stone-600">{j.names.join(', ')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-center text-xs text-stone-500 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-2">Lines<div className="text-base font-semibold text-stone-900">{total}</div></div>
        <div className="rounded-lg bg-white p-2">Ready<div className="text-base font-semibold text-green-700">{rv.ready || 0}</div></div>
        <div className="rounded-lg bg-white p-2">Need you<div className="text-base font-semibold text-amber-700">{(rv.needs_attention || 0) + (rv.ask || 0)}</div></div>
        <div className="rounded-lg bg-white p-2">Credits used<div className="text-base font-semibold text-stone-900">{fmtCr(j.credits)}</div></div>
      </div>
      <div className="mt-4 flex gap-2"><Button onClick={() => onOpen(j.job_id)} data-testid={`ocr-review-now-${j.job_id}`}>Review now</Button><Button variant="ghost" onClick={() => onDismiss(j.job_id)}>Dismiss</Button></div>
    </div>
  );
};

const JobCard = ({ j, onOpen, onDelete, onRetry }) => {
  const rv = j.review || {};
  const tot = Object.values(rv).reduce((a, b) => a + b, 0) || 1;
  const failed = ['failed', 'cancelled', 'interrupted'].includes(j.status);
  const m = j.metrics || {};
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${failed ? 'border-rose-200' : 'cursor-pointer border-stone-200 hover:border-emerald-300'}`} onClick={() => !failed && onOpen(j.job_id)} data-testid={`ocr-job-${j.job_id}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><b className="block truncate text-stone-900" title={j.names.join(', ')}>{j.names[0]}{j.names.length > 1 && <span className="font-normal text-stone-500"> +{j.names.length - 1} more</span>}</b>
          <span className="text-xs text-stone-500">{failed ? `${j.status[0].toUpperCase()}${j.status.slice(1)}` : `${m.rows ?? 0} records from ${m.items ?? 0} lines`} · {ago(j.created)}{!failed && ` · ${j.mode === 'think' ? 'Deep read' : 'Standard'}`}{failed && j.credits ? ` · ${fmtCr(j.credits)} credits used` : ''}</span></div>
        <button type="button" className="rounded p-1 text-stone-400 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); onDelete(j.job_id); }} aria-label="Delete" data-testid={`ocr-delete-${j.job_id}`}><Trash2 className="h-4 w-4" /></button>
      </div>
      {failed ? (
        <><p className="mt-2 text-sm text-rose-700">{j.error}</p><Button size="sm" variant="outline" className="mt-2" onClick={(e) => { e.stopPropagation(); onRetry(j.job_id); }} data-testid={`ocr-retry-${j.job_id}`}><RotateCw className="mr-1 h-3.5 w-3.5" />Retry</Button></>
      ) : (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-stone-100">{STATUS_ORDER.filter((k) => rv[k]).map((k) => <i key={k} title={`${rv[k]} ${STATUS_LABEL[k]}`} style={{ width: `${(100 * rv[k]) / tot}%`, background: STATUS_BAR[k] }} />)}</div>
          <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-stone-600">{STATUS_ORDER.filter((k) => rv[k]).map((k) => <span key={k}>{rv[k]} {STATUS_LABEL[k]}</span>)}</div>
          <div className="mt-2 flex flex-wrap gap-1">{Object.entries(j.scopes || {}).sort().map(([k, v]) => <span key={k} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{SCOPE_LABEL[k] || k} · {v}</span>)}</div>
          <div className="mt-3 text-xs text-stone-500">{fmtCr(j.credits)} credits</div>
        </>
      )}
    </div>
  );
};

export const UploadTab = ({ api, usage, refreshUsage, onOpenJob }) => {
  const [chosen, setChosen] = useState([]);
  const [mode, setMode] = useState('fast');
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState(null);
  const [fresh, setFresh] = useState(new Set());
  const [facAsk, setFacAsk] = useState(null);
  const [reuse, setReuse] = useState(null);
  const running = useRef(new Set());
  const fileInput = useRef(null);

  const loadJobs = useCallback(async () => {
    try {
      const list = await api.jobs();
      const nowRunning = new Set(list.filter((j) => ['running', 'queued'].includes(j.status)).map((j) => j.job_id));
      let finished = false;
      running.current.forEach((id) => { if (!nowRunning.has(id)) { finished = true; setFresh((s) => new Set(s).add(id)); } });
      running.current = nowRunning;
      if (finished) refreshUsage();
      setJobs(list);
    } catch { /* keep the last list */ }
  }, [api, refreshUsage]);

  useEffect(() => { loadJobs(); const t = setInterval(loadJobs, 1500); return () => clearInterval(t); }, [loadJobs]);

  const addFiles = async (fs) => {
    const next = [...chosen];
    for (const f of fs) {
      if (next.some((c) => c.file.name === f.name && c.file.size === f.size)) continue;
      const k = fileKind(f.name);
      next.push({ file: f, pages: k === 'pdf' ? await countPdfPages(f) : k === 'img' ? 1 : 0 });
    }
    setChosen(next);
  };

  const submit = async (choices, force) => {
    try {
      const res = await api.start(chosen.map((c) => c.file), mode, choices, force);
      if (res.reused) { setReuse({ ...res, choices }); return; }
      setChosen([]);
      running.current.add(res.job_id);
      loadJobs();
    } catch (e) { toast.error(`Upload failed: ${errText(e)}`); }
    finally { setBusy(false); }
  };

  const start = async () => {
    setBusy(true);
    try {
      const sheets = chosen.filter((c) => fileKind(c.file.name) === 'sheet');
      const peek = sheets.length ? await api.preview(sheets.map((c) => c.file)) : { files: [], facilities: (await api.meta()).facilities };
      setFacAsk({ peek, files: chosen.map((c) => c.file.name) });
    } catch (e) { toast.error(`Could not read the files: ${errText(e)}`); setBusy(false); }
  };

  const est = usage?.estimate || { per_page_fast: 1.2, per_page_think: 27, per_item: 0.05, sec_per_page_fast: 10, sec_per_page_think: 25, sec_per_sheet: 4 };
  const pages = chosen.reduce((a, c) => a + c.pages, 0);
  const sheetCount = chosen.filter((c) => fileKind(c.file.name) === 'sheet').length;
  const perFile = chosen.map((c) => (fileKind(c.file.name) === 'sheet' ? est.sec_per_sheet : c.pages * (mode === 'think' ? est.sec_per_page_think : est.sec_per_page_fast)));
  const secs = perFile.length ? 4 + Math.max(Math.max(...perFile), perFile.reduce((a, b) => a + b, 0) / 4) : 0;
  const lo = pages * (mode === 'think' ? est.per_page_think : est.per_page_fast) + pages * 3 * est.per_item;
  const hi = lo * 1.5 + sheetCount * 25 * est.per_item * 4;

  const live = (jobs || []).filter((j) => ['running', 'queued'].includes(j.status));
  const finished = (jobs || []).filter((j) => fresh.has(j.job_id) && j.status === 'done').slice(0, 2);
  const history = (jobs || []).filter((j) => !['running', 'queued'].includes(j.status));
  const del = async (id) => { if (window.confirm('Delete this extraction and its uploaded files? Credits already used stay on the usage page.')) { await api.remove(id); loadJobs(); } };
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); } catch (e) { toast.error(errText(e)); } loadJobs(); };

  return (
    <div className="space-y-6" data-testid="ocr-upload-tab">
      <div className="grid gap-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div
            className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-8 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
            role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); }} data-testid="ocr-dropzone"
          >
            <CloudUpload className="h-10 w-10 text-emerald-700" />
            <div className="mt-2 text-lg font-semibold text-stone-900">Drop files here or <span className="text-emerald-700 underline">browse</span></div>
            <div className="mt-1 text-sm text-stone-500">PDF invoices and bills · scans and phone photos · Excel and CSV registers · Hindi, Marathi and more</div>
            <div className="text-xs text-stone-400">Up to 10 pages per PDF · 50,000 rows per sheet · 30 files, 25 MB each</div>
            <input ref={fileInput} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.avif,.heic,.tif,.tiff,.xlsx,.xlsm,.xls,.csv" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} data-testid="ocr-file-input" />
          </div>
          {chosen.length > 0 && (
            <div className="divide-y rounded-lg border border-stone-200">
              {chosen.map((c, i) => { const K = KIND_ICON[fileKind(c.file.name)]; return (
                <div key={`${c.file.name}-${c.file.size}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <K className="h-4 w-4 text-stone-500" /><span className="min-w-0 flex-1 truncate font-medium">{c.file.name}</span>
                  <span className="text-xs text-stone-500">{(c.file.size / 1024).toFixed(c.file.size > 1e6 ? 0 : 1)} KB{c.pages ? ` · ${c.pages} page${c.pages > 1 ? 's' : ''}` : ''}</span>
                  <button type="button" onClick={() => setChosen(chosen.filter((_, n) => n !== i))} aria-label="Remove" data-testid={`ocr-remove-file-${i}`}><X className="h-4 w-4 text-stone-400 hover:text-rose-600" /></button>
                </div>); })}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {[['fast', Zap, 'Standard', 'Fast and low-cost. Pages whose numbers do not add up are re-read automatically.'], ['think', Sparkles, 'Deep read', 'The strongest model for every page. For faded scans and handwritten bills.']].map(([k, Icon, t, d]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`flex gap-3 rounded-lg border p-3 text-left ${mode === k ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`} data-testid={`ocr-mode-${k}`}>
                <Icon className="mt-0.5 h-5 w-5 text-emerald-700" /><div><b className="text-sm">{t}</b><p className="text-xs text-stone-500">{d}</p></div>
              </button>))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 text-sm text-stone-600" data-testid="ocr-estimate">
              {!chosen.length ? 'Choose files to see the estimated time and credits' : <><b>{chosen.length} file{chosen.length > 1 ? 's' : ''}</b>{pages ? ` · ${pages} page${pages > 1 ? 's' : ''}` : ''} · about <b>{fmtWait(secs)}</b> · estimated <b>{fmtCr(Math.max(lo, 0.1))}{hi > lo * 1.05 ? `-${fmtCr(hi)}` : ''} credits</b></>}
            </div>
            <Button size="lg" disabled={!chosen.length || busy} onClick={start} data-testid="ocr-start-button">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Start extraction</Button>
          </div>
        </div>
        <div className="rounded-lg bg-stone-50 p-4 text-sm">
          <h3 className="font-semibold text-stone-900">How it works</h3>
          <ol className="mt-3 space-y-3 text-stone-600">
            <li><b className="text-stone-900">Read.</b> Every line, quantity, unit, amount and date, with the page it came from.</li>
            <li><b className="text-stone-900">Classify.</b> Each line goes to the right scope, category and sub-category. Identical items are classified once.</li>
            <li><b className="text-stone-900">Prepare.</b> Units converted, T&amp;D and well-to-tank rows added, facility and period matched.</li>
            <li><b className="text-stone-900">You review.</b> Approve what is right and answer the few questions. Your corrections are remembered.</li>
          </ol>
        </div>
      </div>

      {(live.length > 0 || finished.length > 0) && (
        <div className="space-y-3">
          {live.map((j) => <LiveCard key={j.job_id} j={j} onCancel={(id) => act(() => api.cancel(id), 'Cancelling...')} />)}
          {finished.map((j) => <DoneCard key={j.job_id} j={j} onOpen={onOpenJob} onDismiss={(id) => setFresh((s) => { const n = new Set(s); n.delete(id); return n; })} />)}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-stone-900">Recent extractions {history.length > 0 && <span className="text-sm font-normal text-stone-500">· {history.length}</span>}</h2>
        {jobs === null ? <div className="h-24 animate-pulse rounded-xl bg-stone-100" /> : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500" data-testid="ocr-no-jobs">No extractions yet. Drop a bill above to start.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{history.map((j) => <JobCard key={j.job_id} j={j} onOpen={onOpenJob} onDelete={del} onRetry={(id) => act(() => api.retry(id), 'Back in line')} />)}</div>
        )}
      </div>

      {facAsk && <FacilityDialog files={chosen.map((c) => c.file.name)} peek={facAsk.peek} onCancel={() => { setFacAsk(null); setBusy(false); }} onConfirm={(choices) => { setFacAsk(null); submit(choices, false); }} />}
      <Dialog open={!!reuse} onOpenChange={(o) => { if (!o) setReuse(null); }}>
        <DialogContent data-testid="ocr-reuse-dialog">
          <DialogHeader><DialogTitle>Already extracted</DialogTitle></DialogHeader>
          <p className="text-sm text-stone-600">These exact files, with the same facilities, were extracted {reuse ? ago(reuse.created) : ''}. Open that result now (instant, no credits), or run them again (uses credits).</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { const c = reuse.choices; setReuse(null); setBusy(true); submit(c, true); }} data-testid="ocr-run-again">Run again</Button>
            <Button onClick={() => { const id = reuse.job_id; setReuse(null); setChosen([]); onOpenJob(id); }} data-testid="ocr-open-earlier">Open earlier result</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const InlineWarn = ({ children }) => <div className="flex items-start gap-2 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4" />{children}</div>;
