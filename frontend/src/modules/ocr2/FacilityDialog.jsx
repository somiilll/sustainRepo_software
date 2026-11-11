import React, { useMemo, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { fileKind } from './utils';

const NONE = '__none';
const DEFAULT_LABEL = 'Default facility for rows without a facility';
const SUGGEST = { 'exact name': 'matched by name', 'known alias': 'matched by known alias', 'you chose this before': 'you chose this before', 'facility name': 'matched by name', 'name in address/text': 'matched by name', 'address keyword': 'matched by address', 'consumer/meter number': 'matched by meter number' };

const FacSelect = ({ facs, value, onChange, noneLabel, testId, placeholder = 'Select facility' }) => (
  <select className="w-56 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm" value={value || ''} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
    <option value="">{placeholder}</option>
    {facs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    <option value={NONE}>{noneLabel}</option>
  </select>
);

const Suggestion = ({ s, onUse }) => {
  if (!s) return <div className="flex items-center gap-1 text-xs text-amber-700"><TriangleAlert className="h-3 w-3" />no match - choose one</div>;
  if (s.confirm) {
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs text-amber-700"><TriangleAlert className="h-3 w-3" />looks similar to <b>{s.name}</b> - please confirm
        <button type="button" className="rounded border border-amber-300 px-1.5 py-0.5 text-amber-800 hover:bg-amber-50" onClick={onUse} data-testid="ocr-fac-use-suggestion">Use {s.name}</button></div>
    );
  }
  return <div className="flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3 w-3" />{SUGGEST[s.method] || s.method}</div>;
};

export const FacilityDialog = ({ files, peek, onCancel, onConfirm }) => {
  const facs = peek.facilities || [];
  const info = useMemo(() => Object.fromEntries((peek.files || []).map((f) => [f.file, f])), [peek]);
  const cards = useMemo(() => files.map((name) => {
    const pv = info[name] || {};
    const cols = (pv.tables || []).filter((t) => t.names?.length);
    const names = [...new Map(cols.flatMap((t) => t.names).map((n) => [n.name, n])).values()];
    const sug = (pv.sheets || []).filter((x) => x.suggestion);
    return { name, kind: fileKind(name), names, sheets: new Set(sug.map((x) => x.suggestion.id)).size >= 2 ? sug : [], rows: (pv.tables || []).reduce((a, t) => a + t.rows, 0), col: cols[0]?.facility_column };
  }), [files, info]);
  const initial = useMemo(() => {
    const s = {};
    cards.forEach((c) => {
      c.names.forEach((n, k) => { s[`${c.name}|n|${k}`] = n.suggestion && !n.suggestion.confirm ? n.suggestion.id : ''; });
      c.sheets.forEach((x, k) => { s[`${c.name}|sh|${k}`] = x.suggestion.id; });
    });
    return s;
  }, [cards]);
  const [sel, setSel] = useState(initial);
  const [dflt, setDflt] = useState({});
  const [all, setAll] = useState('');
  const set = (k, v) => setSel((s) => ({ ...s, [k]: v }));
  const val = (v) => (v === NONE ? null : v);
  const ready = Object.values(sel).every(Boolean);

  const confirm = () => {
    const out = {};
    cards.forEach((c) => {
      const o = {};
      if (c.names.length) { o.map = {}; c.names.forEach((n, k) => { o.map[n.name] = val(sel[`${c.name}|n|${k}`]); }); }
      else if (c.sheets.length) { o.sheets = {}; c.sheets.forEach((x, k) => { o.sheets[x.sheet] = val(sel[`${c.name}|sh|${k}`]); }); }
      const d = dflt[c.name] ?? all;
      if (d && d !== NONE) o.default = d;
      out[c.name] = o;
    });
    onConfirm(out);
  };

  if (!facs.length) {
    return (
      <Dialog open onOpenChange={(o) => !o && onCancel()}>
        <DialogContent data-testid="ocr-facility-dialog">
          <DialogHeader><DialogTitle>Assign facilities</DialogTitle></DialogHeader>
          <p className="text-sm text-stone-600">You have not added any facilities yet, so extracted lines cannot be assigned to one. Add your sites in Facilities, or continue and assign them later in Review.</p>
          <DialogFooter><Button variant="outline" onClick={onCancel}>Cancel</Button><Button onClick={() => onConfirm({})} data-testid="ocr-facility-continue">Continue without</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto" data-testid="ocr-facility-dialog">
        <DialogHeader><DialogTitle>Assign facilities</DialogTitle></DialogHeader>
        <p className="text-sm text-stone-500">A facility named in a row is always used. Names we only partly recognise need your confirmation. The default below is used only for rows that name no facility.</p>
        <label className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <b>{DEFAULT_LABEL} (all files)</b>
          <FacSelect facs={facs} value={all} onChange={setAll} noneLabel="Leave unassigned" placeholder="No default" testId="ocr-fac-all" />
        </label>
        {cards.map((c) => (
          <div key={c.name} className="rounded-lg border border-stone-200 p-3">
            <b className="text-sm">{c.name}</b>
            <div className="mb-2 text-xs text-stone-500">{c.names.length ? `Lists ${c.names.length} facilit${c.names.length > 1 ? 'ies' : 'y'} ${c.col ? `in the "${c.col}" column` : 'in the row text'} - check each match` : c.sheets.length ? 'Sheets look like different facilities' : c.kind === 'sheet' ? `${c.rows} rows` : 'Document'}</div>
            {c.names.map((n, k) => (
              <div key={n.name} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 py-2">
                <div className="text-sm"><b>{n.name}</b><span className="text-stone-500"> · {n.count} line{n.count > 1 ? 's' : ''}</span>
                  <Suggestion s={n.suggestion} onUse={() => set(`${c.name}|n|${k}`, n.suggestion.id)} /></div>
                <FacSelect facs={facs} value={sel[`${c.name}|n|${k}`]} onChange={(v) => set(`${c.name}|n|${k}`, v)} noneLabel="Leave unassigned" testId={`ocr-fac-${c.name}-${k}`} />
              </div>
            ))}
            {!c.names.length && c.sheets.map((x, k) => (
              <div key={x.sheet} className="flex items-center justify-between gap-2 border-t border-stone-100 py-2"><b className="text-sm">Sheet: {x.sheet}</b>
                <FacSelect facs={facs} value={sel[`${c.name}|sh|${k}`]} onChange={(v) => set(`${c.name}|sh|${k}`, v)} noneLabel="Leave unassigned" testId={`ocr-fac-${c.name}-sheet-${k}`} /></div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 py-2"><span className="text-sm text-stone-600">{DEFAULT_LABEL}</span>
              <FacSelect facs={facs} value={dflt[c.name] ?? all} onChange={(v) => setDflt((d) => ({ ...d, [c.name]: v }))} noneLabel="Leave unassigned" placeholder="No default" testId={`ocr-fac-default-${c.name}`} /></div>
          </div>
        ))}
        <DialogFooter><Button variant="outline" onClick={onCancel} data-testid="ocr-fac-cancel">Cancel</Button><Button disabled={!ready} onClick={confirm} data-testid="ocr-fac-start">Start extraction</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
