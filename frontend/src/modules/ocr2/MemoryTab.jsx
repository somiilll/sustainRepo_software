import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { errText } from './api';

export const MemoryTab = ({ api, meta }) => {
  const [list, setList] = useState(null);
  const load = useCallback(() => api.memory().then(setList).catch((e) => toast.error(errText(e))), [api]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); } catch (e) { toast.error(errText(e)); } load(); };
  const label = (id) => meta.activities.find((a) => a.id === id)?.label || id;
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
              <td className="p-2">{!m.editable ? <span className={m.means_label?.startsWith('Retired') ? 'text-xs text-stone-400' : 'text-xs font-medium'} data-testid={`ocr-memory-means-${m.key}`}>{m.means_label}</span> : <select className="max-w-[300px] rounded border border-stone-300 px-1 py-1 text-xs" value={m.activity_id} onChange={(e) => act(() => api.change(m.key, e.target.value), 'Decision changed')}>{meta.activities.some((a) => a.id === m.activity_id) ? null : <option value={m.activity_id}>{label(m.activity_id)}</option>}{meta.activities.map((a) => <option key={a.id} value={a.id}>{a.label.slice(0, 90)}</option>)}</select>}</td>
              <td className="p-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${m.confirmed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{m.confirmed ? 'Confirmed' : 'Unconfirmed (AI)'}</span></td>
              <td className="p-2">{m.hits}×</td>
              <td className="p-2"><div className="flex gap-1">{m.scope === 'vendor' && <Button size="sm" variant="outline" onClick={() => act(() => api.share(m.key), 'Now applies to every vendor')} data-testid={`ocr-memory-share-${m.key}`}>Use for all vendors</Button>}<Button size="sm" variant="ghost" onClick={() => act(() => api.forget(m.key), 'Decision undone')} data-testid={`ocr-memory-forget-${m.key}`}>Undo</Button></div></td>
            </tr>))}</tbody></table></div>)}
    </div>
  );
};
