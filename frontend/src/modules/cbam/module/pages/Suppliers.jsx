import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarDays, CheckCircle2, Copy, ExternalLink, Mail, Plus, RotateCcw, Send, Truck, XCircle } from "lucide-react";
import { api, fmt } from "../api";

import { Badge, Drawer, Empty, ErrorNote, Field, FormSection, KpiCard, Loading, Modal, PageHeader, Segmented, statusTone, useToast } from "../../ui";

const BOARD = ["Sent", "Opened", "Submitted", "Needs completion", "Verified", "Rejected"];
// Mirrors BOARD_MOVES on the server; the server re-checks every move.
const MOVES = new Set(["Submitted>Verified", "Submitted>Rejected", "Submitted>Needs completion", "Rejected>Sent", "Needs completion>Sent", "Opened>Sent"]);
const OPEN = new Set(["Sent", "Opened", "Needs completion"]);


export default function Suppliers() {
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("table");
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const q = useQuery({ queryKey: ["supplier-requests"], queryFn: () => api.get("/supplier-requests") });
  const done = (msg) => { qc.invalidateQueries(); setSel(null); toast(msg); };
  const review = useMutation({
    mutationFn: ({ id, decision, note }) => api.post(`/supplier-requests/${id}/review`, { decision, note }),
    onSuccess: (_r, v) => done({ accept: "Accepted – import lines switched to verified actual data", complete: "Sent back to the supplier for completion", reject: "Submission rejected" }[v.decision] ?? "Updated"),
    onError: (e) => toast(String((e ).message)),
  });
  const move = useMutation({
    mutationFn: ({ id, status }) => api.post(`/supplier-requests/${id}/status`, { status }),
    onSuccess: (_r, v) => done(`Moved to ${v.status}`),
    onError: (e) => toast(String((e ).message)),
  });
  const remind = useMutation({
    mutationFn: (id) => api.post(`/supplier-requests/${id}/remind`),
    onSuccess: (r) => { qc.invalidateQueries(); toast("Reminder logged – opening your mail client"); window.open(r.mailto, "_blank"); },
    onError: (e) => toast(String((e ).message)),
  });
  const count = (...s) => q.data?.filter((r) => s.includes(r.status)).length ?? 0;
  const link = (t) => `${window.location.origin}/cbam/supplier/${t}`;
  const data = q.data ?? [];
  const cns = [...new Set(data.flatMap((r) => r.cn_codes))].sort();

  return (
    <div>
      <PageHeader icon={<Truck size={22} />} title="Supplier Data Requests" subtitle="Collect verified SEE / SEFA from producers to replace marked-up default values"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New Request</button>} />
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiCard label="Sent / opened" value={count("Sent", "Opened")} icon={<Send size={18} />} accent="amber" />
          <KpiCard label="Awaiting review" value={count("Submitted")} icon={<Mail size={18} />} accent="blue" />
          <KpiCard label="Needs completion" value={count("Needs completion")} icon={<RotateCcw size={18} />} accent="orange" />
          <KpiCard label="Verified" value={count("Verified")} icon={<CheckCircle2 size={18} />} accent="green" />
          <KpiCard label="Rejected" value={count("Rejected")} icon={<XCircle size={18} />} accent="red" />
        </div>
        <Segmented value={view} onChange={setView} pill options={[{ value: "table", label: "List" }, { value: "board", label: "Status board" }, { value: "cn", label: "By CN code" }]} />

        {q.isLoading ? <Loading /> : !data.length ? (
          <div className="card"><Empty icon={<Truck size={22} />} title="No requests yet" body="Send a secure link to a supplier; they submit verified data without a SustainRepo login." /></div>
        ) : view === "table" ? (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr>{["Supplier", "Country", "CN codes", "Lines", "Due", "Status", "Reminded", "Updated", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{data.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-gray-50/70" onClick={() => setSel(r)}>
                  <td className="td font-semibold">{r.supplier_name}<div className="text-xs font-normal text-ink-soft">{r.supplier_email}</div></td>
                  <td className="td">{r.country}</td><td className="td">{r.cn_codes.join(", ") || "–"}</td><td className="td">{r.import_line_ids.length}</td>
                  <td className="td">{fmt.date(r.due_date)}</td>
                  <td className="td"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="td text-xs">{r.reminders ? <>{r.reminders}× · {fmt.date(r.last_reminded ?? undefined)}</> : "–"}</td>
                  <td className="td text-xs text-ink-soft">{fmt.dateTime(r.updated_at)}</td>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {OPEN.has(r.status) && <button className="btn-ghost px-2" title="Send reminder" onClick={() => remind.mutate(r.id)}><BellRing size={14} /></button>}
                      <button className="btn-ghost px-2" title="Copy supplier link" onClick={() => { navigator.clipboard?.writeText(link(r.token)); toast("Supplier link copied"); }}><Copy size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : view === "board" ? (
          <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
            {BOARD.map((col) => {
              const ok = drag && MOVES.has(`${drag.status}>${col}`);
              return (
                <div key={col} onDragOver={(e) => ok && e.preventDefault()}
                  onDrop={() => { if (drag && ok) move.mutate({ id: drag.id, status: col }); setDrag(null); }}
                  className={`min-h-[240px] rounded-card border-2 border-dashed p-2.5 transition ${ok ? "border-brand bg-mint/40" : drag ? "border-transparent bg-gray-100/60 opacity-60" : "border-transparent bg-gray-100/60"}`}>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <Badge tone={statusTone(col)}>{col}</Badge><span className="text-xs text-ink-soft">{data.filter((r) => r.status === col).length}</span>
                  </div>
                  <div className="space-y-2">
                    {data.filter((r) => r.status === col).map((r) => (
                      <div key={r.id} draggable onDragStart={() => setDrag(r)} onDragEnd={() => setDrag(null)} onClick={() => setSel(r)}
                        className="card cursor-grab p-3 text-[13px] active:cursor-grabbing">
                        <div className="font-medium">{r.supplier_name}</div>
                        <div className="text-xs text-ink-soft">{r.cn_codes.join(", ") || "–"} · due {fmt.date(r.due_date)}</div>
                        {!!r.reminders && <div className="mt-1 text-[11px] text-amber-700">{r.reminders} reminder(s)</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-ink-soft md:col-span-3 xl:col-span-6">Drag a card to review it: Submitted → Verified / Needs completion / Rejected, or re-open a rejected request. Other moves happen automatically when the supplier opens or submits.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Supplier</th>{cns.map((c) => <th key={c} className="th text-center">{c}</th>)}</tr></thead>
              <tbody>{[...new Set(data.map((r) => r.supplier_name))].map((name) => (
                <tr key={name}>
                  <td className="td font-medium">{name}</td>
                  {cns.map((c) => {
                    const r = data.find((x) => x.supplier_name === name && x.cn_codes.includes(c));
                    return <td key={c} className="td text-center">{r ? <button onClick={() => setSel(r)}><Badge tone={statusTone(r.status)}>{r.status}</Badge></button> : <span className="text-ink-soft">·</span>}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {open && <NewRequest onClose={() => setOpen(false)} onDone={(r) => { qc.invalidateQueries(); setOpen(false); navigator.clipboard?.writeText(link(r.token)); toast("Request created – link copied to clipboard"); }} />}
      {sel && <RequestDrawer r={sel} link={link(sel.token)} onClose={() => setSel(null)} busy={review.isPending}
        onRemind={() => remind.mutate(sel.id)} onReview={(decision, note) => review.mutate({ id: sel.id, decision, note })} />}
      {node}
    </div>
  );
}

function RequestDrawer({ r, link, onClose, onReview, onRemind, busy }

) {
  const [note, setNote] = useState("");
  const sub = r.submission;
  const cp = sub?.carbon_price;
  return (
    <Drawer title={<>Request · {r.supplier_name}</>} onClose={onClose}>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={statusTone(r.status)}>{r.status}</Badge>
          <a className="flex items-center gap-1 text-blue-600" href={link} target="_blank" rel="noreferrer">Open supplier portal <ExternalLink size={13} /></a>
          {OPEN.has(r.status) && <button className="btn-outline py-1 text-xs" onClick={onRemind}><BellRing size={13} /> Remind</button>}
        </div>
        {r.review_note && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">Last review note: {r.review_note}</p>}
        {sub ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[["Installation", sub.installation_name], ["Route", sub.route || "–"], ["Verifier", sub.verifier || "–"], ["Verification report", sub.verification_report || "– missing"],
                ["Submitted", fmt.dateTime(sub.submitted_at)]].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line px-3 py-2"><div className="text-xs text-ink-soft">{k}</div><div className="font-medium">{v}</div></div>
              ))}
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Goods (tCO₂e per tonne)</h4>
              <table className="w-full overflow-hidden rounded-lg border border-line text-[13px]">
                <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">CN</th><th className="px-3 py-2 text-right">SEE dir</th><th className="px-3 py-2 text-right">SEE ind</th><th className="px-3 py-2 text-right">SEFA</th></tr></thead>
                <tbody>{(sub.goods ?? [sub]).map((g, i) => (
                  <tr key={i} className="border-t border-line"><td className="px-3 py-2">{g.cn_code || r.cn_codes.join(", ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt.n(g.see_direct, 3)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt.n(g.see_indirect, 3)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt.n(g.sefa, 3)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {cp && <div className="rounded-lg border border-line p-3"><div className="text-xs text-ink-soft">Carbon price paid</div>
              <div className="font-medium">{cp.scheme || cp.type} · {cp.amount_per_t} {cp.currency}/t − {cp.rebate_per_t || 0} rebate → {fmt.eur(sub.carbon_price_paid, 2)}/t</div>
              {(sub.carbon_price_warnings ?? []).map((w) => <div key={w} className="mt-1 text-xs text-amber-700">{w}</div>)}</div>}
            {!!sub.precursors?.length && <div className="text-xs text-ink-soft">{sub.precursors.length} precursor(s) declared</div>}
            {r.status === "Submitted" && (
              <div className="space-y-3 border-t border-line pt-4">
                <Field label="Review note" hint="Sent to the supplier when you ask for completion or reject"><textarea className="input h-16" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={busy} onClick={() => onReview("accept", note)}>Accept & apply to {r.import_line_ids.length} line(s)</button>
                  <button className="btn-outline rounded-full" disabled={busy} onClick={() => onReview("complete", note)}><RotateCcw size={14} /> Needs completion</button>
                  <button className="btn-outline rounded-full text-red-600" disabled={busy} onClick={() => onReview("reject", note)}>Reject</button>
                </div>
              </div>
            )}
          </>
        ) : <p className="rounded-lg bg-gray-50 p-3 text-ink-soft">No submission yet.</p>}
        {!!r.history?.length && (
          <div>
            <h4 className="mb-2 font-semibold">History</h4>
            <ol className="space-y-1.5 border-l border-line pl-4 text-xs">
              {r.history.map((h, i) => <li key={i}><b>{h.status}</b> · {fmt.dateTime(h.at)} · {h.by}{h.note ? ` – ${h.note}` : ""}</li>)}
            </ol>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function NewRequest({ onClose, onDone }) {
  const sups = useQuery({ queryKey: ["suppliers"], queryFn: () => api.get("/platform/suppliers") });
  const lines = useQuery({ queryKey: ["imports"], queryFn: () => api.get("/imports") });
  const [f, setF] = useState({ supplier_id: "", due_date: "", message: "" });
  const [sel, setSel] = useState([]);
  const cand = (lines.data ?? []).filter((l) => l.supplier_id === f.supplier_id && l.basis === "default");
  const m = useMutation({
    mutationFn: () => api.post("/supplier-requests", { ...f, import_line_ids: sel, cn_codes: [...new Set(cand.filter((l) => sel.includes(l.id)).map((l) => l.cn_code))], reporting_year: 2026 }),
    onSuccess: onDone,
  });
  return (
    <Modal title="New Supplier Data Request" onClose={onClose}>
      <FormSection title="Primary information" subtitle="The supplier gets a secure link – no SustainRepo account needed. Wording comes from Workflow Settings.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier" required icon={<Truck size={15} />}><select className="input" value={f.supplier_id} onChange={(e) => { setF({ ...f, supplier_id: e.target.value }); setSel([]); }}>
            <option value="">Select supplier</option>{sups.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}</select></Field>
          <Field label="Due date" hint="Empty = workflow default" icon={<CalendarDays size={15} />}><input type="date" className="input" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Additional note (optional)"><textarea className="input h-20" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field></div>
        </div>
      </FormSection>
      <FormSection title="Import lines on default values" subtitle={`${sel.length} selected · accepted data will switch them to verified actual`}>
        {!f.supplier_id ? <p className="text-sm text-ink-soft">Choose a supplier first.</p> : !cand.length ? <p className="text-sm text-ink-soft">No default-value lines for this supplier.</p> : (
          <table className="w-full"><tbody>{cand.map((l) => (
            <tr key={l.id}><td className="td w-8"><input type="checkbox" checked={sel.includes(l.id)} onChange={(e) => setSel(e.target.checked ? [...sel, l.id] : sel.filter((x) => x !== l.id))} /></td>
              <td className="td font-medium">{l.cn_code}</td><td className="td">{l.description}</td><td className="td">{fmt.n(l.net_mass, 1)} t</td><td className="td">{fmt.n(l.calc.certificates, 1)} certificates</td><td className="td">{fmt.eur(l.calc.cost)}</td></tr>
          ))}</tbody></table>
        )}
      </FormSection>
      <ErrorNote error={m.error} />
      <div className="flex justify-end gap-3"><button className="btn-outline rounded-full" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.supplier_id || m.isPending} onClick={() => m.mutate()}><Send size={15} />Create & copy link</button></div>
    </Modal>
  );
}
