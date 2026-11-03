/** Installation tabs added in round 2: process-flow diagram, verification / assurance, per-shipment ledger. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Link2, Mail, Plus, Save, Trash2, XCircle } from "lucide-react";
import { api, fmt } from "../api";

import { Badge, ErrorNote, Field, FormSection, Loading, statusTone } from "../../ui";

// ---------------------------------------------------------------- process flow

const COL = { stream: "#d97706", precursor: "#7c3aed", el: "#0f9f8f", heat: "#ea580c", product: "#14532d", out: "#64748b" };

export function ProcessFlow({ inst }) {
  const W = 960, ROW = 52, NODE_H = 40, X = { in: 16, proc: 380, out: 744 }, NW = 200;
  let y = 30;
  const bands = inst.processes.map((p) => {
    const ins = [
      ...inst.source_streams.filter((s) => s.process_id === p.id).map((s) => ({ label: s.name, sub: `${s.kind} · ${s.unit}`, color: COL.stream })),
      ...inst.precursors.filter((x) => x.process_id === p.id).map((x) => ({ label: x.name || x.cn_code, sub: `precursor ${x.cn_code} · ${fmt.n(x.mass_t, 0)} t`, color: COL.precursor })),
      ...((p.el_mwh || p.el_total_mwh) ? [{ label: "Electricity", sub: `${p.el_method === "allocation" ? "allocated" : "sub-metered"} · EF ${p.ef_el ?? "–"}`, color: COL.el }] : []),
      ...(p.heat_imp_tj ? [{ label: "Heat imported", sub: `${p.heat_imp_tj} TJ`, color: COL.heat }] : []),
      ...(p.wg_imp_tj ? [{ label: "Waste gas imported", sub: `${p.wg_imp_tj} TJ`, color: COL.heat }] : []),
    ];
    const outs = [
      { label: `${p.cn_code} – ${p.name}`, sub: `${fmt.n(p.activity_level_t, 0)} t activity level`, color: COL.product },
      ...(p.heat_exp_tj ? [{ label: "Heat exported", sub: `${p.heat_exp_tj} TJ (deducted)`, color: COL.out }] : []),
      ...(p.wg_exp_tj ? [{ label: "Waste gas exported", sub: `${p.wg_exp_tj} TJ (deducted)`, color: COL.out }] : []),
    ];
    const n = Math.max(ins.length, outs.length, 1);
    const band = { p, ins, outs, top: y, h: n * ROW };
    y += n * ROW + 28;
    return band;
  });
  const H = y;
  const box = (x, yy, n, k) => (
    <g key={k}>
      <rect x={x} y={yy} width={NW} height={NODE_H} rx={8} fill="#fff" stroke={n.color} strokeWidth={1.5} />
      <rect x={x} y={yy} width={5} height={NODE_H} rx={2} fill={n.color} />
      <text x={x + 14} y={yy + 17} fontSize={12} fontWeight={600} fill="#1f2937">{n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label}</text>
      <text x={x + 14} y={yy + 31} fontSize={10.5} fill="#64748b">{n.sub.length > 34 ? n.sub.slice(0, 33) + "…" : n.sub}</text>
    </g>
  );
  const arrow = (x1, y1, x2, y2, color, k) => {
    const mx = (x1 + x2) / 2;
    return <path key={k} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 6},${y2}`} fill="none" stroke={color} strokeWidth={1.6} markerEnd="url(#arr)" opacity={0.8} />;
  };
  return (
    <FormSection title="Process flow & boundaries" subtitle="Generated from the data on the other tabs – use it to check that every input and output is inside the right boundary.">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[760px]" role="img" aria-label="Installation process flow">
          <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b" /></marker></defs>
          {[["Inputs", X.in], ["Production process (boundary)", X.proc], ["Outputs", X.out]].map(([t, x]) => (
            <text key={t } x={(x ) + 2} y={10} fontSize={11} fontWeight={600} fill="#64748b">{t}</text>
          ))}
          {bands.map((b) => {
            const pc = b.top + b.h / 2;
            return (
              <g key={b.p.id}>
                <rect x={X.proc - 24} y={b.top - 6} width={NW + 48} height={b.h + 4} rx={12} fill="#f0fdf4" stroke="#14532d" strokeDasharray="6 4" />
                {box(X.proc, pc - NODE_H / 2 - 2, { label: b.p.name, sub: `CN ${b.p.cn_code}${b.p.route ? " · route " + b.p.route : ""}`, color: COL.product }, "p")}
                {b.ins.map((n, i) => {
                  const yy = b.top + i * ROW + (b.h - b.ins.length * ROW) / 2 + 4;
                  return <g key={"i" + i}>{box(X.in, yy, n, "ib" + i)}{arrow(X.in + NW, yy + NODE_H / 2, X.proc - 24, pc - 2, n.color, "ia" + i)}</g>;
                })}
                {b.outs.map((n, i) => {
                  const yy = b.top + i * ROW + (b.h - b.outs.length * ROW) / 2 + 4;
                  return <g key={"o" + i}>{box(X.out, yy, n, "ob" + i)}{arrow(X.proc + NW + 24, pc - 2, X.out, yy + NODE_H / 2, n.color, "oa" + i)}</g>;
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-soft">
        {[["Fuels / materials", COL.stream], ["Precursors", COL.precursor], ["Electricity", COL.el], ["Heat / waste gas", COL.heat], ["Product", COL.product]].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{l}</span>
        ))}
      </div>
    </FormSection>
  );
}

// ---------------------------------------------------------------- verification
export function VerificationTab({ instId, onChanged, toast }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["verification", instId], queryFn: () => api.get(`/installations/${instId}/verification`) });
  const [v, setV] = useState(null);
  const [invite, setInvite] = useState({ email: "", name: "" });
  const [link, setLink] = useState(null);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put(`/installations/${instId}/verification`, v),
    onSuccess: (r) => { qc.setQueryData(["verification", instId], r); onChanged(); toast("Verification details saved"); },
  });
  const inv = useMutation({
    mutationFn: () => api.post(`/installations/${instId}/verification/invite`, invite),
    onSuccess: (r) => { setLink(r.link); qc.invalidateQueries({ queryKey: ["verification", instId] }); onChanged(); toast("Verifier invited – link ready to share"); },
  });
  if (q.isLoading || !v) return <Loading />;
  const set = (p) => setV({ ...v, ...p });
  const site = v.site_visit ?? {};
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <FormSection title="Verifier & assurance" subtitle="Third-party verification by an accredited verifier (Impl. Reg. 2025/2546)"
          right={<button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}><Save size={15} /> Save</button>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Verification body"><input className="input" value={v.verifier_body ?? ""} onChange={(e) => set({ verifier_body: e.target.value })} /></Field>
            <Field label="Accreditation number"><input className="input" value={v.accreditation_no ?? ""} onChange={(e) => set({ accreditation_no: e.target.value })} /></Field>
            <Field label="Accreditation valid until" hint="Accreditation lasts up to 5 years"><input type="date" className="input" value={v.accreditation_expiry ?? ""} onChange={(e) => set({ accreditation_expiry: e.target.value })} /></Field>
            <Field label="Report language"><select className="input" value={v.report_language ?? "English"} onChange={(e) => set({ report_language: e.target.value })}>{["English", "Other"].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Lead auditor"><input className="input" value={v.lead_auditor ?? ""} onChange={(e) => set({ lead_auditor: e.target.value })} /></Field>
            <Field label="Consecutive verifications by this lead auditor" hint="Max 5, then a 3-year break"><input type="number" min={0} className="input" value={v.lead_auditor_consecutive ?? 0} onChange={(e) => set({ lead_auditor_consecutive: +e.target.value })} /></Field>
            <Field label="Independent reviewer" hint="Must not be the lead auditor"><input className="input" value={v.independent_reviewer ?? ""} onChange={(e) => set({ independent_reviewer: e.target.value })} /></Field>
            <Field label="First verification of this installation?"><select className="input" value={v.first_year ? "yes" : "no"} onChange={(e) => set({ first_year: e.target.value === "yes" })}><option value="yes">Yes</option><option value="no">No</option></select></Field>
            <Field label="Site visit"><select className="input" value={site.type ?? "physical"} onChange={(e) => set({ site_visit: { ...site, type: e.target.value  } })}>
              <option value="physical">Physical</option><option value="virtual">Virtual</option><option value="waived">Waived</option></select></Field>
            <Field label="Site visit date"><input type="date" className="input" value={site.date ?? ""} onChange={(e) => set({ site_visit: { ...site, date: e.target.value } })} /></Field>
            {site.type && site.type !== "physical" && (
              <div className="md:col-span-2"><Field label="Condition relied on" hint="Virtual visits or waivers are only allowed under specific conditions – state which one"><input className="input" value={site.condition ?? ""} onChange={(e) => set({ site_visit: { ...site, condition: e.target.value } })} /></Field></div>
            )}
          </div>
          <ErrorNote error={save.error} />
        </FormSection>
        <FormSection title="Checks" subtitle={`Status: ${v.status}`}>
          <ul className="space-y-2.5">
            {v.checks.map((c) => (
              <li key={c.item} className="flex gap-2 text-[13px]">
                {c.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" />}
                <span><span className="font-medium">{c.item}</span><span className="block text-xs text-ink-soft">{c.detail}</span></span>
              </li>
            ))}
          </ul>
        </FormSection>
      </div>
      <FormSection title="Invite the verifier" subtitle="They get a read-only link to the report, calculation trace and evidence, and submit their opinion there.">
        <div className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
          <Field label="Verifier e-mail" required icon={<Mail size={15} />}><input className="input" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
          <Field label="Verification body"><input className="input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>
          <button className="btn-primary" disabled={!invite.email || inv.isPending} onClick={() => inv.mutate()}><Link2 size={15} /> Create invite</button>
        </div>
        <ErrorNote error={inv.error} />
        {link && <p className="mt-3 break-all rounded-lg bg-mint/60 p-3 text-sm">Share this link: <a className="font-medium text-brand underline" href={link} target="_blank" rel="noreferrer">{link}</a></p>}
        {v.opinion && (
          <div className="mt-4 rounded-lg border border-line p-4 text-sm">
            <div className="flex items-center gap-2"><b>Verifier opinion:</b> <Badge tone={v.opinion.opinion === "negative" ? "red" : "green"}>{v.opinion.opinion.replace(/_/g, " ")}</Badge></div>
            {v.opinion.comments && <p className="mt-1 text-ink-soft">{v.opinion.comments}</p>}
            {v.materiality.map((m) => <div key={m.cn_code} className="mt-1 text-xs">{m.cn_code}: SEE {fmt.pct(m.see_rel)} · SEFA {fmt.pct(m.sefa_rel)} {m.material ? <Badge tiny tone="red">material</Badge> : <Badge tiny tone="green">below 5%</Badge>}</div>)}
          </div>
        )}
      </FormSection>
    </div>
  );
}

// ---------------------------------------------------------------- shipments
export function ShipmentsTab({ inst, toast }) {
  const qc = useQueryClient();
  const key = ["shipments", inst.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/installations/${inst.id}/shipments`) });
  const blank = { ref: "", date: "", buyer: "", process_id: inst.processes[0]?.id ?? "", quantity_t: "" };
  const [f, setF] = useState(blank);
  const [buyer, setBuyer] = useState("");
  const [period, setPeriod] = useState(String(inst.reporting_year));
  const add = useMutation({
    mutationFn: () => api.post(`/installations/${inst.id}/shipments`, { ...f, quantity_t: Number(f.quantity_t) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setF(blank); toast("Shipment added"); },
  });
  const del = useMutation({ mutationFn: (sid) => api.del(`/installations/${inst.id}/shipments/${sid}`), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
  const rows = q.data ?? [];
  const buyers = [...new Set(rows.map((r) => r.buyer).filter(Boolean))];
  const y = inst.reporting_year;
  const exp = (fmtx) => api.download(`/installations/${inst.id}/communication.${fmtx}?buyer=${encodeURIComponent(buyer)}&period=${period}`,
    `CBAM_communication_${buyer || "all"}_${period}.${fmtx}`);
  return (
    <div className="space-y-5">
      <FormSection title="Shipments to EU buyers" subtitle="Each shipment / invoice carries the verified SEE and SEFA of the product it was made by.">
        <div className="mb-4 grid items-end gap-3 md:grid-cols-[1fr_1fr_1.4fr_1.2fr_0.8fr_auto]">
          <Field label="Invoice / shipment no." required><input className="input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          <Field label="Date" required><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Buyer (EU importer)" required><input className="input" list="buyers" value={f.buyer} onChange={(e) => setF({ ...f, buyer: e.target.value })} /><datalist id="buyers">{buyers.map((b) => <option key={b} value={b} />)}</datalist></Field>
          <Field label="Product" required><select className="input" value={f.process_id} onChange={(e) => setF({ ...f, process_id: e.target.value })}>{inst.processes.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.cn_code})</option>)}</select></Field>
          <Field label="Tonnes" required><input type="number" className="input" value={f.quantity_t} onChange={(e) => setF({ ...f, quantity_t: e.target.value })} /></Field>
          <button className="btn-primary" disabled={!f.ref || !f.date || !f.buyer || !f.quantity_t || add.isPending} onClick={() => add.mutate()}><Plus size={15} /> Add</button>
        </div>
        <ErrorNote error={add.error} />
        {q.isLoading ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>{["Shipment", "Date", "Buyer", "CN", "Tonnes", "SEE dir", "SEE ind", "SEE", "SEFA", "Embedded tCO₂e", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td className="td font-medium">{r.ref}</td><td className="td">{fmt.date(r.date)}</td><td className="td">{r.buyer}</td><td className="td">{r.cn_code}</td>
                  <td className="td tabular-nums">{fmt.n(r.quantity_t, 1)}</td><td className="td tabular-nums">{fmt.n(r.see_direct, 3)}</td><td className="td tabular-nums">{fmt.n(r.see_indirect, 3)}</td>
                  <td className="td tabular-nums">{fmt.n(r.see, 3)}</td><td className="td tabular-nums">{fmt.n(r.sefa, 3)}</td><td className="td font-semibold tabular-nums">{fmt.n(r.embedded, 1)}</td>
                  <td className="td"><button className="text-ink-soft hover:text-red-600" onClick={() => del.mutate(r.id)} aria-label={`Delete ${r.ref}`}><Trash2 size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </FormSection>
      <FormSection title="Emissions data communication" subtitle="Per buyer and period, in the layout of the EC communication template. Verification status is included.">
        <div className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
          <Field label="Buyer"><select className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)}><option value="">All buyers</option>{buyers.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="Period"><select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {[String(y), `${y}-Q1`, `${y}-Q2`, `${y}-Q3`, `${y}-Q4`].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <button className="btn-outline rounded-full" onClick={() => exp("xlsx")}><Download size={15} /> XLSX</button>
          <button className="btn-outline rounded-full" onClick={() => exp("pdf")}><Download size={15} /> PDF</button>
        </div>
        <p className="mt-3 text-xs text-ink-soft">Status: <Badge tiny tone={statusTone(inst.verification_status)}>{inst.verification_status}</Badge> – share verified values only.</p>
      </FormSection>
    </div>
  );
}
