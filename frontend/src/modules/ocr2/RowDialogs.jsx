import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { errText } from './api';
import { SOURCE_LABEL, STATUS_CLASS, TRUST_CLASS, fmtDate, fmtN } from './utils';

export const TrustBadge = ({ t }) => (t ? <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TRUST_CLASS[t.level]}`} title={(t.reasons || []).join('\n')}>{{ high: 'Ready', check: 'Check', needs_you: 'Needs input' }[t.level] || t.label}</span> : null);

const LEVEL_TEXT = { certain: 'text-emerald-700', likely: 'text-amber-600', uncertain: 'text-rose-600', guess: 'text-rose-600' };
const ACTION = { approved: 'Approved', rejected: 'Rejected', reset: 'Reset to review', edited: 'Edited', approval_blocked: 'Approval refused' };
export const WhyDialog = ({ row, actLabel, jobOf, api, onClose }) => {
  const [hist, setHist] = useState(null);
  useEffect(() => { api.audit(jobOf(row), row.item_id).then(setHist).catch(() => setHist([])); }, [api, row, jobOf]);
  const d = row.decision || {}; const c = row.calc || {};
  const rowKV = (k, v) => <><dt className="text-stone-500">{k}</dt><dd className="min-w-0 break-words">{v}</dd></>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto" data-testid="ocr-why-dialog">
        <DialogHeader><DialogTitle>Why this classification</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm">
          {rowKV('Reason', d.reason)}
          {d.alternatives?.length > 0 && rowKV('Alternatives', d.alternatives.map((a) => `${actLabel(a.activity_id)}${a.p != null ? ` (${Math.round(100 * a.p)}%)` : ''}`).join(', '))}
          {rowKV('GHG', `${row.ghg?.scope_label} › ${row.ghg?.category_label} › ${row.ghg?.subcategory_label}`)}
          {rowKV('Quantity', `As printed: ${row.raw_quantity != null ? `${fmtN(row.raw_quantity, 4)} ${row.raw_unit || ''}` : 'none'}${row.quantity != null ? ` · in calculation: ${fmtN(row.quantity, 4)} ${row.unit || ''}` : ''}`)}
          {rowKV('Fields', <code className="whitespace-pre-wrap text-xs">{JSON.stringify(c.fields || {}, null, 1)}</code>)}
          {row.trust && rowKV('Trust', <><TrustBadge t={row.trust} /><ul className="mt-1 list-disc pl-5 text-xs text-stone-600">{row.trust.reasons.map((x) => <li key={x}>{x}</li>)}</ul></>)}
          {rowKV('Basis', <span data-testid="ocr-why-basis">{Object.entries(row.basis || {}).map(([k, v], i) => <span key={k}>{i > 0 && ' · '}<span className="capitalize">{k}</span>: <b className={LEVEL_TEXT[v.level] || ''}>{v.level}</b>{k !== 'classification' && (v.tags || []).length ? ` (${v.tags.map((t) => t.replace(/_/g, ' ')).join(', ')})` : ''}</span>)}</span>)}
          {rowKV('Facility match', `${row.facility?.name || 'none'} (${row.facility?.method})`)}
          {rowKV('Period', `${row.reporting_period || 'none'} (${row.period?.method})`)}
        </dl>
        <div className="rounded-lg border border-stone-200 p-3"><h3 className="mb-2 text-sm font-semibold">History</h3>
          {hist === null ? <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" /> : hist.length === 0 ? <p className="text-sm text-stone-500">No changes yet. Approvals, edits and answers are recorded here.</p> : hist.map((e) => (
            <div key={e.id} className="mb-2 text-sm"><b>{ACTION[e.action] || e.action}</b> <span className="text-stone-500">by {e.actor} · {fmtDate(e.ts)}</span>
              {Object.entries(e.changes || {}).filter(([k]) => k !== 'emission_records').map(([k, [a, b]]) => <div key={k} className="text-xs text-stone-500">{k.replace('_', ' ')}: {a == null || a === '' ? 'empty' : String(a)} → <b>{b == null || b === '' ? 'empty' : String(b)}</b></div>)}
              {e.note && <div className="text-xs text-stone-500">{e.note === 'Saved as emission / water records' ? 'Saved as emission' : e.note}</div>}</div>))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const EvidenceDialog = ({ row, jobOf, api, onClose }) => {
  const src = row.source || {}; const ev = row.evidence || [];
  const line = ev.find((e) => e.field === 'line');
  const quote = (line || ev[0] || {}).quote || '';
  const firstPage = line?.page || src.page || 1;
  const [page, setPage] = useState(firstPage);
  const [img, setImg] = useState(null);
  const [hl, setHl] = useState('');
  const isDoc = src.kind === 'document';
  useEffect(() => {
    if (!isDoc) return undefined;
    let url; let dead = false;
    api.page(jobOf(row), row.file, page, page === firstPage ? quote : '').then((r) => {
      if (dead) return;
      url = URL.createObjectURL(r.data); setImg(url);
      const h = r.headers['x-highlights'];
      setHl(h == null ? '' : h === '0' ? '(quote not found in the text layer - scanned page)' : `${h} match(es) highlighted`);
    }).catch((e) => toast.error(errText(e, 'Could not load the page')));
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [api, row, jobOf, page, firstPage, quote, isDoc]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="ocr-evidence-dialog">
        <DialogHeader><DialogTitle>Where this came from</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-stone-500">File</dt><dd>{row.file}</dd>
          {src.sheet ? <><dt className="text-stone-500">Sheet / row</dt><dd>{src.sheet}, Excel row {src.row}{src.hidden_sheet ? ' (hidden sheet)' : ''}</dd></> : <><dt className="text-stone-500">Page</dt><dd>{page}</dd></>}
          <dt className="text-stone-500">Printed text</dt><dd>{row.original_text}</dd>
          {row.invoice_number && <><dt className="text-stone-500">Invoice no. / date</dt><dd>{row.invoice_number} · {row.date || ''}</dd></>}
        </dl>
        {ev.slice(0, 6).map((e) => <div key={`${e.field}${e.page}${e.quote}`} className="rounded border-l-4 border-amber-400 bg-amber-50 p-2 text-sm"><span className="text-xs text-stone-500">{e.field} · p.{e.page}</span><br />{e.quote}</div>)}
        {isDoc ? (
          <>
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</Button><span className="text-sm text-stone-500">Page {page}</span><Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>Next page</Button><span className="text-xs text-stone-500">{hl}</span></div>
            {img ? <img src={img} alt="Document page" className="w-full rounded border border-stone-200" data-testid="ocr-evidence-image" /> : <div className="h-40 animate-pulse rounded bg-stone-100" />}
          </>
        ) : <p className="text-sm text-stone-500">Spreadsheet rows have no page image - the sheet and Excel row number identify the source.</p>}
      </DialogContent>
    </Dialog>
  );
};

export const FactorDialog = ({ row, jobOf, api, onClose, onSaved }) => {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => api.factors(jobOf(row), row._rid || row.row_id, q).then((d) => { setData(d); setErr(''); }).catch((e) => setErr(errText(e))), 250);
    return () => clearTimeout(t);
  }, [api, row, jobOf, q]);
  const pick = async (o) => {
    try { await api.chooseFactor(jobOf(row), row._rid || row.row_id, { collection: o.collection, id: o.id, remember }); toast.success(`Emission factor set: ${o.label}`); onSaved(); } catch (e) { toast.error(errText(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto" data-testid="ocr-factor-dialog">
        <DialogHeader><DialogTitle>Emission factor</DialogTitle></DialogHeader>
        <p className="text-sm text-stone-600">{row.extracted_item} · <b>{row.ghg?.category_label}</b> › {row.ghg?.subcategory_label}</p>
        {row.review?.save_error && <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{row.review.save_error}</div>}
        {data?.current && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm">Currently used: <b>{data.current.label}</b> · {data.current.source || ''} {data.current.region || ''} {data.current.year || ''}</div>}
        <input className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="Search factors in this category..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="ocr-factor-search" />
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <div className="max-h-[40vh] divide-y overflow-y-auto rounded-lg border border-stone-200" data-testid="ocr-factor-list">
          {!data ? <div className="h-16 animate-pulse bg-stone-100" /> : data.options.length === 0 ? <p className="p-4 text-sm text-stone-500">No factors match.</p> : data.options.map((o) => (
            <button key={o.id} type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => pick(o)} data-testid={`ocr-factor-option-${o.id}`}>
              <span className="font-medium">{o.label}</span><span className="shrink-0 text-xs text-stone-500">{[o.source, o.region, o.year, o.unit].filter(Boolean).join(' · ')}</span>
            </button>))}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="ocr-factor-remember" />Use this factor for similar lines in future</label>
      </DialogContent>
    </Dialog>
  );
};
