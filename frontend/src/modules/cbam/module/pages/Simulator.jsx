import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Coins, Copy, Download, Info, Plus, RotateCcw, Save, Scale, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { api, fmt } from "../api";
import { DashboardFrame, useDashboard } from "../dashboard";

import { Badge, ChartCard, Empty, ErrorNote, KpiCard, Segmented, useToast } from "../../ui";






const BLANK = { cn_code: "", country_of_origin: "", net_mass: 100, basis: "default" };
const PRESETS = [{ label: "Low", v: 60 }, { label: "Base", v: 80 }, { label: "High", v: 120 }];

function useDebounced(v, ms = 350) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

function Slider({ label, value, min, max, step, onChange, show }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="font-semibold tabular-nums text-brand">{show}</span></div>
      <input type="range" className="w-full accent-[#14532d]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <div className="flex justify-between text-[11px] text-ink-soft"><span>{min}</span><span>{max}</span></div>
    </label>
  );
}

export default function Simulator() {
  const d = useDashboard();
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [rows, setRows] = useState([]);
  const [price, setPrice] = useState(80);
  const [pg, setPg] = useState(0.05);
  const [vg, setVg] = useState(0);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("annual");
  const imports = useQuery({ queryKey: ["imports", d.year], queryFn: () => api.get(`/imports?year=${d.year}`) });
  const scenarios = useQuery({ queryKey: ["scenarios"], queryFn: () => api.get("/scenarios") });
  const countries = useQuery({ queryKey: ["countries"], queryFn: () => api.get("/reference/countries"), staleTime: Infinity });
  const loadImports = () => setRows((imports.data ?? []).filter((l) => !l.calc.error).map((l) => ({
    cn_code: l.cn_code, country_of_origin: l.country_of_origin ?? "", net_mass: l.net_mass, basis: l.basis,
    see_direct: l.see_direct, see_indirect: l.see_indirect, sefa: l.sefa })));
  useEffect(() => { if (imports.data && rows.length === 0) loadImports(); }, [imports.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const input = useDebounced({ rows, price_eur: price, price_growth: pg, volume_growth: vg });
  const sim = useQuery({ queryKey: ["simulate", input], queryFn: () => api.post("/simulate", input),
    enabled: input.rows.length > 0, placeholderData: keepPreviousData, retry: false });
  const save = useMutation({
    mutationFn: () => api.post("/scenarios", { name, rows, price_eur: price, price_growth: pg, volume_growth: vg }),
    onSuccess: () => { toast("Scenario saved"); setName(""); qc.invalidateQueries({ queryKey: ["scenarios"] }); },
    onError: (e) => toast(String((e ).message)),
  });
  const del = useMutation({ mutationFn: (id) => api.del(`/scenarios/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }) });
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const r = sim.data;
  const proj = r?.projection ?? [];

  const chartData = useMemo(() => {
    let a = 0, b = 0;
    return proj.map((p) => {
      a += p.cost ?? 0; b += p.cost_default ?? 0;
      return { year: p.year, cost: mode === "annual" ? p.cost : a, cost_default: mode === "annual" ? p.cost_default : b };
    });
  }, [proj, mode]);

  // Total 2026-2034 cost if the EUA price path started at another level (certificates do not depend on price).
  const sensitivity = useMemo(() => {
    const total = (p0) => proj.reduce((sum, p, k) => sum + p.certificates * p0 * (1 + pg) ** k, 0);
    return [...new Set([40, 60, 80, 100, 120, 150, price])].sort((x, y) => x - y).map((p0) => ({ p0, total: total(p0) }));
  }, [proj, pg, price]);
  const maxSens = Math.max(...sensitivity.map((x) => x.total), 1);

  const c26 = proj[0]?.cost ?? 0, c34 = proj[proj.length - 1]?.cost ?? 0;
  const saving = r ? r.total_cost_default - r.total_cost : 0;
  const rowCost = (x) => (x?.certificates ?? 0) * price;
  const totals = (r?.rows ?? []).reduce((a, x) => ({ t: a.t + (x.net_mass || 0), c: a.c + (x.certificates ?? 0) }), { t: 0, c: 0 });
  const top = [...(r?.rows ?? [])].filter((x) => !x.error).sort((a, b) => (b.certificates ?? 0) - (a.certificates ?? 0))[0];
  const defaults = rows.filter((x) => x.basis === "default").length;
  const dirty = !!r;

  const exportCsv = () => {
    const lines = [
      ["Year", "CBAM factor", "Price EUR/cert", "Certificates", "Cost EUR", "Certificates (all default)", "Cost EUR (all default)"],
      ...proj.map((p) => [p.year, p.cbam_factor, p.price?.toFixed(2), p.certificates.toFixed(2), p.cost?.toFixed(0), p.certificates_default?.toFixed(2), p.cost_default?.toFixed(0)]),
      [], ["CN code", "Origin", "Tonnes", "Basis", "SEE", "SEFA", "Certificates 2026", "Cost 2026 EUR"],
      ...(r?.rows ?? []).map((x) => [x.cn_code, x.country_of_origin, x.net_mass, x.basis, x.see?.toFixed(4), x.sefa?.toFixed(4), x.certificates?.toFixed(2), rowCost(x).toFixed(0)]),
    ].map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([lines], { type: "text/csv" })), download: "CBAM_cost_scenario.csv" });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <DashboardFrame title="Org1 · CBAM cost simulator" d={d} hideFilters>
      {node}
      <datalist id="sim-countries">{(countries.data?.countries ?? []).map((c) => <option key={c} value={c} />)}</datalist>
      <div className="space-y-5 p-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={`Cost ${proj[0]?.year ?? 2026}`} value={dirty ? fmt.eur(c26) : "–"} icon={<Coins size={18} />} accent="amber" delta={<>{fmt.n(proj[0]?.certificates, 0)} certificates</>} />
        <KpiCard label="Cost at full phase-in" value={dirty ? fmt.eur(c34) : "–"} icon={<TrendingUp size={18} />} accent="red"
          delta={<>{proj[proj.length - 1]?.year ?? 2034} · {c26 ? `×${(c34 / c26).toFixed(1)} vs 2026` : "–"}</>} />
        <KpiCard label="Total 2026–2034" value={dirty ? fmt.eur(r.total_cost) : "–"} icon={<Scale size={18} />} accent="purple" delta={<>on your data basis per row</>} />
        <KpiCard label="Saved by actual data" value={dirty ? fmt.eur(saving) : "–"} icon={<TrendingDown size={18} />} accent="green"
          delta={<>{r && r.total_cost_default ? fmt.pct(saving / r.total_cost_default, 0) : "–"} below the all-default cost</>} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-5 xl:sticky xl:top-4">
          <ChartCard title="Assumptions" subtitle="EU ETS price path and import volumes" accent="amber">
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.label} onClick={() => setPrice(p.v)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${price === p.v ? "border-brand bg-brand text-white" : "border-line bg-white hover:bg-gray-50"}`}>
                      {p.label} · €{p.v}
                    </button>
                  ))}
                </div>
                <Slider label="Certificate price 2026" value={price} min={40} max={200} step={1} onChange={setPrice} show={`€${price}/t`} />
              </div>
              <Slider label="Price growth per year" value={pg} min={-0.1} max={0.2} step={0.01} onChange={setPg} show={fmt.pct(pg, 0)} />
              <Slider label="Import volume growth per year" value={vg} min={-0.2} max={0.3} step={0.01} onChange={setVg} show={fmt.pct(vg, 0)} />
              <p className="text-xs leading-relaxed text-ink-soft">CBAM factor, default mark-ups and benchmarks follow the adopted 2026–2034 schedule. Prices are your assumption, not a forecast.</p>
            </div>
          </ChartCard>
          <ChartCard title="Scenarios" subtitle="Save, reload and export" accent="slate">
            <div className="flex gap-2">
              <input className="input" placeholder="Scenario name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name && save.mutate()} />
              <button className="btn-primary px-3" disabled={!name || save.isPending} onClick={() => save.mutate()} title="Save scenario"><Save size={15} /></button>
            </div>
            {!!scenarios.data?.length && (
              <div className="mt-3 divide-y divide-line">
                {scenarios.data.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 py-2.5 text-[13px]">
                    <button className="min-w-0 flex-1 text-left hover:text-brand" onClick={() => { setRows(s.rows); setPrice(s.price_eur ?? 80); setPg(s.price_growth ?? 0); setVg(s.volume_growth ?? 0); toast(`Loaded “${s.name}”`); }}>
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="text-[11px] text-ink-soft">€{s.price_eur} · {fmt.pct(s.price_growth, 0)}/yr · {s.rows.length} rows</div>
                    </button>
                    <button className="text-ink-soft hover:text-red-600" onClick={() => del.mutate(s.id)} aria-label={`Delete ${s.name}`}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2 border-t border-line pt-4">
              <button className="btn-outline flex-1 justify-center py-1.5 text-xs" onClick={() => { loadImports(); setPrice(80); setPg(0.05); setVg(0); }}><RotateCcw size={13} /> Reset</button>
              <button className="btn-outline flex-1 justify-center py-1.5 text-xs" disabled={!r} onClick={exportCsv}><Download size={13} /> Export CSV</button>
            </div>
          </ChartCard>
        </div>

        <div className="min-w-0 space-y-5">
          {dirty && (
            <div className="card flex flex-col gap-2 border-l-4 border-l-brand p-4 text-[13px]">
              {c26 > 0 && <div className="flex gap-2"><Info size={15} className="mt-0.5 shrink-0 text-brand" />Cost grows ×{(c34 / c26).toFixed(1)} between 2026 and 2034 as free allocation phases out (CBAM factor {fmt.pct(proj[0]?.cbam_factor, 1)} → {fmt.pct(proj[proj.length - 1]?.cbam_factor, 0)}).</div>}
              {top && totals.c > 0 && <div className="flex gap-2"><Info size={15} className="mt-0.5 shrink-0 text-brand" />Biggest driver: {top.cn_code} from {top.country_of_origin || "unknown origin"} – {fmt.pct((top.certificates ?? 0) / totals.c, 0)} of the 2026 certificates.</div>}
              <div className="flex gap-2"><Info size={15} className="mt-0.5 shrink-0 text-brand" />{defaults
                ? `${defaults} of ${rows.length} rows use default values with a 10–30% mark-up. Switch a row to Actual and enter the supplier's verified SEE and SEFA to see the saving.`
                : "Every row uses verified actual data."}</div>
            </div>
          )}

          <ChartCard title={mode === "annual" ? "Cost by year" : "Cumulative cost"} subtitle="Bars: your scenario · line: same imports on default values" accent="green"
            right={<Segmented value={mode} onChange={setMode} options={[{ value: "annual", label: "Annual" }, { value: "cumulative", label: "Cumulative" }]} />}>
            {sim.error && <ErrorNote error={sim.error} />}
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => (v >= 1e6 ? `€${(v / 1e6).toFixed(1)}M` : `€${Math.round(v / 1000)}k`)} />
                  <Tooltip formatter={(v, n) => [fmt.eur(v), n]} cursor={{ fill: "#f1f5f9" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cost" name="Scenario cost" fill="#0f9f8f" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Line dataKey="cost_default" name="All-default cost" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto border-t border-line pt-3">
              <table className="w-full min-w-[600px] text-[12px]">
                <thead><tr><th />{proj.map((p) => <th key={p.year} className="px-2 py-1 text-right font-semibold text-ink">{p.year}</th>)}</tr></thead>
                <tbody>
                  {(["cbam_factor", "price", "certificates", "cost"] ).map((k) => (
                    <tr key={k} className="border-t border-line/60">
                      <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-ink-soft">{{ cbam_factor: "CBAM factor", price: "€ per certificate", certificates: "Certificates", cost: "Cost" }[k]}</td>
                      {proj.map((p) => (
                        <td key={p.year} className={`px-2 py-1.5 text-right tabular-nums ${k === "cost" ? "font-semibold" : ""}`}>
                          {k === "cbam_factor" ? fmt.pct(p.cbam_factor, 1) : k === "price" ? fmt.n(p.price, 0) : k === "certificates" ? fmt.n(p.certificates, 0) : `€${Math.round((p.cost ?? 0) / 1000)}k`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Price sensitivity" subtitle={`Total 2026–2034 cost if the certificate price starts at a different level (growth ${fmt.pct(pg, 0)}/yr as set)`} accent="blue">
            <div className="space-y-2.5">
              {sensitivity.map((x) => (
                <button key={x.p0} onClick={() => setPrice(Math.min(200, Math.max(40, x.p0)))}
                  className={`grid w-full grid-cols-[72px_1fr_110px] items-center gap-3 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-gray-50 ${x.p0 === price ? "font-semibold" : ""}`}>
                  <span className="tabular-nums">€{x.p0}</span>
                  <span className="h-2.5 rounded-full bg-gray-100"><span className="block h-2.5 rounded-full" style={{ width: `${(x.total / maxSens) * 100}%`, background: x.p0 === price ? "#14532d" : "#93c5fd" }} /></span>
                  <span className="text-right tabular-nums">{fmt.eur(x.total)}</span>
                </button>
              ))}
            </div>
          </ChartCard>

        </div>
      </div>
      <ChartCard title="Goods in the scenario" subtitle="Edit tonnes, or switch a row to verified actual data to see the effect" accent="blue"
        right={<div className="flex gap-2">
          <button className="btn-outline py-1.5 text-xs" onClick={loadImports}>Load {d.year} imports</button>
          <button className="btn-outline py-1.5 text-xs" onClick={() => setRows([...rows, { ...BLANK }])}><Plus size={13} /> Add row</button></div>}>
        {rows.length === 0 ? (
          <Empty icon={<Coins size={22} />} title="No goods yet" body="Load your imports or add a row with a CN code, country of origin and tonnes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead><tr>{["CN code", "Origin", "Tonnes", "Basis", "SEE dir", "SEE ind", "SEFA", "2026 cert.", "2026 cost", "Share", ""].map((h, i) => <th key={i} className={`th px-2 ${i >= 7 && i <= 9 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((x, i) => {
                  const res = r?.rows[i];
                  const auto = x.basis === "default";
                  return (
                    <tr key={i}>
                      <td className="td px-2 py-2"><input className="input w-28 py-1" placeholder="7208 51 20" value={x.cn_code} onChange={(e) => set(i, { cn_code: e.target.value })} /></td>
                      <td className="td px-2 py-2"><input className="input w-32 py-1" list="sim-countries" value={x.country_of_origin} onChange={(e) => set(i, { country_of_origin: e.target.value })} /></td>
                      <td className="td px-2 py-2"><input type="number" className="input w-24 py-1" value={x.net_mass} onChange={(e) => set(i, { net_mass: +e.target.value })} /></td>
                      <td className="td px-2 py-2"><select className="input w-24 py-1" value={x.basis} onChange={(e) => set(i, { basis: e.target.value  })}>
                        <option value="default">Default</option><option value="actual">Actual</option></select></td>
                      {(["see_direct", "see_indirect", "sefa"] ).map((k) => (
                        <td key={k} className="td px-2 py-2">
                          {auto
                            ? <input className="input-muted w-20 py-1" readOnly title="Calculated from EU default values" value={fmt.n(k === "see_direct" ? res?.see_direct : k === "see_indirect" ? res?.see_indirect_counted : res?.sefa, 3)} />
                            : <input type="number" step="0.01" className="input w-20 py-1" value={x[k] ?? ""} onChange={(e) => set(i, { [k]: e.target.value === "" ? undefined : +e.target.value })} />}
                        </td>
                      ))}
                      <td className="td px-2 py-2 text-right tabular-nums">{res?.error ? <span title={res.error}><Badge tiny tone="red">Check CN / origin</Badge></span> : fmt.n(res?.certificates, 1)}</td>
                      <td className="td px-2 py-2 text-right tabular-nums">{res?.error ? "–" : fmt.eur(rowCost(res))}</td>
                      <td className="td px-2 py-2 text-right text-xs tabular-nums text-ink-soft">{res && !res.error && totals.c ? fmt.pct((res.certificates ?? 0) / totals.c, 0) : "–"}</td>
                      <td className="td px-2 py-2">
                        <div className="flex gap-1.5 text-ink-soft">
                          <button className="hover:text-brand" title="Duplicate row" onClick={() => setRows([...rows.slice(0, i + 1), { ...x }, ...rows.slice(i + 1)])}><Copy size={14} /></button>
                          <button className="hover:text-red-600" title="Remove row" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-gray-50/70 font-semibold">
                  <td className="px-2 py-3 text-sm" colSpan={2}>Total</td>
                  <td className="px-2 py-3 text-sm tabular-nums">{fmt.n(totals.t, 0)} t</td>
                  <td colSpan={4} />
                  <td className="px-2 py-3 text-right text-sm tabular-nums">{fmt.n(totals.c, 1)}</td>
                  <td className="px-2 py-3 text-right text-sm tabular-nums">{fmt.eur(totals.c * price)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ChartCard>
      </div>
    </DashboardFrame>
  );
}
