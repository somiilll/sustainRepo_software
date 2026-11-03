import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { BellRing, Globe2, Send } from "lucide-react";
import { api, fmt } from "../api";
import { DashboardFrame, SEQ, SECTOR_COLOR, inkOn, seqColor, useDashboard } from "../dashboard";

import { Badge, ChartCard, ErrorNote, Loading, Segmented, statusTone, useToast } from "../../ui";
import { Choropleth } from "../../ui/Choropleth";


const METRIC = {
  embedded: { label: "Embedded tCO₂e", f: (v) => fmt.n(v, 0) },
  certificates: { label: "Certificates", f: (v) => fmt.n(v, 0) },
  cost: { label: "Cost €", f: (v) => fmt.eur(v) },
  intensity: { label: "tCO₂e / t", f: (v) => fmt.n(v, 2) },
};
const OPEN = new Set(["Sent", "Opened", "Needs completion"]);

export default function Geography() {
  const d = useDashboard();
  const [metric, setMetric] = useState("embedded");
  const [axis, setAxis] = useState("sector");
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const lines = useQuery({ queryKey: ["imports", d.year], queryFn: () => api.get(`/imports?year=${d.year}`) });
  const act = useMutation({
    mutationFn: async (s) => {
      if (s.request_id && OPEN.has(s.request_status ?? "")) return api.post(`/supplier-requests/${s.request_id}/remind`);
      const mine = (lines.data ?? []).filter((l) => l.supplier_id === s.supplier_id && l.basis === "default");
      return api.post("/supplier-requests", {
        supplier_id: s.supplier_id, reporting_year: +d.year, import_line_ids: mine.map((l) => l.id), cn_codes: [...new Set(mine.map((l) => l.cn_code))],
      });
    },
    onSuccess: (_, s) => { toast(s.request_id && OPEN.has(s.request_status ?? "") ? `Reminder logged for ${s.name}` : `Data request sent to ${s.name}`); qc.invalidateQueries(); },
    onError: (e) => toast(String((e ).message)),
  });
  const frame = (body) => <DashboardFrame title="Org1 · Supplier geography" d={d}>{body}</DashboardFrame>;
  if (d.q.isLoading) return frame(<Loading />);
  if (d.q.error) return frame(<div className="p-6"><ErrorNote error={d.q.error} /></div>);
  const s = d.q.data;
  const max = Math.max(...s.by_country.map((c) => c[metric]), 0);
  const values = Object.fromEntries(s.by_country.filter((c) => c.iso_num).map((c) => [c.iso_num, { value: c[metric], row: c }]));
  const selected = new Set(s.by_country.filter((c) => d.filters.country.split(",").includes(c.country)).map((c) => c.iso_num));
  const cols = axis === "sector" ? [...new Set(s.country_sector.map((c) => c.sector))] : ["Q1", "Q2", "Q3", "Q4"];
  const cells = new Map((axis === "sector" ? s.country_sector.map((c) => [`${c.country}|${c.sector}`, c.embedded])
    : s.country_quarter.map((c) => [`${c.country}|${c.quarter}`, c.embedded])) );
  const cellMax = Math.max(...cells.values(), 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => max * p);

  return frame(
    <div className="space-y-5 p-6">
      {node}
      <ChartCard title="Where embedded emissions come from" subtitle="Country of origin of imported goods · click a country to filter every dashboard tab" accent="green"
        right={<Segmented value={metric} onChange={setMetric} options={(Object.keys(METRIC) ).map((m) => ({ value: m, label: METRIC[m].label }))} />}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <Choropleth values={values} selected={selected} color={(v) => seqColor(v, max)}
              onSelect={(c) => d.toggle("country", c.country)}
              tooltip={(c) => (
                <div className="space-y-0.5">
                  <div className="font-semibold">{c.country}</div>
                  <div className="flex justify-between gap-4"><span className="text-ink-soft">Embedded</span><span className="tabular-nums">{fmt.n(c.embedded, 0)} tCO₂e</span></div>
                  <div className="flex justify-between gap-4"><span className="text-ink-soft">Certificates</span><span className="tabular-nums">{fmt.n(c.certificates, 0)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-ink-soft">Cost</span><span className="tabular-nums">{fmt.eur(c.cost)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-ink-soft">Intensity</span><span className="tabular-nums">{fmt.n(c.intensity, 2)} t/t</span></div>
                  <div className="flex justify-between gap-4"><span className="text-ink-soft">Verified data</span><span className="tabular-nums">{fmt.pct(c.actual_share, 0)}</span></div>
                </div>
              )} />
            <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
              <span>{METRIC[metric].label}</span>
              <div className="flex h-2.5 w-56 overflow-hidden rounded">{SEQ.slice(1).map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
              <span className="tabular-nums">{METRIC[metric].f(ticks[0])} – {METRIC[metric].f(ticks[4])}</span>
            </div>
          </div>
          <div className="divide-y divide-line">
            {s.by_country.map((c, i) => (
              <button key={c.country} onClick={() => d.toggle("country", c.country)}
                className={`flex w-full items-center gap-3 py-2 text-left hover:bg-gray-50 ${selected.has(c.iso_num) ? "bg-mint/60" : ""}`}>
                <span className="w-5 text-right text-xs tabular-nums text-ink-soft">{i + 1}</span>
                <span className="h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: seqColor(c[metric], max) }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.country}</span>
                <span className="text-[13px] font-semibold tabular-nums">{METRIC[metric].f(c[metric])}</span>
              </button>
            ))}
          </div>
        </div>
      </ChartCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ChartCard title={`Heat matrix · country × ${axis}`} subtitle="Embedded tCO₂e per cell; darker = more" accent="teal"
          right={<Segmented value={axis} onChange={setAxis} options={[{ value: "sector", label: "Sector" }, { value: "quarter", label: "Quarter" }]} />}>
          <div className="overflow-x-auto">
            <div className="grid gap-[2px] text-[12px]" style={{ gridTemplateColumns: `minmax(110px,1.2fr) repeat(${cols.length}, minmax(76px,1fr))` }}>
              <span />
              {cols.map((c) => <span key={c} className="truncate px-1 pb-1 text-center text-[11px] font-semibold text-ink-soft" title={c}>{c}</span>)}
              {s.by_country.map((r) => (
                <div key={r.country} className="contents">
                  <span className="truncate py-2 pr-2 font-medium">{r.country}</span>
                  {cols.map((c) => {
                    const v = cells.get(`${r.country}|${c}`) ?? 0;
                    const bg = seqColor(v, cellMax);
                    return (
                      <span key={c} title={`${r.country} · ${c}: ${fmt.n(v, 1)} tCO₂e`}
                        className="flex items-center justify-center rounded py-2 tabular-nums" style={{ background: bg, color: inkOn(bg) }}>
                        {v ? fmt.n(v, 0) : ""}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Volume vs intensity" subtitle="Each bubble is a supplier; size = estimated cost. Top-right = biggest lever." accent="purple">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" />
                <XAxis type="number" dataKey="mass" name="Mass" unit=" t" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false}
                  label={{ value: "Tonnes imported", position: "insideBottom", offset: -8, fontSize: 11, fill: "#64748b" }} />
                <YAxis type="number" dataKey="intensity" name="Intensity" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} width={40}
                  label={{ value: "tCO₂e/t", angle: -90, position: "insideLeft", fontSize: 11, fill: "#64748b" }} />
                <ZAxis type="number" dataKey="cost" range={[60, 900]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                  const p = payload?.[0]?.payload ;
                  return p ? <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg">
                    <div className="font-semibold">{p.name}</div><div>{p.country}</div>
                    <div className="tabular-nums">{fmt.n(p.mass, 0)} t · {fmt.n(p.intensity, 2)} t/t · {fmt.eur(p.cost)}</div></div> : null;
                }} />
                <Scatter data={s.by_supplier} fill="#7c3aed" fillOpacity={0.55} stroke="#fff" strokeWidth={2} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Supplier ranking" subtitle="By certificates driven · request or chase verified data where it matters most" accent="orange">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] [&_td]:px-3 [&_th]:px-3">
            <thead><tr>
              <th className="th">#</th><th className="th">Supplier</th><th className="th">Country</th><th className="th">Sectors</th>
              <th className="th text-right">Tonnes</th><th className="th text-right">t/t</th><th className="th text-right">Certificates</th>
              <th className="th text-right">Cost</th><th className="th">Data</th><th className="th">Request</th><th className="th" />
            </tr></thead>
            <tbody>
              {s.by_supplier.map((r, i) => {
                const open = r.request_id && OPEN.has(r.request_status ?? "");
                const canAct = r.known && (open || !r.request_status || r.request_status === "Rejected");
                return (
                  <tr key={r.supplier_id} className="hover:bg-gray-50">
                    <td className="td text-ink-soft tabular-nums">{i + 1}</td>
                    <td className="td max-w-[220px]"><div className="truncate font-medium" title={r.email}>{r.name}</div></td>
                    <td className="td">{r.country}</td>
                    <td className="td">{r.sectors.map((x) => <span key={x} className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" title={x} style={{ background: SECTOR_COLOR[x] }} />)}</td>
                    <td className="td text-right tabular-nums">{fmt.n(r.mass, 0)}</td>
                    <td className="td text-right tabular-nums">{fmt.n(r.intensity, 2)}</td>
                    <td className="td text-right font-semibold tabular-nums">{fmt.n(r.certificates, 1)}</td>
                    <td className="td text-right tabular-nums">{fmt.eur(r.cost)}</td>
                    <td className="td"><Badge tiny tone={r.actual_share >= 0.999 ? "green" : r.actual_share > 0 ? "amber" : "blue"}>
                      {r.actual_share >= 0.999 ? "Verified" : r.actual_share > 0 ? `${fmt.pct(r.actual_share, 0)} verified` : "Default"}</Badge></td>
                    <td className="td">{r.request_status ? <Badge tiny tone={statusTone(r.request_status)}>{r.request_status}</Badge> : <span className="text-xs text-ink-soft">–</span>}
                      {r.last_reminded && <div className="text-[11px] text-ink-soft">reminded {fmt.date(r.last_reminded)}</div>}</td>
                    <td className="td text-right">
                      {canAct && r.actual_share < 0.999 && (
                        <button className="btn-outline py-1 text-xs" disabled={act.isPending} onClick={() => act.mutate(r)}>
                          {open ? <><BellRing size={13} /> Remind</> : <><Send size={13} /> Request</>}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {s.by_country.some((c) => !c.iso_num) && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700"><Globe2 size={13} />Some origins could not be placed on the map – check the country name on those import lines.</p>
        )}
      </ChartCard>
    </div>,
  );
}
