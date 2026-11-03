import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Award, BellRing, CalendarClock, CheckCircle2, Coins, Factory, Info, Leaf, PiggyBank, Scale, Truck } from "lucide-react";
import { api, fmt } from "../api";
import { DashboardFrame, SECTOR_COLOR, useDashboard } from "../dashboard";
import { Badge, ChartCard, ErrorNote, KpiCard, LegendRow, Loading, Segmented, useToast } from "../../ui";

const FUNNEL = ["Sent", "Opened", "Submitted", "Needs completion", "Verified"] ;
const TONE = { red: "text-red-600", amber: "text-amber-600", blue: "text-blue-600" };

export default function Overview() {
  const d = useDashboard();
  const [view, setView] = useState("certificates");
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const remind = useMutation({
    mutationFn: () => api.post("/supplier-requests/run-reminders"),
    onSuccess: (r) => { toast(`${r.reminded} reminder(s) logged`); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const frame = (body) => (
    <DashboardFrame title="Org1 · CBAM Dashboard" d={d}
      onExport={() => api.download(`/declarations/${d.year}/export.pdf`, `CBAM_declaration_${d.year}.pdf`)}>{body}</DashboardFrame>
  );
  if (d.q.isLoading) return frame(<Loading />);
  if (d.q.error) return frame(<div className="p-6"><ErrorNote error={d.q.error} /></div>);
  const s = d.q.data;
  const total = s.basis_split.default + s.basis_split.actual || 1;
  const donut = [
    { name: "Default values", value: s.basis_split.default, color: "#3b5bdb" },
    { name: "Verified actual", value: s.basis_split.actual, color: "#0f9f8f" },
  ];
  const maxCn = Math.max(...s.by_cn.map((r) => r.certificates), 1);
  const req = s.supplier_requests ?? {};
  const maxReq = Math.max(...FUNNEL.map((k) => req[k] ?? 0), 1);
  const alerts = [
    ...(!s.obligated ? [{ n: null, label: `Imports are below the ${s.deminimis_t} t de minimis threshold – no CBAM obligation applies`, to: "/cbam/declarations", tone: "blue" }] : []),
    { n: s.lines_with_errors, label: "line(s) cannot be calculated", to: "/cbam/imports", tone: "red" },
    { n: s.floored_lines, label: "line(s) floored at zero – check SEFA", to: "/cbam/imports", tone: "amber" },
    { n: s.missing_origin, label: "line(s) without country of origin", to: "/cbam/imports", tone: "amber" },
    { n: s.awaiting_supplier, label: "line(s) awaiting supplier data", to: "/cbam/suppliers", tone: "blue" },
    { n: s.warning_lines, label: "line(s) with calculation warnings", to: "/cbam/imports", tone: "amber" },
  ].filter((a) => a.n === null || a.n > 0);
  const today = new Date().toISOString().slice(0, 10);

  return frame(
    <div className="space-y-5 p-6">
      {node}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Embedded emissions" value={fmt.n(s.embedded, 1)} unit="tCO₂e" icon={<Leaf size={18} />} accent="green"
          delta={<>{fmt.n(s.net_mass, 1)} t imported · {s.lines} lines</>} />
        <KpiCard label="Free allocation adj." value={fmt.n(s.faa, 1)} unit="tCO₂e" icon={<Scale size={18} />} accent="teal"
          delta={<>Deducted at {fmt.pct(s.projection[0]?.cbam_factor)} CBAM factor</>} />
        <KpiCard label="Certificates required" value={s.certificates_whole.toLocaleString("en-GB")} icon={<Award size={18} />} accent="purple"
          delta={<>{fmt.n(s.certificates, 1)} exact · penalty exposure {fmt.eur(s.penalty_exposure)}</>} />
        <KpiCard label="Estimated cost" value={fmt.eur(s.cost)} icon={<Coins size={18} />} accent="amber"
          delta={<>{fmt.eur(s.avg_cost_per_t, 2)} per tonne imported</>} />
        <KpiCard label="Actual-data coverage" value={fmt.pct(s.actual_coverage, 0)} icon={<Truck size={18} />} accent="blue" bar={s.actual_coverage}
          delta={<>{req.Submitted ?? 0} supplier submission(s) to review</>} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="By quarter of import" subtitle="2026 prices are quarterly; weekly from 2027" accent="orange"
          right={<Segmented value={view} onChange={setView} options={[{ value: "certificates", label: "Certificates" }, { value: "cost", label: "Cost €" }]} />}>
          <div className="min-h-[280px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.by_quarter} barGap={2}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={56}
                  tickFormatter={(v) => (view === "cost" ? `€${Math.round(v / 1000)}k` : fmt.n(v, 0))} />
                <Tooltip formatter={(v) => (view === "cost" ? fmt.eur(v) : fmt.n(v, 1))} cursor={{ fill: "#f1f5f9" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {view === "certificates" ? (
                  <>
                    <Bar dataKey="embedded" name="Embedded" fill="#334155" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="faa" name="Free allocation adj." fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="certificates" name="Certificates" fill="#8b5cf6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </>
                ) : <Bar dataKey="cost" name="Cost (€)" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Data basis" subtitle="Share of embedded emissions" accent="blue">
          <div className="relative mx-auto h-[200px] w-full max-w-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius="70%" outerRadius="96%" startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                  {donut.map((x) => <Cell key={x.name} fill={x.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `${fmt.n(v, 0)} tCO₂e`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] uppercase text-ink-soft">Total</span>
              <span className="text-xl font-semibold">{fmt.n(s.embedded, 0)}</span>
              <span className="text-[11px] text-ink-soft">tCO₂e</span>
            </div>
          </div>
          <div className="mt-auto space-y-2 pt-4">
            {donut.map((x) => <LegendRow key={x.name} color={x.color} label={x.name} value={fmt.pct(x.value / total)} />)}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Obligation by CN code" subtitle="Top contributors to certificates" accent="purple"
          right={<div className="text-right"><div className="kpi-label">Total</div><div className="font-semibold">{fmt.n(s.certificates, 1)}</div></div>}>
          {/* One grid for header + rows so every column lines up. */}
          <div className="grid grid-cols-[minmax(140px,1.3fr)_minmax(60px,2fr)_96px_56px] items-center gap-x-4 text-sm">
            {["CN code", "Relative", "Certificates", "Share"].map((h, i) => (
              <span key={h} className={`pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft ${i >= 2 ? "text-right" : ""}`}>{h}</span>
            ))}
            {s.by_cn.slice(0, 6).map((r) => (
              <div key={r.cn_code} className="contents">
                <div className="flex min-w-0 items-center gap-2.5 border-t border-line py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: `${SECTOR_COLOR[r.sector] ?? "#64748b"}1a`, color: SECTOR_COLOR[r.sector] }}>
                    <Factory size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium" title={r.description}>{r.cn_code}</div>
                    <Badge tiny tone="green">{r.sector}</Badge>
                  </div>
                </div>
                <div className="flex h-full items-center border-t border-line">
                  <div className="h-2.5 w-full rounded-full bg-gray-100"><div className="h-2.5 rounded-full" style={{ width: `${(r.certificates / maxCn) * 100}%`, background: SECTOR_COLOR[r.sector] ?? "#10b981" }} /></div>
                </div>
                <span className="flex h-full items-center justify-end border-t border-line font-semibold tabular-nums">{fmt.n(r.certificates, 1)}</span>
                <span className="flex h-full items-center justify-end border-t border-line">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs tabular-nums">{fmt.pct(r.certificates / (s.certificates || 1), 0)}</span>
                </span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Deadlines & obligations" subtitle={`What is due for ${d.year} imports`} accent="red">
          <ol className="relative space-y-4 border-l border-line pl-4">
            {s.deadlines.map((x) => {
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
          <Link to="/cbam/holdings" className="mt-auto pt-4 text-sm font-medium text-brand hover:underline"><CalendarClock size={14} className="mr-1 inline" />Open holding tracker</Link>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Supplier responses" subtitle="Data requests by stage, and what needs attention" accent="blue"
          right={<button className="btn-outline py-1.5 text-xs" disabled={remind.isPending} onClick={() => remind.mutate()}><BellRing size={13} /> Run due reminders</button>}>
          <div className="space-y-3">
            {FUNNEL.map((k) => (
              <div key={k} className="grid grid-cols-[130px_1fr_28px] items-center gap-3 text-[13px]">
                <span className="text-ink-soft">{k}</span>
                <div className="h-2.5 rounded-full bg-gray-100"><div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${((req[k] ?? 0) / maxReq) * 100}%` }} /></div>
                <span className="text-right font-semibold tabular-nums">{req[k] ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto border-t border-line pt-4">
            <div className="kpi-label mb-2">Data quality</div>
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 size={15} /> No open issues</div>
            ) : alerts.map((a) => (
              <Link key={a.label} to={a.to} className="flex items-start gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-gray-50">
                {a.n === null ? <Info size={14} className={`mt-0.5 shrink-0 ${TONE[a.tone]}`} /> : <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${TONE[a.tone]}`} />}
                <span>{a.n !== null && <span className="font-semibold tabular-nums">{a.n} </span>}{a.label}</span>
              </Link>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Top savings opportunities" subtitle="Minimum saved if these suppliers send verified data (default mark-up removed)" accent="lime">
          {s.savings.length === 0 ? <p className="text-sm text-ink-soft">All lines already use verified data.</p> : (
            <div className="divide-y divide-line">
              {s.savings.slice(0, 5).map((x) => (
                <div key={x.line_id} className="flex items-center gap-3 py-3 first:pt-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-lime-50 text-lime-700"><PiggyBank size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{x.supplier_name}</div>
                    <div className="text-[11px] text-ink-soft">{x.cn_code} · {x.country} · mark-up {fmt.pct(x.markup, 0)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">≥ {fmt.eur(x.avoided_eur)}</div>
                    <div className="text-[11px] text-ink-soft tabular-nums">{fmt.n(x.avoided_certificates, 1)} cert.</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link to="/cbam/geography" className="mt-auto pt-4 text-sm font-medium text-brand hover:underline">Open supplier geography →</Link>
        </ChartCard>
      </div>
    </div>,
  );
}
