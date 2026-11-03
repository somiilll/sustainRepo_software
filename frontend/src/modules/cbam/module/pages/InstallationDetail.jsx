import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Factory, Flame, Layers, Plug, Plus, Save, Trash2, Upload, Waves } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, fmt } from "../api";

import { ProcessFlow, ShipmentsTab, VerificationTab } from "../components/InstallationExtras";
import { Badge, ChartCard, ErrorNote, Field, FormSection, KpiCard, Loading, Modal, Segmented, Trace, statusTone, useToast } from "../../ui";

const TABS = ["Processes", "Process flow", "Source streams", "Heat & waste gas", "Electricity", "Precursors", "Results", "Verification", "Shipments", "Report"] ;

const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const uid = () => Math.random().toString(16).slice(2, 14);
const num = (v) => (v === "" ? null : Number(v));

export default function InstallationDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [tab, setTab] = useState("Results");
  const q = useQuery({ queryKey: ["installation", id], queryFn: () => api.get(`/installations/${id}`) });
  const [doc, setDoc] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [ghgFor, setGhgFor] = useState(null);
  useEffect(() => { if (q.data) { setDoc(q.data); setDirty(false); } }, [q.data]);
  const save = useMutation({
    mutationFn: (d) => api.put(`/installations/${id}`, {
      name: d.name, country: d.country, reporting_year: d.reporting_year, verification_status: d.verification_status, verifier: d.verifier,
      carbon_price_paid: d.carbon_price_paid, processes: d.processes, source_streams: d.source_streams, precursors: d.precursors,
    }),
    onSuccess: (r) => { qc.setQueryData(["installation", id], r); qc.invalidateQueries({ queryKey: ["installations"] }); toast("Saved and recalculated"); },
    onError: (e) => toast(String((e ).message)),
  });
  if (q.isLoading || !doc) return <Loading />;
  if (q.error) return <div className="p-7"><ErrorNote error={q.error} /></div>;
  const upd = (patch) => { setDoc({ ...doc, ...patch }); setDirty(true); };
  const updProc = (pid, patch) => upd({ processes: doc.processes.map((p) => (p.id === pid ? { ...p, ...patch } : p)) });
  const res = q.data.results;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-line bg-white px-7 py-4">
        <div className="flex items-center gap-4">
          <Link to="/cbam/installations" className="rounded p-1.5 hover:bg-gray-100"><ArrowLeft size={18} /></Link>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600"><Factory size={20} /></span>
          <div>
            <h1 className="text-[22px] font-semibold text-[#0f2e22]">{doc.name}</h1>
            <p className="text-xs text-ink-soft">{doc.country} · reporting period CY{doc.reporting_year} · <Badge tone={statusTone(doc.verification_status)} tiny>{doc.verification_status}</Badge></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(doc)}><Save size={15} /> Save & recalculate</button>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="overflow-x-auto"><Segmented pill value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t, label: t }))} /></div>

        {tab === "Processes" && (
          <FormSection title="Production processes" subtitle="One process per functional unit / CN group. Activity level = tonnes of good produced in the reporting period."
            right={<button className="btn-outline rounded-full" onClick={() => upd({ processes: [...doc.processes, { id: uid(), name: "New process", cn_code: "", activity_level_t: 0 }] })}><Plus size={15} />Add process</button>}>
            <div className="space-y-3">
              {doc.processes.map((p) => (
                <div key={p.id} className="grid grid-cols-[1.4fr_1fr_0.7fr_1fr_auto] items-end gap-4 rounded-lg border border-line p-4">
                  <Field label="Process name" required><input className="input" value={p.name} onChange={(e) => updProc(p.id, { name: e.target.value })} /></Field>
                  <Field label="CN code" required><input className="input" value={p.cn_code} onChange={(e) => updProc(p.id, { cn_code: e.target.value })} /></Field>
                  <Field label="Route" hint="(C),(D),(E)… if needed"><input className="input" value={p.route ?? ""} onChange={(e) => updProc(p.id, { route: e.target.value })} /></Field>
                  <Field label="Activity level (t)" required><input type="number" className="input" value={p.activity_level_t} onChange={(e) => updProc(p.id, { activity_level_t: Number(e.target.value) })} /></Field>
                  <button className="btn-ghost text-red-600" onClick={() => upd({ processes: doc.processes.filter((x) => x.id !== p.id) })}><Trash2 size={15} /></button>
                  <Field label="Other direct emissions (tCO₂e)" hint="Process emissions not modelled as streams"><input type="number" className="input" value={p.other_direct_em ?? 0} onChange={(e) => updProc(p.id, { other_direct_em: Number(e.target.value) })} /></Field>
                </div>
              ))}
            </div>
          </FormSection>
        )}

        {tab === "Source streams" && doc.processes.map((p) => (
          <FormSection key={p.id} title={`Source streams · ${p.name}`} subtitle="Fuels and materials. Calculation-based: AD × NCV × EF × OF (combustion) or AD × EF (process)."
            right={<div className="flex gap-2">
              <button className="btn-outline rounded-full" onClick={() => setGhgFor(p.id)}><Upload size={15} />Import from GHG Logs</button>
              <button className="btn-outline rounded-full" onClick={() => upd({ source_streams: [...doc.source_streams, { id: uid(), process_id: p.id, name: "New fuel", kind: "combustion", unit: "t", ncv: null, ef: null, of: 1, months: MONTHS.map((m) => ({ month: m, qty: null })) }] })}><Plus size={15} />Add stream</button>
            </div>}>
            <div className="space-y-5">
              {doc.source_streams.filter((s) => s.process_id === p.id).map((s) => (
                <StreamEditor key={s.id} s={s} result={res?.processes.find((r) => r.process_id === p.id)?.streams?.find((x) => x.id === s.id)?.emissions}
                  onChange={(ns) => upd({ source_streams: doc.source_streams.map((x) => (x.id === s.id ? ns : x)) })}
                  onDelete={() => upd({ source_streams: doc.source_streams.filter((x) => x.id !== s.id) })} />
              ))}
            </div>
          </FormSection>
        ))}

        {tab === "Heat & waste gas" && doc.processes.map((p) => (
          <FormSection key={p.id} title={`Measurable heat & waste gases · ${p.name}`} subtitle="Imported heat adds emissions; exported heat and waste gas (× 56.1 × 0.667) are deducted (Eq. 55).">
            <div className="grid grid-cols-4 gap-4">
              {([["heat_imp_tj", "Heat imported (TJ)"], ["ef_heat_imp", "EF imported heat (tCO₂/TJ)"], ["heat_exp_tj", "Heat exported (TJ)"], ["ef_heat_exp", "EF exported heat (tCO₂/TJ)"],
                ["wg_imp_tj", "Waste gas imported (TJ)"], ["wg_exp_tj", "Waste gas exported (TJ)"], ["el_prod_em", "Emissions of electricity produced (tCO₂e)"]] ).map(([k, label]) => (
                <Field key={k} label={label}><input type="number" step="any" className="input" value={(p )[k] ?? 0} onChange={(e) => updProc(p.id, { [k]: Number(e.target.value) } )} /></Field>
              ))}
            </div>
          </FormSection>
        ))}

        {tab === "Electricity" && doc.processes.map((p) => (
          <FormSection key={p.id} title={`Electricity consumed · ${p.name}`} subtitle="Always monitored; counted in SEE only for cement & fertilisers (Annex II goods are direct-only).">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Determination method">
                <select className="input" value={p.el_method ?? "submetering"} onChange={(e) => updProc(p.id, { el_method: e.target.value  })}>
                  <option value="submetering">Process sub-metering</option><option value="allocation">Allocation of installation total</option></select></Field>
              {(p.el_method ?? "submetering") === "submetering" ? (
                <Field label="Electricity consumed (MWh)" icon={<Plug size={15} />}><input type="number" className="input" value={p.el_mwh ?? 0} onChange={(e) => updProc(p.id, { el_mwh: Number(e.target.value) })} /></Field>
              ) : (
                <>
                  <Field label="Installation metered total (MWh)" icon={<Plug size={15} />}><input type="number" className="input" value={p.el_total_mwh ?? 0} onChange={(e) => updProc(p.id, { el_total_mwh: Number(e.target.value) })} /></Field>
                  <Field label="Share allocated to this process" hint={`${fmt.n((p.el_total_mwh ?? 0) * (p.el_alloc_share ?? 0), 0)} MWh · fraction, 0.4 = 40%`}>
                    <input type="number" step="0.01" min={0} max={1} className="input" value={p.el_alloc_share ?? 0} onChange={(e) => updProc(p.id, { el_alloc_share: Number(e.target.value) })} /></Field>
                  <Field label="Allocation key" hint="Document it in the MMD"><select className="input" value={p.el_alloc_basis ?? "production share"} onChange={(e) => updProc(p.id, { el_alloc_basis: e.target.value })}>
                    {["production share", "rated power × hours", "engineering estimate"].map((x) => <option key={x}>{x}</option>)}</select></Field>
                </>
              )}
              <Field label="Source"><select className="input" value={p.el_source ?? "grid"} onChange={(e) => updProc(p.id, { el_source: e.target.value })}>
                <option value="grid">Grid – Annex II default EF</option><option value="own">Own generation – actual EF</option><option value="ppa">PPA / direct line – actual EF</option></select></Field>
              <Field label="Emission factor (tCO₂e/MWh)" hint="Grid: Annex II of Impl. Reg. 2025/2621"><input type="number" step="any" className="input" value={p.ef_el ?? 0} onChange={(e) => updProc(p.id, { ef_el: Number(e.target.value) })} /></Field>
            </div>
          </FormSection>
        ))}

        {tab === "Precursors" && doc.processes.map((p) => (
          <FormSection key={p.id} title={`Precursors · ${p.name}`} subtitle="Mass CONSUMED (incl. crop-ends, scale, scrap). Verified supplier data, or EU defaults (Annex I by country / Annex IV if unknown) + mark-up."
            right={<button className="btn-outline rounded-full" onClick={() => upd({ precursors: [...doc.precursors, { id: uid(), process_id: p.id, name: "", cn_code: "", mass_t: 0, basis: "default", country: "", year: doc.reporting_year }] })}><Plus size={15} />Add precursor</button>}>
            <table className="w-full">
              <thead><tr>{["Precursor / supplier", "CN code", "Country", "Mass (t)", "Basis", "SEE dir", "SEE indir", "SEFA", "Evidence", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {doc.precursors.filter((x) => x.process_id === p.id).map((x) => {
                  const u = (patch) => upd({ precursors: doc.precursors.map((y) => (y.id === x.id ? { ...y, ...patch } : y)) });
                  const used = res?.processes.find((r) => r.process_id === p.id)?.precursors?.find((y) => y.id === x.id);
                  const v = x.basis === "verified";
                  return (
                    <tr key={x.id}>
                      <td className="td"><input className="input" value={x.name} onChange={(e) => u({ name: e.target.value })} /></td>
                      <td className="td"><input className="input w-28" value={x.cn_code} onChange={(e) => u({ cn_code: e.target.value })} /></td>
                      <td className="td"><input className="input w-28" placeholder="unknown" value={x.country ?? ""} onChange={(e) => u({ country: e.target.value })} /></td>
                      <td className="td"><input type="number" className="input w-28" value={x.mass_t} onChange={(e) => u({ mass_t: Number(e.target.value) })} /></td>
                      <td className="td"><select className="input w-28" value={x.basis} onChange={(e) => u({ basis: e.target.value  })}><option value="verified">Verified</option><option value="default">Default</option></select></td>
                      {(["see_direct", "see_indirect", "sefa"] ).map((k) => (
                        <td key={k} className="td">{v ? <input type="number" step="any" className="input w-24" value={x[k] ?? ""} onChange={(e) => u({ [k]: num(e.target.value) } )} />
                          : <input className="input-muted w-24" readOnly value={fmt.n(used?.[k === "see_direct" ? "see_direct_used" : k === "see_indirect" ? "see_indirect_used" : "sefa_used"], 3)} />}</td>
                      ))}
                      <td className="td"><input className="input w-36" placeholder="verification report" value={x.evidence ?? ""} onChange={(e) => u({ evidence: e.target.value })} /></td>
                      <td className="td"><button className="text-red-600" onClick={() => upd({ precursors: doc.precursors.filter((y) => y.id !== x.id) })}><Trash2 size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </FormSection>
        ))}

        {tab === "Results" && <Results inst={q.data} />}
        {tab === "Process flow" && <ProcessFlow inst={doc} />}
        {tab === "Verification" && <VerificationTab instId={id} onChanged={() => qc.invalidateQueries({ queryKey: ["installation", id] })} toast={toast} />}
        {tab === "Shipments" && <ShipmentsTab inst={q.data} toast={toast} />}

        {tab === "Report" && (
          <FormSection title="Operator emissions report" subtitle="Summary for EU declarants (SEE, SEFA, precursors, calculation trace). Verify before sharing.">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Verification status"><select className="input" value={doc.verification_status} onChange={(e) => upd({ verification_status: e.target.value })}>
                {["Draft", "Ready for verification", "Verified", "Rejected"].map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Accredited verifier"><input className="input" value={doc.verifier ?? ""} onChange={(e) => upd({ verifier: e.target.value })} /></Field>
              <Field label="Carbon price effectively paid (€/t good)" hint="Certified by an independent person"><input type="number" className="input" value={doc.carbon_price_paid ?? 0} onChange={(e) => upd({ carbon_price_paid: Number(e.target.value) })} /></Field>
            </div>
            <div className="mt-5 flex gap-3">
              <button className="btn-outline rounded-full" onClick={() => api.download(`/installations/${id}/report.xlsx`, `CBAM_operator_report_${doc.reporting_year}.xlsx`)}><Download size={15} />Download XLSX</button>
              <button className="btn-outline rounded-full" onClick={() => api.download(`/installations/${id}/report.pdf`, `CBAM_operator_report_${doc.reporting_year}.pdf`)}><Download size={15} />Download PDF</button>
              <button className="btn-outline rounded-full" onClick={() => api.download(`/installations/${id}/mmd.docx`, `CBAM_MMD_${doc.reporting_year}.docx`)}><Download size={15} />Monitoring methodology (MMD)</button>
            </div>
          </FormSection>
        )}
      </div>
      {ghgFor && <GhgImport instId={id} facilityId={doc.facility_id} processId={ghgFor} onClose={() => setGhgFor(null)} onDone={(n) => { setGhgFor(null); qc.invalidateQueries({ queryKey: ["installation", id] }); toast(`${n} GHG log record(s) imported`); }} />}
      {node}
    </div>
  );
}

function StreamEditor({ s, result, onChange, onDelete }) {
  const filled = s.months.filter((m) => m.qty !== null && m.qty !== undefined).length;
  const setM = (i, patch) => onChange({ ...s, months: s.months.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <div className="rounded-xl border border-line">
      <div className="grid grid-cols-[1.6fr_1fr_0.6fr_1fr_1fr_0.6fr_auto] items-end gap-3 border-b border-line p-4">
        <Field label="Stream" icon={<Flame size={15} />}><input className="input" value={s.name} onChange={(e) => onChange({ ...s, name: e.target.value })} /></Field>
        <Field label="Method"><select className="input" value={s.kind} onChange={(e) => onChange({ ...s, kind: e.target.value  })}>
          <option value="combustion">Heat basis (NCV)</option><option value="process">Process (EF per unit)</option><option value="mass_balance">Mass balance</option></select></Field>
        <Field label="Unit"><input className="input" value={s.unit} onChange={(e) => onChange({ ...s, unit: e.target.value })} /></Field>
        <Field label={s.kind === "mass_balance" ? "Carbon content (tC/unit)" : "NCV (TJ/unit)"}>
          <input type="number" step="any" className="input" value={(s.kind === "mass_balance" ? s.carbon_content : s.ncv) ?? ""} onChange={(e) => onChange({ ...s, [s.kind === "mass_balance" ? "carbon_content" : "ncv"]: num(e.target.value) })} /></Field>
        <Field label={s.kind === "combustion" ? "EF (tCO₂/TJ)" : "EF (tCO₂/unit)"}><input type="number" step="any" className="input" value={s.ef ?? ""} onChange={(e) => onChange({ ...s, ef: num(e.target.value) })} /></Field>
        <Field label="OF"><input type="number" step="any" className="input" value={s.of ?? 1} onChange={(e) => onChange({ ...s, of: num(e.target.value) })} /></Field>
        <button className="btn-ghost text-red-600" onClick={onDelete}><Trash2 size={15} /></button>
      </div>
      <div className="flex items-center justify-between px-4 pt-3">
        <h4 className="text-sm font-semibold">Monthly data {s.source === "sustainrepo-ghg" && <Badge tiny tone="purple">From GHG Logs</Badge>}</h4>
        <span className="text-xs text-ink-soft">{filled} / {s.months.length} periods filled · <b className="text-ink">{fmt.n(result, 1)} tCO₂e</b> (after save)</span>
      </div>
      <table className="m-4 w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-line">
        <thead className="bg-gray-50"><tr><th className="th text-center text-[11px] uppercase text-ink-soft">Month</th><th className="th text-center text-[11px] uppercase text-ink-soft">Quantity used *</th>
          <th className="th text-center text-[11px] uppercase text-ink-soft">Calorific value</th><th className="th text-center text-[11px] uppercase text-ink-soft">Evidence</th></tr></thead>
        <tbody>
          {s.months.map((m, i) => (
            <tr key={m.month}>
              <td className="td"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${m.qty !== null && m.qty !== undefined ? "bg-green-500" : "bg-gray-300"}`} />{m.month === "annual" ? "Annual total" : new Date(m.month + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</td>
              <td className="td"><div className="flex gap-2"><input type="number" step="any" className="input w-36" placeholder="—" value={m.qty ?? ""} onChange={(e) => setM(i, { qty: num(e.target.value) })} /><span className="input-muted w-16 text-center">{s.unit}</span></div></td>
              <td className="td"><div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] text-orange-600"><input type="checkbox" checked={!!m.ncv_override} onChange={(e) => setM(i, { ncv_override: e.target.checked })} />Override Default</label>
                <input type="number" step="any" disabled={!m.ncv_override} className={m.ncv_override ? "input w-32" : "input-muted w-32"} value={m.ncv_override ? m.ncv ?? "" : s.ncv ?? ""} onChange={(e) => setM(i, { ncv: num(e.target.value) })} />
                <span className="text-xs text-ink-soft">TJ/{s.unit}</span></div></td>
              <td className="td text-center"><button className="rounded-md border border-line p-1.5 hover:bg-gray-50" title={m.evidence || "Upload evidence"}><Upload size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Results({ inst }) {
  const procs = inst.results?.processes ?? [];
  const [pid, setPid] = useState(procs[0]?.process_id);
  const p = procs.find((x) => x.process_id === pid) ?? procs[0];
  const waterfall = useMemo(() => {
    if (!p?.attribution_steps) return [];
    const steps = p.attribution_steps.slice(0, -1).filter((s) => Math.abs(s.value) > 0.001);
    let acc = 0;
    return [...steps.map((s) => { const start = acc; acc += s.value; return { name: s.label.replace("Directly attributable emissions", "DirEm*"), base: Math.min(start, acc), value: Math.abs(s.value), neg: s.value < 0 }; }),
      { name: "AttrEm_dir", base: 0, value: p.attr_direct ?? 0, neg: false, total: true }];
  }, [p]);
  if (!p) return <FormSection title="No processes" subtitle="Add a production process first."><span /></FormSection>;
  if (p.error) return <ErrorNote error={p.error} />;
  return (
    <div className="space-y-5">
      {procs.length > 1 && <Segmented value={pid} onChange={setPid} options={procs.map((x) => ({ value: x.process_id, label: x.name }))} />}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Attributed direct" value={fmt.n(p.attr_direct, 0)} unit="tCO₂e" icon={<Flame size={18} />} accent="slate" />
        <KpiCard label="SEE total" value={fmt.n(p.see, 3)} unit="tCO₂e/t" icon={<Layers size={18} />} accent="green" delta={<>direct {fmt.n(p.see_direct, 3)} · indirect {fmt.n(p.see_indirect, 3)}</>} />
        <KpiCard label="SEFA" value={fmt.n(p.sefa, 3)} unit="tCO₂e/t" icon={<Waves size={18} />} accent="teal" delta={<>BM* Column A {fmt.n(p.bm_a, 3)}</>} />
        <KpiCard label="Net exposure" value={fmt.n(p.net_per_t, 3)} unit="tCO₂e/t" icon={<Factory size={18} />} accent="purple" delta={<>SEE − SEFA per tonne</>} />
        <KpiCard label="Indirect in scope" value={p.indirect_in_scope ? "Yes" : "No"} icon={<Plug size={18} />} accent="amber" delta={<>{fmt.n(p.attr_indirect_monitored, 0)} tCO₂e monitored</>} />
      </div>
      {p.warnings.map((w) => <div key={w} className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{w}</div>)}
      <div className="grid grid-cols-2 gap-5">
        <ChartCard title="Attribution waterfall" subtitle="Eq. 55 – from directly attributable to attributed direct emissions" accent="slate">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={waterfall}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip formatter={(v) => fmt.n(v, 1)} />
              <Bar dataKey="base" stackId="a" fill="transparent" />
              <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]}>
                {waterfall.map((d, i) => <Cell key={i} fill={d.total ? "#334155" : d.neg ? "#10b981" : "#f59e0b"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="SEE build-up" subtitle="Own attributed emissions + precursors ÷ activity level" accent="green"><Trace steps={p.see_steps ?? []} /></ChartCard>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <ChartCard title="SEFA build-up" subtitle="Column A × CBAM factor × CSCF + Σ m_i × SEFA_i" accent="teal"><Trace steps={p.sefa_steps ?? []} /></ChartCard>
        <ChartCard title="Precursors used" subtitle="Values actually applied (defaults include the mark-up)" accent="purple">
          <table className="w-full">
            <thead><tr>{["Precursor", "Mass (t)", "SEE dir", "SEFA", "Source"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{p.precursors?.map((x) => (
              <tr key={x.id}><td className="td">{x.name}</td><td className="td tabular-nums">{fmt.n(x.mass_t, 0)}</td><td className="td tabular-nums">{fmt.n(x.see_direct_used, 3)}</td>
                <td className="td tabular-nums">{fmt.n(x.sefa_used, 3)}</td><td className="td"><Badge tone={x.basis === "verified" ? "green" : "blue"}>{x.basis === "verified" ? "Verified" : x.default_source ?? "Default"}</Badge></td></tr>
            ))}</tbody>
          </table>
        </ChartCard>
      </div>
    </div>
  );
}

function GhgImport({ instId, facilityId, processId, onClose, onDone }) {
  const recs = useQuery({ queryKey: ["ghg", facilityId], queryFn: () => api.get(`/platform/emission-records/${facilityId}`), enabled: !!facilityId });
  const [sel, setSel] = useState([]);
  const m = useMutation({ mutationFn: () => api.post(`/installations/${instId}/import-ghg`, { process_id: processId, record_ids: sel }), onSuccess: (r) => onDone(r.imported) });
  return (
    <Modal title="Import from SustainRepo GHG Logs" onClose={onClose}>
      <FormSection title="Scope 1 records for this facility" subtitle="Selected records become source streams (activity data, NCV, EF). Original GHG logs are not modified.">
        {recs.isLoading ? <Loading /> : (
          <table className="w-full">
            <thead><tr>{["", "Category", "Sub-category", "Period", "Quantity", "tCO₂e"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{recs.data?.filter((r) => r.scope === "Scope 1").map((r) => (
              <tr key={r.id}><td className="td"><input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
                <td className="td">{r.category}</td><td className="td">{r.sub_category}</td><td className="td">{r.period}</td><td className="td">{fmt.n(r.quantity, 0)} {r.unit}</td><td className="td font-semibold">{fmt.n(r.tco2e, 2)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </FormSection>
      <ErrorNote error={m.error} />
      <div className="flex justify-end gap-3"><button className="btn-outline rounded-full" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!sel.length} onClick={() => m.mutate()}>Import {sel.length || ""} record(s)</button></div>
    </Modal>
  );
}
