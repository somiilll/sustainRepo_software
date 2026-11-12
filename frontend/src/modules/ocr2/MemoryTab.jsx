import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { errText } from './api';

const FactorPicker = ({ api, current, onPick, testId }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  const box = useRef(null);
  useEffect(() => { if (open) { const t = setTimeout(() => api.memoryFactors(q).then(setOpts).catch(() => setOpts([])), 200); return () => clearTimeout(t); } }, [open, q, api]);
  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div className="relative" ref={box}>
      <button type="button" className="max-w-[320px] truncate rounded border border-stone-300 px-2 py-1 text-left text-xs" onClick={() => setOpen(!open)} data-testid={testId}>{current}</button>
      {open && <div className="absolute z-20 mt-1 w-[340px] rounded-lg border border-stone-200 bg-white p-2 shadow-lg">
        <input autoFocus className="mb-1 w-full rounded border border-stone-300 px-2 py-1 text-xs" placeholder="Search emission factors..." value={q} onChange={(e) => setQ(e.target.value)} data-testid={`${testId}-search`} />
        <div className="max-h-60 overflow-y-auto">{opts.length === 0 ? <div className="p-2 text-xs text-stone-500">No emission factors found</div> : opts.map((o) => <button type="button" key={o.id} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-stone-100" onClick={() => { setOpen(false); onPick(o.id); }}>{o.label}</button>)}</div>
      </div>}
    </div>
  );
};

export const MemoryTab = ({ api }) => {
  const [list, setList] = useState(null);
  const load = useCallback(() => api.memory().then(setList).catch((e) => toast.error(errText(e))), [api]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); } catch (e) { toast.error(errText(e)); } load(); };
  if (!list) return <div className="h-40 animate-pulse rounded-xl bg-stone-100" />;
  return (
    <div className="space-y-4" data-testid="ocr-memory-tab">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1" />
        {list.length > 0 && <Button variant="outline" onClick={() => window.confirm('Forget every learned decision? Saved sheet layouts are kept.') && act(() => api.clearMemory(), 'All decisions forgotten')} data-testid="ocr-memory-clear"><Trash2 className="mr-1 h-4 w-4" />Forget all decisions</Button>}
      </div>
      {list.length === 0 ? <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-500" data-testid="ocr-memory-empty">Nothing learned yet. Corrections and answers you give in Review are remembered here.</div> : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-sm"><thead><tr className="border-b bg-stone-50 text-left text-xs text-stone-500"><th className="p-2">Wording</th><th className="p-2">Applies to</th><th className="p-2">Means</th><th className="p-2">Status</th><th className="p-2">Used</th><th className="p-2" /></tr></thead>
          <tbody>{list.map((m) => (
            <tr key={m.key} className="border-b align-top" data-testid={`ocr-memory-${m.key}`}>
              <td className="p-2 font-medium">{m.wording}<div className="text-xs text-stone-500">{m.dimension}</div></td>
              <td className="p-2">{m.scope === 'vendor' ? `Vendor: ${m.vendor || '-'}` : 'Any vendor'}</td>
              <td className="p-2">{!m.editable ? <span className={m.means_label?.startsWith('Retired') ? 'text-xs text-stone-400' : 'text-xs font-medium'} data-testid={`ocr-memory-means-${m.key}`}>{m.means_label}</span> : <FactorPicker api={api} current={m.means_label} testId={`ocr-memory-means-pick-${m.key}`} onPick={(id) => act(() => api.change(m.key, id), 'Decision changed')} />}</td>
              <td className="p-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${m.confirmed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{m.confirmed ? 'Confirmed' : 'Unconfirmed (AI)'}</span></td>
              <td className="p-2">{m.hits}×</td>
              <td className="p-2"><div className="flex gap-1">{m.scope === 'vendor' && <Button size="sm" variant="outline" onClick={() => act(() => api.share(m.key), 'Now applies to every vendor')} data-testid={`ocr-memory-share-${m.key}`}>Use for all vendors</Button>}<Button size="sm" variant="ghost" onClick={() => act(() => api.forget(m.key), 'Decision undone')} data-testid={`ocr-memory-forget-${m.key}`}>Undo</Button></div></td>
            </tr>))}</tbody></table></div>)}
    </div>
  );
};
