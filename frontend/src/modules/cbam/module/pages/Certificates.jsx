import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, CalendarClock, Coins, Plus, ShoppingCart, Trash2, Undo2 } from "lucide-react";
import { api, fmt } from "../api";
import { Badge, ChartCard, ErrorNote, Field, FormSection, KpiCard, Loading, Modal, PageHeader, useToast } from "../../ui";








export default function Certificates() {
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [year, setYear] = useState(2026);
  const [open, setOpen] = useState(false);
  const pos = useQuery({ queryKey: ["position", year], queryFn: () => api.get(`/certificates/position?year=${year}`) });
  const led = useQuery({ queryKey: ["ledger"], queryFn: () => api.get("/certificates") });
  const del = useMutation({ mutationFn: (id) => api.del(`/certificates/${id}`), onSuccess: () => { qc.invalidateQueries(); toast("Entry removed"); } });
  if (pos.isLoading) return <Loading />;
  const p = pos.data;
  return (
    <div>
      <PageHeader icon={<Award size={22} />} title="CBAM Certificates" subtitle={`Obligation year ${year} · platform sales from ${fmt.date(p.sales_open)} · surrender by ${fmt.date(p.surrender_deadline)}`}
        actions={<>
          <select className="input w-28 rounded-full" value={year} onChange={(e) => setYear(+e.target.value)}><option>2026</option><option>2027</option></select>
          <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Record Transaction</button>
        </>} />
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-5 gap-4">
          <KpiCard label="Obligation" value={p.obligation_whole.toLocaleString("en-GB")} unit="certificates" icon={<Award size={18} />} accent="purple" delta={<>{fmt.n(p.obligation, 1)} exact</>} />
          <KpiCard label="Held" value={p.held.toLocaleString("en-GB")} icon={<ShoppingCart size={18} />} accent="green" />
          <KpiCard label="Still to buy" value={p.to_buy.toLocaleString("en-GB")} icon={<Coins size={18} />} accent="amber" delta={<>≈ {fmt.eur(p.to_buy * (p.price_hint || 0))} at {fmt.eur(p.price_hint, 2)}</>} />
          <KpiCard label="Excess (repurchase)" value={p.excess.toLocaleString("en-GB")} icon={<Undo2 size={18} />} accent="teal" delta={<>Request by {fmt.date(p.repurchase_deadline)}</>} />
          <KpiCard label="Surrendered" value={p.surrendered.toLocaleString("en-GB")} icon={<CalendarClock size={18} />} accent="slate" delta={<>Deadline {fmt.date(p.surrender_deadline)}</>} />
        </div>
        <ChartCard title="Quarterly holding requirement" accent="purple"
          subtitle={p.holding_rule_applies ? `Hold ≥ ${fmt.pct(p.holding_pct, 0)} of cumulative net emissions at each quarter end` : "Holding rule applies from 2027 – shown for planning only"}>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={p.quarters}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: "#64748b" }} /><YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip formatter={(v) => fmt.n(v, 0)} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="cumulative_net" name="Cumulative net emissions" fill="#334155" radius={[4, 4, 0, 0]} />
              <Bar dataKey="required" name="Required holding" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="held" name="Held" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="card overflow-x-auto">
          <div className="px-5 pt-4 text-[15px] font-semibold">Ledger</div>
          {led.isLoading ? <Loading /> : (
            <table className="mt-2 w-full">
              <thead><tr>{["Date", "Type", "Quantity", "Price (€)", "Value (€)", "Obligation year", "Note", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{led.data?.map((e) => (
                <tr key={e.id}><td className="td">{fmt.date(e.date)}</td><td className="td"><Badge tone={e.kind === "purchase" ? "green" : e.kind === "surrender" ? "purple" : "amber"}>{e.kind}</Badge></td>
                  <td className="td font-semibold tabular-nums">{e.quantity.toLocaleString("en-GB")}</td><td className="td tabular-nums">{fmt.n(e.price, 2)}</td>
                  <td className="td tabular-nums">{fmt.eur(e.quantity * e.price)}</td><td className="td">{e.obligation_year}</td><td className="td text-ink-soft">{e.note}</td>
                  <td className="td"><button className="text-red-600" onClick={() => del.mutate(e.id)}><Trash2 size={14} /></button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {open && <NewEntry year={year} price={p.price_hint} onClose={() => setOpen(false)} onDone={() => { qc.invalidateQueries(); setOpen(false); toast("Transaction recorded"); }} />}
      {node}
    </div>
  );
}

function NewEntry({ year, price, onClose, onDone }) {
  const [f, setF] = useState({ kind: "purchase", quantity: "", price: price ? price.toFixed(2) : "", date: "2027-02-15", note: "" });
  const m = useMutation({ mutationFn: () => api.post("/certificates", { ...f, obligation_year: year }), onSuccess: onDone });
  return (
    <Modal title="Record Certificate Transaction" onClose={onClose} wide={false}>
      <FormSection title="Transaction" subtitle="Purchases on the common central platform, surrenders and repurchases with your NCA.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" required><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="purchase">Purchase</option><option value="surrender">Surrender</option><option value="repurchase">Repurchase</option></select></Field>
          <Field label="Date" required><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Quantity (certificates)" required><input type="number" className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          <Field label="Price (€ / certificate)"><input type="number" step="any" className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
        </div>
      </FormSection>
      <ErrorNote error={m.error} />
      <div className="flex justify-end gap-3"><button className="btn-outline rounded-full" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.quantity} onClick={() => m.mutate()}>Save</button></div>
    </Modal>
  );
}
