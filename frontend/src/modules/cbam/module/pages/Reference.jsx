import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Search } from "lucide-react";
import { api, fmt } from "../api";
import { Badge, ErrorNote, FormSection, Loading, PageHeader, Segmented, useToast } from "../../ui";



export default function Reference() {
  const [tab, setTab] = useState("Default values");
  const f = useQuery({ queryKey: ["factors"], queryFn: () => api.get("/reference/factors") });
  return (
    <div>
      <PageHeader icon={<BookOpen size={22} />} title="CBAM Reference Data" subtitle={f.data ? `${f.data.versions.default_values} · ${f.data.versions.benchmarks}` : undefined} />
      <div className="space-y-5 p-6">
        <Segmented pill value={tab} onChange={setTab} options={(["Default values", "Benchmarks", "Factors & prices"] ).map((t) => ({ value: t, label: t }))} />
        {tab === "Default values" && <DVSearch />}
        {tab === "Benchmarks" && <BMSearch />}
        {tab === "Factors & prices" && (f.isLoading ? <Loading /> : <FactorsEditor data={f.data} />)}
      </div>
    </div>
  );
}

function DVSearch() {
  const [country, setCountry] = useState("India");
  const [q, setQ] = useState("");
  const c = useQuery({ queryKey: ["countries"], queryFn: () => api.get("/reference/countries") });
  const r = useQuery({ queryKey: ["dv", country, q], queryFn: () => api.get(`/reference/dv?country=${encodeURIComponent(country)}&q=${encodeURIComponent(q)}`) });
  return (
    <div className="card overflow-x-auto">
      <div className="flex gap-3 p-4">
        <select className="input w-72" value={country} onChange={(e) => setCountry(e.target.value)}>
          {["Other Countries and Territories", "Annex IV", ...(c.data?.countries ?? [])].map((x) => <option key={x}>{x}</option>)}
        </select>
        <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" /><input className="input pl-9" placeholder="CN code or description" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <p className="px-4 text-xs text-ink-soft">Base values without mark-up (10% 2026 · 20% 2027 · 30% 2028+, fertilisers 1%) – the calculator adds it. "–" falls back to Other Countries.</p>
      {r.isLoading ? <Loading /> : (
        <table className="mt-2 w-full">
          <thead><tr>{["CN / TARIC", "Description", "Sector", "Direct", "Indirect", "Total", "Route"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{r.data?.map((x, i) => (
            <tr key={i}><td className="td font-medium">{x.code}</td><td className="td max-w-[420px] truncate" title={x.description}>{x.description}</td><td className="td">{x.sector}</td>
              <td className="td tabular-nums">{fmt.n(x.direct, 3)}</td><td className="td tabular-nums">{fmt.n(x.indirect, 3)}</td><td className="td font-semibold tabular-nums">{fmt.n(x.total, 3)}</td>
              <td className="td">{x.route && <Badge tone="gray">{x.route}</Badge>}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function BMSearch() {
  const [q, setQ] = useState("7208");
  const r = useQuery({ queryKey: ["bm", q], queryFn: () => api.get(`/reference/benchmarks?q=${encodeURIComponent(q)}`) });
  const opts = (o) => o.map((x, i) => <div key={i}>{x.value.toFixed(3)} {x.indicator && <Badge tiny tone="gray">{x.indicator}</Badge>}</div>);
  return (
    <div className="card overflow-x-auto">
      <div className="relative p-4"><Search size={15} className="absolute left-7 top-1/2 -translate-y-1/2 text-ink-soft" /><input className="input pl-9" placeholder="CN code or description" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="px-4 text-xs text-ink-soft">Column A = process-only BM* (actual data, add precursor SEFA). Column B = whole chain (default values only). Route (A)–(L) or year band (1) 2026-27 / (2) 2028-30.</p>
      {r.isLoading ? <Loading /> : (
        <table className="mt-2 w-full">
          <thead><tr>{["CN", "Description", "Sector", "Column A (BM*)", "Column B (BM)"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{r.data?.map((x) => (
            <tr key={x.code} className="align-top"><td className="td font-medium">{x.code}</td><td className="td max-w-[460px] truncate" title={x.description}>{x.description}</td><td className="td">{x.sector}</td>
              <td className="td tabular-nums">{opts(x.col_a)}</td><td className="td tabular-nums">{opts(x.col_b)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function FactorsEditor({ data }) {
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [d, setD] = useState(data);
  useEffect(() => setD(data), [data]);
  const m = useMutation({ mutationFn: () => api.put("/reference/factors", d), onSuccess: () => { qc.invalidateQueries(); toast("Factors saved – all results recalculated"); } });
  const years = Object.keys(d.cbam_factor).filter((y) => +y >= 2026);
  const setY = (k, y, v) => setD({ ...d, [k]: { ...d[k], [y]: v === "" ? "" : Number(v) } });
  return (
    <div className="space-y-5">
      <FormSection title="Year-dependent factors" subtitle="Enter fractions (0.975), never percentages (97.5) – the API rejects values above 1."
        right={<button className="btn-primary" onClick={() => m.mutate()}>Save factors</button>}>
        <table className="w-full">
          <thead><tr><th className="th">Year</th>{years.map((y) => <th key={y} className="th text-center">{y}</th>)}</tr></thead>
          <tbody>
            {[["cbam_factor", "CBAM factor"], ["cscf", "CSCF (Decision 2026/1862)"]].map(([k, label]) => (
              <tr key={k}><td className="td font-medium">{label}</td>{years.map((y) => (
                <td key={y} className="td"><input type="number" step="any" className={`input w-20 text-center ${k === "cscf" ? "bg-yellow-50" : ""}`} value={d[k][y] ?? ""} onChange={(e) => setY(k, y, e.target.value)} /></td>
              ))}</tr>
            ))}
            <tr><td className="td font-medium">Default mark-up</td>{years.map((y) => <td key={y} className="td text-center text-sm">{fmt.pct(d.markup[String(Math.min(+y, 2028))], 0)}</td>)}</tr>
          </tbody>
        </table>
      </FormSection>
      <FormSection title="Certificate prices & thresholds" subtitle="2026: quarterly averages of EU ETS auction prices. Q4 2026 is published 4 Jan 2027.">
        <div className="grid grid-cols-7 gap-4">
          {["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"].map((k) => (
            <label key={k}><span className="label">{k} (€)</span><input type="number" step="any" className={`input ${!d.prices[k] ? "bg-yellow-50" : ""}`} value={d.prices[k] ?? ""} onChange={(e) => setD({ ...d, prices: { ...d.prices, [k]: e.target.value === "" ? undefined : Number(e.target.value) } })} /></label>
          ))}
          <label><span className="label">De minimis (t)</span><input type="number" className="input" value={d.deminimis_t} onChange={(e) => setD({ ...d, deminimis_t: Number(e.target.value) })} /></label>
          <label><span className="label">Holding</span><input type="number" step="any" className="input" value={d.holding_pct} onChange={(e) => setD({ ...d, holding_pct: Number(e.target.value) })} /></label>
          <label><span className="label">Penalty (€/t)</span><input type="number" className="input" value={d.penalty_eur_per_t} onChange={(e) => setD({ ...d, penalty_eur_per_t: Number(e.target.value) })} /></label>
        </div>
      </FormSection>
      <ErrorNote error={m.error} />
      {node}
    </div>
  );
}
