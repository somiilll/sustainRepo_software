import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, CalendarClock, Coins, Gauge, Plus, ShoppingCart, Undo2 } from "lucide-react";
import { api, fmt } from "../api";
import { DashboardFrame, useDashboard } from "../dashboard";
import { Badge, ChartCard, ErrorNote, KpiCard, Loading, useToast } from "../../ui";
import RecordTransaction from "../components/RecordTransaction";








const KINDS = new Set(["holding", "platform", "declaration", "repurchase"]);
const BUDGET_PRICES = [60, 120];

export default function CertificatesDashboard() {
  const d = useDashboard();
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [recording, setRecording] = useState(false);
  const year = +d.year;
  const pos = useQuery({ queryKey: ["position", year], queryFn: () => api.get(`/certificates/position?year=${year}`) });
  const led = useQuery({ queryKey: ["ledger"], queryFn: () => api.get("/certificates") });
  const recordButton = <button className="btn-primary" onClick={() => setRecording(true)} data-testid="cbam-record-transaction"><Plus size={16} /> Record Transaction</button>;
  const frame = (body) => <DashboardFrame title="Org1 · CBAM certificates" d={d} hideFilters tabsRight={recordButton}>{body}{node}</DashboardFrame>;
  if (pos.isLoading) return frame(<Loading />);
  if (pos.error) return frame(<div className="p-6"><ErrorNote error={pos.error} /></div>);
  const p = pos.data;

  const entries = (led.data ?? []).filter((e) => e.obligation_year === year);
  const bought = entries.filter((e) => e.kind === "purchase");
  const boughtQty = bought.reduce((a, e) => a + e.quantity, 0);
  const avgPrice = boughtQty ? bought.reduce((a, e) => a + e.quantity * e.price, 0) / boughtQty : null;
  const spend = bought.reduce((a, e) => a + e.quantity * e.price, 0);
  const covered = p.held + p.surrendered;
  const coverage = p.obligation_whole ? Math.min(1, covered / p.obligation_whole) : 1;
  const donut = [
    { name: "Covered (held + surrendered)", value: Math.min(covered, p.obligation_whole), color: "#0f9f8f" },
    { name: "Still to buy", value: p.to_buy, color: "#d97706" },
  ];
  const prices = [...new Set([...BUDGET_PRICES, p.price_hint ? Math.round(p.price_hint) : 80])].sort((a, b) => a - b);
  const today = new Date().toISOString().slice(0, 10);
  const deadlines = (d.q.data?.deadlines ?? []).filter((x) => KINDS.has(x.kind));

  return frame(
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Obligation" value={p.obligation_whole.toLocaleString("en-GB")} unit="certificates" icon={<Award size={18} />} accent="purple"
          delta={<>{fmt.n(p.obligation, 1)} exact · imports of {year}</>} />
        <KpiCard label="Held" value={p.held.toLocaleString("en-GB")} icon={<ShoppingCart size={18} />} accent="green"
          delta={avgPrice ? <>Avg paid {fmt.eur(avgPrice, 2)}{p.price_hint ? ` vs ${fmt.eur(p.price_hint, 2)} market` : ""}</> : <>No purchases recorded</>} />
        <KpiCard label="Coverage" value={fmt.pct(coverage, 0)} icon={<Gauge size={18} />} accent="blue" bar={coverage}
          delta={<>{p.surrendered.toLocaleString("en-GB")} already surrendered</>} />
        <KpiCard label="Still to buy" value={p.to_buy.toLocaleString("en-GB")} icon={<Coins size={18} />} accent="amber"
          delta={<>≈ {fmt.eur(p.to_buy * (p.price_hint || 0))} at {fmt.eur(p.price_hint, 2)}</>} />
        <KpiCard label="Excess (repurchase)" value={p.excess.toLocaleString("en-GB")} icon={<Undo2 size={18} />} accent="teal"
          delta={<>Request by {fmt.date(p.repurchase_deadline)}</>} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Quarterly holding requirement" accent="purple"
          subtitle={p.holding_rule_applies ? `Hold ≥ ${fmt.pct(p.holding_pct, 0)} of cumulative net emissions at each quarter end` : "The holding rule applies from 2027 imports – shown here for planning"}>
          <div className="min-h-[280px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.quarters} barGap={2}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmt.n(v, 0)} />
                <Tooltip formatter={(v) => fmt.n(v, 0)} cursor={{ fill: "#f1f5f9" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cumulative_net" name="Cumulative net emissions" fill="#334155" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="required" name="Required holding" fill="#8b5cf6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="held" name="Held" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Coverage & budget" subtitle="How much of the obligation is covered, and what the gap costs" accent="blue">
          <div className="relative mx-auto h-[170px] w-full max-w-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius="70%" outerRadius="96%" startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                  {donut.map((x) => <Cell key={x.name} fill={x.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `${fmt.n(v, 0)} certificates`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold">{fmt.pct(coverage, 0)}</span>
              <span className="text-[11px] text-ink-soft">covered</span>
            </div>
          </div>
          <div className="mt-auto border-t border-line pt-4">
            <div className="kpi-label mb-2">Cost of the {p.to_buy.toLocaleString("en-GB")} remaining</div>
            <div className="space-y-1.5">
              {prices.map((x) => (
                <div key={x} className={`flex justify-between text-[13px] ${Math.round(p.price_hint) === x ? "font-semibold" : ""}`}>
                  <span className="text-ink-soft">at €{x}</span><span className="tabular-nums">{fmt.eur(p.to_buy * x)}</span>
                </div>
              ))}
            </div>
            {spend > 0 && <div className="mt-3 text-xs text-ink-soft">Spent so far: <b className="text-ink">{fmt.eur(spend)}</b> on {boughtQty.toLocaleString("en-GB")} certificates</div>}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Recent transactions" subtitle={`Ledger entries for obligation year ${year}`} accent="green"
>
          {led.isLoading ? <Loading /> : !entries.length ? (
            <p className="text-sm text-ink-soft">No transactions recorded for {year} yet. Certificate sales open on {fmt.date(p.sales_open)}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead><tr>{["Date", "Type", "Quantity", "Price", "Value", "Note"].map((h, i) => <th key={h} className={`th px-3 ${i >= 2 && i <= 4 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                <tbody>{entries.slice(0, 6).map((e) => (
                  <tr key={e.id}>
                    <td className="td px-3">{fmt.date(e.date)}</td>
                    <td className="td px-3"><Badge tone={e.kind === "purchase" ? "green" : e.kind === "surrender" ? "purple" : "amber"}>{e.kind}</Badge></td>
                    <td className="td px-3 text-right font-semibold tabular-nums">{e.quantity.toLocaleString("en-GB")}</td>
                    <td className="td px-3 text-right tabular-nums">{fmt.n(e.price, 2)}</td>
                    <td className="td px-3 text-right tabular-nums">{fmt.eur(e.quantity * e.price)}</td>
                    <td className="td px-3 text-ink-soft">{e.note}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Certificate deadlines" subtitle="Holding checks, sales, surrender and repurchase" accent="red">
          <ol className="relative space-y-4 border-l border-line pl-4">
            {deadlines.map((x) => {
              const past = x.date < today;
              return (
                <li key={x.date + x.label} className="relative">
                  <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${past ? "bg-gray-300" : "bg-brand"}`} />
                  <div className={`text-xs font-semibold tabular-nums ${past ? "text-ink-soft" : "text-ink"}`}>{fmt.date(x.date)}</div>
                  <div className={`text-[13px] ${past ? "text-ink-soft line-through" : ""}`}>{x.label}</div>
                </li>
              );
            })}
          </ol>
          <button className="mt-auto pt-4 text-left text-sm font-medium text-brand hover:underline" onClick={() => setRecording(true)}><CalendarClock size={14} className="mr-1 inline" />Record a transaction</button>
        </ChartCard>
      </div>
      {recording && <RecordTransaction year={year} price={p.price_hint} onClose={() => setRecording(false)}
        onDone={() => { qc.invalidateQueries(); setRecording(false); toast("Transaction recorded"); }} />}
    </div>,
  );
}
