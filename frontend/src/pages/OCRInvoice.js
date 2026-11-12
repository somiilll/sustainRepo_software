import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Coins, FileText, ListChecks, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../contexts/AuthContext';
import { makeOcrApi, errText } from '../modules/ocr2/api';
import { CreditsTab } from '../modules/ocr2/CreditsTab';
import { MemoryTab } from '../modules/ocr2/MemoryTab';
import { ReviewTab } from '../modules/ocr2/ReviewTab';
import { UploadTab } from '../modules/ocr2/UploadTab';
import { fmtCr } from '../modules/ocr2/utils';

const TABS = [['upload', 'Upload', UploadCloud], ['review', 'Review', ListChecks], ['credits', 'Credits & usage', Coins], ['memory', 'Learned decisions', Brain]];

const parseHash = () => {
  const [view, arg] = (window.location.hash.slice(1) || 'upload').split('/');
  return { view: TABS.some(([k]) => k === view) ? view : 'upload', arg: arg || null };
};

export default function OCRInvoice() {
  const { getAuthHeader } = useAuth();
  const headers = getAuthHeader();
  const api = useMemo(() => makeOcrApi(headers), [JSON.stringify(headers)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [route, setRoute] = useState(parseHash());
  const [meta, setMeta] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => { const f = () => setRoute(parseHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (view, arg) => { window.location.hash = arg ? `${view}/${arg}` : view; };
  const refreshUsage = useCallback(() => api.usage(30).then(setUsage).catch(() => {}), [api]);
  useEffect(() => {
    api.meta().then(setMeta).catch((e) => toast.error(errText(e, 'OCR could not be loaded')));
    refreshUsage();
  }, [api, refreshUsage]);

  const b = usage?.balance;
  return (
    <main className="mx-auto w-full max-w-[1700px] space-y-6 pb-12" data-testid="ocr-invoice-page">
      <ModulePageHeader
        title="OCR Extraction"
        icon={FileText}
        iconClassName="border-teal-200 bg-teal-50 text-teal-700"
        testId="ocr-invoice"
        aside={b && <button type="button" onClick={() => go('credits')} className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm shadow-sm" data-testid="ocr-credits-badge"><Coins className="h-4 w-4 text-amber-600" /><b>{fmtCr(b.remaining)}</b> credits left</button>}
      />
      <nav className="flex flex-wrap gap-1 border-b border-stone-200" data-testid="ocr-tabs">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => go(k)} className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${route.view === k ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-stone-500 hover:text-stone-800'}`} data-testid={`ocr-tab-nav-${k}`}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </nav>
      {!meta ? <div className="h-40 animate-pulse rounded-xl bg-stone-100" /> : <>
        {route.view === 'upload' && <UploadTab api={api} usage={usage} refreshUsage={refreshUsage} onOpenJob={(id) => go('review', id)} />}
        {route.view === 'review' && <ReviewTab key={route.arg || 'inbox'} api={api} meta={meta} jobId={route.arg} onOpenJob={(id) => go('review', id)} onBackToInbox={() => go('review')} goUpload={() => go('upload')} />}
        {route.view === 'credits' && <CreditsTab api={api} usage={usage} setUsage={setUsage} />}
        {route.view === 'memory' && <MemoryTab api={api} meta={meta} />}
      </>}
    </main>
  );
}
