/** Public page for suppliers (no SustainRepo login): guided step-by-step wizard or bulk Excel upload, with FAQ. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Factory, FileUp, HelpCircle, Leaf, Plus, Trash2 } from "lucide-react";
import { api, fmt, CBAM_API } from "../api";

import { CarbonPriceFields, EMPTY_CP, cpEur } from "../components/CarbonPriceFields";
import { ErrorNote, Field, FormSection, Loading, Segmented } from "../../ui";






const FAQ = {
  installation: [
    ["Which installation?", "The site where the goods were produced (not your trading company). Use the name from your verified CBAM emissions report."],
    ["What is the production route?", "The route letter used in the EU tables, e.g. (C) blast furnace / basic oxygen, (E) scrap electric arc. Ask your verifier if unsure."],
  ],
  goods: [
    ["What is SEE?", "Specific embedded emissions: tonnes CO₂e per tonne of the good, from your verified report. Direct = fuels and processes; indirect = electricity consumed."],
    ["Do I fill indirect for steel or aluminium?", "Yes, please report it. The EU only charges indirect emissions for cement and fertilisers, but it is still declared."],
    ["What is SEFA?", "Specific embedded free allocation: the Column A benchmark × CBAM factor × CSCF, plus your precursors' SEFA. Your verifier's report states it."],
  ],
  precursors: [["What is a precursor?", "Another CBAM good consumed in your process (e.g. slabs for plate). Enter the tonnes consumed and the supplier's SEE."]],
  carbon: [
    ["What counts as a carbon price?", "A carbon tax, levy or fee, or allowances under an emissions trading system, actually paid for these emissions."],
    ["Can I include voluntary credits?", "No. Voluntary carbon credits are not a carbon price under the CBAM Regulation."],
    ["Rebates?", "Deduct any free allocation, refund or compensation you received – only the net amount counts."],
  ],
  verification: [["Do I need verification?", "Yes. Actual values must be verified by an accredited verifier; attach the verification report (English)."]],
  review: [["What happens next?", `Your customer reviews the data. If something is missing they send the request back with a note and you can resubmit using the same link.`]],
};

export default function SupplierPortal() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ["portal", token], queryFn: () => api.publicGet(`/supplier/${token}`) });
  const [mode, setMode] = useState("wizard");
  const [step, setStep] = useState(0);
  const [inst, setInst] = useState({ installation_name: "", route: "", verifier: "", verification_report: "" });
  const [goods, setGoods] = useState([]);
  const [precs, setPrecs] = useState([]);
  const [hasCp, setHasCp] = useState(false);
  const [cp, setCp] = useState({ ...EMPTY_CP });
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const [bulk, setBulk] = useState(null);

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    const s = d.submission;
    setGoods(d.cn_codes.map((cn) => {
      const g = s?.goods?.find((x) => x.cn_code === cn) ?? (s && !s.goods ? s : null);
      return { cn_code: cn, see_direct: g?.see_direct?.toString() ?? "", see_indirect: g?.see_indirect?.toString() ?? "", sefa: g?.sefa?.toString() ?? "", route: g?.route ?? "" };
    }));
    if (s) {
      setInst({ installation_name: s.installation_name ?? "", route: s.route ?? "", verifier: s.verifier ?? "", verification_report: s.verification_report ?? "" });
      if (s.carbon_price) { setHasCp(true); setCp(s.carbon_price); }
    }
  }, [q.data]);

  if (q.isLoading) return <Shell><Loading /></Shell>;
  if (q.error) return <Shell><ErrorNote error={q.error} /></Shell>;
  const d = q.data;
  if (done || d.status === "Verified")
    return <Shell><div className="card flex flex-col items-center gap-3 p-12 text-center"><CheckCircle2 size={42} className="text-green-600" />
      <h2 className="text-xl font-semibold">Thank you – data submitted</h2><p className="text-sm text-ink-soft">{d.org_name} will review your submission. You can close this page.</p></div></Shell>;

  const steps = [
    { key: "installation", label: "Installation" }, { key: "goods", label: "Emissions per good" },
    ...(d.steps.precursors ? [{ key: "precursors", label: "Precursors" }] : []),
    ...(d.steps.carbon_price ? [{ key: "carbon", label: "Carbon price" }] : []),
    { key: "verification", label: "Verification" }, { key: "review", label: "Review & submit" },
  ];
  const cur = steps[step].key;
  const gset = (i, k, v) => setGoods(goods.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  const valid = {
    installation: !!inst.installation_name.trim(),
    goods: goods.every((g) => g.see_direct !== "" && g.sefa !== ""),
    precursors: true, carbon: !hasCp || cp.type !== "voluntary_credit", verification: !!inst.verification_report, review: true,
  };
  const payload = () => ({ ...inst, goods, precursors: precs, carbon_price: hasCp ? cp : null });
  const submit = async () => { setErr(null); try { await api.publicPost(`/supplier/${token}`, payload()); setDone(true); } catch (e) { setErr(e); } };
  const upload = async (f) => {
    const fd = new FormData(); fd.append("file", f);
    try { const r = await api.publicForm(`/supplier/${token}/file`, fd); setInst((x) => ({ ...x, verification_report: r.file })); } catch (e) { setErr(e); }
  };
  const bulkSend = async (f, confirm) => {
    setErr(null);
    const fd = new FormData(); fd.append("file", f); fd.append("confirm", String(confirm));
    fd.append("verifier", inst.verifier); fd.append("verification_report", inst.verification_report);
    try { const r = await api.publicForm(`/supplier/${token}/bulk`, fd); if (r.submitted) setDone(true); else setBulk({ file: f, sub: r.submission }); }
    catch (e) { setErr(e); }
  };

  return (
    <Shell>
      <div>
        <h1 className="text-2xl font-semibold">CBAM data request from {d.org_name}</h1>
        <p className="mt-1 text-sm text-ink-soft">For {d.supplier_name} · goods {d.cn_codes.join(", ")} · reporting period {d.reporting_year} · due {fmt.date(d.due_date)}</p>
        {d.message && <p className="mt-3 rounded-lg bg-white p-4 text-sm shadow-card">{d.message}</p>}
        {d.status === "Needs completion" && d.review_note && <p className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-800"><b>Please complete:</b> {d.review_note}</p>}
      </div>
      {d.steps.bulk_upload && <Segmented pill value={mode} onChange={setMode} options={[{ value: "wizard", label: "Step by step" }, { value: "bulk", label: "Bulk upload (Excel)" }]} />}
      <div className={`grid gap-5 ${d.steps.faq ? "lg:grid-cols-[minmax(0,1fr)_280px]" : ""}`}>
        <div className="min-w-0 space-y-4">
          {mode === "bulk" ? (
            <FormSection title="Bulk upload" subtitle="For many CN codes: fill the template (one row per CN code) and upload it.">
              <div className="space-y-4">
                <a className="btn-outline w-fit" href={`${CBAM_API}/public/supplier/${token}/template.xlsx`}><Download size={15} /> Download template</a>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Accredited verifier"><input className="input" value={inst.verifier} onChange={(e) => setInst({ ...inst, verifier: e.target.value })} /></Field>
                  <Field label="Verification report" hint={inst.verification_report || "PDF"}><input type="file" className="input" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></Field>
                </div>
                <label className="btn-primary w-fit cursor-pointer"><FileUp size={15} /> Upload completed template
                  <input type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && bulkSend(e.target.files[0], false)} /></label>
                {bulk && (
                  <div className="space-y-3 rounded-lg border border-line bg-white p-4">
                    <div className="text-sm font-medium">Check before submitting – {bulk.sub.installation_name}</div>
                    <GoodsTable goods={bulk.sub.goods} />
                    {bulk.sub.carbon_price && <p className="text-sm">Carbon price: {fmt.eur(bulk.sub.carbon_price_paid, 2)} per tonne</p>}
                    <button className="btn-primary" onClick={() => bulkSend(bulk.file, true)}>Submit {bulk.sub.goods.length} good(s)</button>
                  </div>
                )}
              </div>
            </FormSection>
          ) : (
            <>
              <ol className="flex flex-wrap gap-2">
                {steps.map((s, i) => (
                  <li key={s.key}><button onClick={() => i < step && setStep(i)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${i === step ? "bg-brand text-white" : i < step ? "bg-mint text-brand" : "bg-white text-ink-soft"}`}>{i + 1}. {s.label}</button></li>
                ))}
              </ol>
              {cur === "installation" && (
                <FormSection title="Producing installation" subtitle="Where the goods were made">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Installation name" required icon={<Factory size={15} />}><input className="input" value={inst.installation_name} onChange={(e) => setInst({ ...inst, installation_name: e.target.value })} /></Field>
                    <Field label="Production route" hint="e.g. (C), (E)"><input className="input" value={inst.route} onChange={(e) => setInst({ ...inst, route: e.target.value })} /></Field>
                  </div>
                </FormSection>
              )}
              {cur === "goods" && (
                <FormSection title="Emissions per good" subtitle="tCO₂e per tonne of good, from your verified emissions report">
                  <div className="space-y-3">
                    {goods.map((g, i) => (
                      <div key={g.cn_code} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-5">
                        <div className="text-sm font-semibold md:pt-7">{g.cn_code}</div>
                        <Field label="SEE direct" required><input type="number" step="any" className="input" value={g.see_direct} onChange={(e) => gset(i, "see_direct", e.target.value)} /></Field>
                        <Field label="SEE indirect"><input type="number" step="any" className="input" value={g.see_indirect} onChange={(e) => gset(i, "see_indirect", e.target.value)} /></Field>
                        <Field label="SEFA" required><input type="number" step="any" className="input" value={g.sefa} onChange={(e) => gset(i, "sefa", e.target.value)} /></Field>
                        <Field label="Route"><input className="input" value={g.route} placeholder={inst.route} onChange={(e) => gset(i, "route", e.target.value)} /></Field>
                      </div>
                    ))}
                  </div>
                </FormSection>
              )}
              {cur === "precursors" && (
                <FormSection title="Precursors (optional)" subtitle="CBAM goods consumed in your process, e.g. slabs for plate"
                  right={<button className="btn-outline py-1.5 text-xs" onClick={() => setPrecs([...precs, { name: "", cn_code: "", country: "", mass_t: "", see_direct: "", see_indirect: "" }])}><Plus size={13} /> Add</button>}>
                  {!precs.length ? <p className="text-sm text-ink-soft">No precursors – continue.</p> : precs.map((p, i) => (
                    <div key={i} className="mb-3 grid gap-2 md:grid-cols-7">
                      {(["name", "cn_code", "country", "mass_t", "see_direct", "see_indirect"] ).map((k) => (
                        <input key={k} className="input" placeholder={{ name: "Name", cn_code: "CN", country: "Country", mass_t: "Tonnes", see_direct: "SEE dir", see_indirect: "SEE ind" }[k]}
                          value={p[k]} onChange={(e) => setPrecs(precs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                      ))}
                      <button className="text-ink-soft hover:text-red-600" onClick={() => setPrecs(precs.filter((_, j) => j !== i))} aria-label="Remove precursor"><Trash2 size={15} /></button>
                    </div>
                  ))}
                </FormSection>
              )}
              {cur === "carbon" && (
                <FormSection title="Carbon price paid (optional)" subtitle="Only if you paid a carbon tax or ETS allowances for these emissions">
                  <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#14532d]" checked={hasCp} onChange={(e) => setHasCp(e.target.checked)} /> A carbon price was paid</label>
                  {hasCp && <CarbonPriceFields value={cp} onChange={setCp} />}
                </FormSection>
              )}
              {cur === "verification" && (
                <FormSection title="Verification" subtitle="Actual values must be verified by an accredited verifier">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Accredited verifier"><input className="input" value={inst.verifier} onChange={(e) => setInst({ ...inst, verifier: e.target.value })} /></Field>
                    <Field label="Verification report" required hint={inst.verification_report ? `Attached: ${inst.verification_report}` : "PDF, in English"}>
                      <input type="file" className="input" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></Field>
                  </div>
                </FormSection>
              )}
              {cur === "review" && (
                <FormSection title="Review & submit" subtitle="Check the values below">
                  <div className="space-y-3 text-sm">
                    <div><b>{inst.installation_name}</b> · route {inst.route || "–"} · verifier {inst.verifier || "–"} · report {inst.verification_report || "–"}</div>
                    <GoodsTable goods={goods} />
                    {precs.length > 0 && <div>{precs.length} precursor(s)</div>}
                    {hasCp && <div>Carbon price: {cp.scheme || cp.type} → {fmt.eur(cpEur(cp), 2)} per tonne</div>}
                  </div>
                </FormSection>
              )}
              <ErrorNote error={err} />
              <div className="flex justify-between">
                <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={15} /> Back</button>
                {cur === "review" ? <button className="btn-primary" onClick={submit}>Submit verified data</button>
                  : <button className="btn-primary" disabled={!valid[cur]} onClick={() => setStep(step + 1)}>Next <ChevronRight size={15} /></button>}
              </div>
            </>
          )}
          {mode === "bulk" && <ErrorNote error={err} />}
        </div>
        {d.steps.faq && (
          <aside className="card h-fit p-5">
            <div className="mb-3 flex items-center gap-2 font-semibold"><HelpCircle size={16} className="text-brand" /> Help</div>
            <div className="space-y-3">
              {(FAQ[mode === "bulk" ? "goods" : cur] ?? []).map(([qq, a]) => (
                <details key={qq} className="group text-sm" open>
                  <summary className="cursor-pointer font-medium">{qq}</summary>
                  <p className="mt-1 text-ink-soft">{a}</p>
                </details>
              ))}
            </div>
          </aside>
        )}
      </div>
    </Shell>
  );
}

function GoodsTable({ goods }) {
  return (
    <table className="w-full rounded-lg border border-line text-[13px]">
      <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">CN</th><th className="px-3 py-2 text-right">SEE direct</th><th className="px-3 py-2 text-right">SEE indirect</th><th className="px-3 py-2 text-right">SEFA</th></tr></thead>
      <tbody>{goods.map((g, i) => <tr key={i} className="border-t border-line"><td className="px-3 py-2">{g.cn_code}</td><td className="px-3 py-2 text-right">{g.see_direct}</td>
        <td className="px-3 py-2 text-right">{g.see_indirect || 0}</td><td className="px-3 py-2 text-right">{g.sefa}</td></tr>)}</tbody>
    </table>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex items-center gap-2.5 border-b border-line bg-white px-8 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-400 text-orange-900"><Leaf size={18} /></span>
        <span className="text-lg font-semibold">SustainRepo</span><span className="text-ink-soft">· CBAM supplier portal</span>
      </div>
      <div className="mx-auto max-w-5xl space-y-4 p-8">{children}</div>
    </div>
  );
}
