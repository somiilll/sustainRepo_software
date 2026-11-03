/** Public read-only page for the invited verifier: report, trace, evidence -> opinion with materiality. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { CheckCircle2, Leaf, ShieldCheck } from "lucide-react";
import { api, fmt } from "../api";

import { Badge, ErrorNote, Field, FormSection, Loading, Trace } from "../../ui";





export default function VerifierPortal() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ["verifier", token], queryFn: () => api.publicGet(`/verifier/${token}`) });
  const [op, setOp] = useState({ opinion: "positive", comments: "", site_visit_date: "" });
  const [mis, setMis] = useState({});
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null);
  const submit = async () => {
    setErr(null);
    try {
      const misstatements = Object.entries(mis).filter(([, v]) => v.see || v.sefa).map(([cn, v]) => ({ cn_code: cn, see: +v.see || 0, sefa: +v.sefa || 0 }));
      setRes(await api.publicPost(`/verifier/${token}/opinion`, { ...op, misstatements }));
    } catch (e) { setErr(e); }
  };
  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex items-center gap-2.5 border-b border-line bg-white px-8 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-400 text-orange-900"><Leaf size={18} /></span>
        <span className="text-lg font-semibold">SustainRepo</span><span className="text-ink-soft">· CBAM verifier access (read-only)</span>
      </div>
      <div className="mx-auto max-w-5xl space-y-5 p-8">
        {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} /> : (() => {
          const d = q.data;
          return (
            <>
              <div>
                <h1 className="text-2xl font-semibold">{d.installation.name}</h1>
                <p className="text-sm text-ink-soft">{d.installation.country} · reporting period {d.installation.reporting_year} · <Badge tiny tone="amber">{d.installation.verification_status}</Badge></p>
              </div>
              {d.processes.map((p) => (
                <FormSection key={p.cn_code} title={`${p.name} · CN ${p.cn_code}`} subtitle={`${p.sector} · activity level ${fmt.n(p.activity_level_t, 0)} t`}>
                  {p.error ? <ErrorNote error={p.error} /> : (
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div><div className="kpi-label mb-2">Attribution</div><Trace steps={p.attribution_steps ?? []} /></div>
                      <div><div className="kpi-label mb-2">SEE {fmt.n(p.see, 3)}</div><Trace steps={p.see_steps ?? []} /></div>
                      <div><div className="kpi-label mb-2">SEFA {fmt.n(p.sefa, 3)}</div><Trace steps={p.sefa_steps ?? []} /></div>
                    </div>
                  )}
                </FormSection>
              ))}
              <FormSection title="Source streams & evidence">
                <table className="w-full text-sm"><thead><tr>{["Stream", "Type", "Unit", "NCV", "EF", "Source"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody>{d.streams.map((s) => <tr key={s.name}><td className="td">{s.name}</td><td className="td">{s.kind}</td><td className="td">{s.unit}</td><td className="td">{s.ncv ?? "–"}</td><td className="td">{s.ef ?? "–"}</td><td className="td">{s.source}</td></tr>)}</tbody></table>
                <p className="mt-3 text-sm">Evidence files: {d.evidence.join(", ") || "none attached"}</p>
              </FormSection>
              {res ? (
                <div className="card flex items-center gap-3 p-6"><CheckCircle2 className="text-green-600" /> Opinion recorded – status: <b>{res.status}</b></div>
              ) : (
                <FormSection title="Verification opinion" subtitle="Misstatements above 5% of SEE or SEFA for a CN code are material and block a positive opinion.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Opinion" required><select className="input" value={op.opinion} onChange={(e) => setOp({ ...op, opinion: e.target.value })}>
                      <option value="positive">Positive (verified)</option><option value="positive_with_comments">Positive with comments</option><option value="negative">Negative</option></select></Field>
                    <Field label="Site visit date"><input type="date" className="input" value={op.site_visit_date} onChange={(e) => setOp({ ...op, site_visit_date: e.target.value })} /></Field>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="label">Uncorrected misstatements (tCO₂e per tonne)</div>
                    {d.processes.map((p) => (
                      <div key={p.cn_code} className="grid grid-cols-[140px_1fr_1fr] items-center gap-3 text-sm">
                        <span className="font-medium">{p.cn_code}</span>
                        <input type="number" step="any" className="input" placeholder="SEE" value={mis[p.cn_code]?.see ?? ""} onChange={(e) => setMis({ ...mis, [p.cn_code]: { sefa: mis[p.cn_code]?.sefa ?? "", see: e.target.value } })} />
                        <input type="number" step="any" className="input" placeholder="SEFA" value={mis[p.cn_code]?.sefa ?? ""} onChange={(e) => setMis({ ...mis, [p.cn_code]: { see: mis[p.cn_code]?.see ?? "", sefa: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4"><Field label="Comments"><textarea className="input h-20" value={op.comments} onChange={(e) => setOp({ ...op, comments: e.target.value })} /></Field></div>
                  <ErrorNote error={err} />
                  <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={submit}><ShieldCheck size={15} /> Submit opinion</button></div>
                </FormSection>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
