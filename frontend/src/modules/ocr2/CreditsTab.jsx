import React, { useCallback, useEffect, useState } from 'react';
import { Coins, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { errText } from './api';
import { fmtCr, fmtDate, fmtN } from './utils';


const Kpi = ({ label, value, unit, foot, testId }) => (
  <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" data-testid={testId}>
    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
    <div className="mt-1 text-2xl font-semibold text-stone-900">{value} <small className="text-sm font-normal text-stone-500">{unit}</small></div>
    {foot && <div className="mt-1 text-xs text-stone-500">{foot}</div>}
  </div>
);

export const CreditsTab = ({ api, usage, setUsage }) => {
  const [days, setDays] = useState(30);
  const load = useCallback(() => api.usage(days).then(setUsage).catch((e) => toast.error(errText(e))), [api, days, setUsage]);
  useEffect(() => { load(); }, [load]);
  if (!usage) return <div className="h-40 animate-pulse rounded-xl bg-stone-100" />;
  const b = usage.balance; const t = usage.summary.total; const jobs = usage.by_job;
  const rows = jobs.reduce((a, j) => a + (j.rows || 0), 0); const files = jobs.reduce((a, j) => a + (j.files || 0), 0);
  const topUp = async () => {
    const v = window.prompt('How many credits to add?', '1000');
    if (!v) return;
    try { await api.grant(Number(v), 'Top-up'); toast.success('Credits added'); load(); } catch (e) { toast.error(errText(e)); }
  };
  return (
    <div className="space-y-5" data-testid="ocr-credits-tab">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">Credits &amp; usage</h2><p className="text-sm text-stone-500">Every AI call - reading, layout mapping and classification - is priced the same way and counted in credits.</p></div>
        <div className="flex rounded-lg border border-stone-200 p-0.5">{[7, 30, 90].map((d) => <button key={d} type="button" className={`rounded-md px-3 py-1 text-sm ${days === d ? 'bg-emerald-700 text-white' : 'text-stone-600'}`} onClick={() => setDays(d)} data-testid={`ocr-days-${d}`}>{d} days</button>)}</div>
        {usage.can_grant && <Button onClick={topUp} data-testid="ocr-add-credits"><Plus className="mr-1 h-4 w-4" />Add credits</Button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi testId="ocr-kpi-left" label="Credits left" value={fmtCr(b.remaining)} unit={`of ${fmtCr(b.granted)}`} foot={`${fmtCr(b.used)} used all-time`} />
        <Kpi label="Used" value={fmtCr(t.credits)} unit={`in ${usage.days} days`} foot={`${jobs.length} extraction${jobs.length === 1 ? '' : 's'}`} />
        <Kpi label="Per document" value={files ? fmtCr(t.credits / files) : '-'} unit="credits" />
        <Kpi label="Per record" value={rows ? fmtCr(t.credits / rows) : '-'} unit="credits" foot={`${fmtN(rows, 0)} records`} />
      </div>
      <div className="grid gap-5">
        <div className="rounded-xl border border-stone-200 bg-white p-4"><h3 className="mb-2 font-semibold">Credit history</h3>
          {usage.grants.length === 0 ? <p className="text-sm text-stone-500">No credits added yet.</p> : usage.grants.map((g) => <div key={g.ts} className="flex justify-between border-b py-1.5 text-sm"><span>{g.note || 'Credits'} <span className="text-stone-500">· {fmtDate(g.ts)}</span></span><b className="text-emerald-700">+{fmtCr(g.credits)}</b></div>)}</div>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4"><h3 className="mb-2 flex items-center gap-2 font-semibold"><Coins className="h-4 w-4" />Per extraction</h3>
        {jobs.length === 0 ? <p className="text-sm text-stone-500">Nothing extracted in this period.</p> : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-stone-500"><th className="py-1">Extraction</th><th>When</th><th>Pages</th><th>Records</th><th className="text-right">Credits</th></tr></thead>
            <tbody>{jobs.map((j) => <tr key={j.job_id} className="border-b"><td className="max-w-[320px] truncate py-1.5">{(j.names || []).join(', ')}</td><td>{fmtDate(j.ts)}</td><td>{j.pages || '-'}</td><td>{j.rows}</td><td className="text-right font-medium">{fmtCr(j.credits)}</td></tr>)}</tbody></table>)}</div>
    </div>
  );
};
