import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Factory, Info, Plug, Zap, ZapOff } from "lucide-react";
import { api, fmt } from "../api";
import { DashboardFrame, SECTOR_COLOR, SPLIT, useDashboard } from "../dashboard";

import { Badge, ChartCard, Drawer, ErrorNote, KpiCard, Loading, Segmented, Trace } from "../../ui";

const Hatch = () => (
  <defs>
    <pattern id="hatchInfo" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#fef3c7" />
      <line x1="0" y1="0" x2="0" y2="6" stroke={SPLIT.info} strokeWidth="2.5" />
    </pattern>
  </defs>
);

const tip = (v, n) => [`${fmt.n(v, 1)} tCO₂e`, n];

export default function EmissionsSplit() {
  const d = useDashboard();
  const [by, setBy] = useState("sector");
  const [cn, setCn] = useState(null);
  const lines = useQuery({ queryKey: ["imports", d.year], queryFn: () => api.get(`/imports?year=${d.year}`), enabled: !!cn });
  const frame = (body) => <DashboardFrame title="Org1 · Direct vs Indirect emissions" d={d}>{body}</DashboardFrame>;
  if (d.q.isLoading) return frame(<Loading />);
  if (d.q.error) return frame(<div className="p-6"><ErrorNote error={d.q.error} /></div>);
  const s = d.q.data;
  const t = s.split.total;
  const rows = by === "sector" ? s.split.by_sector.map((r) => ({ ...r, key: r.sector })) : s.split.by_quarter.map((r) => ({ ...r, key: r.quarter }));
  const maxSee = Math.max(...s.split.by_cn.map((r) => Math.max(r.see_direct + r.see_indirect, (r.dv_direct ?? 0) + (r.dv_indirect ?? 0))), 0.01);
  const drill = cn ? (lines.data ?? []).filter((l) => l.cn_code === cn) : [];

  return frame(
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Direct emissions" value={fmt.n(t.direct, 1)} unit="tCO₂e" icon={<Factory size={18} />} accent="blue"
          delta={<>{fmt.pct(t.direct / (t.embedded || 1))} of charged embedded emissions</>} />
        <KpiCard label="Indirect (counted)" value={fmt.n(t.indirect, 1)} unit="tCO₂e" icon={<Zap size={18} />} accent="teal"
          delta={<>Electricity in cement & fertilisers</>} />
        <KpiCard label="Indirect excluded" value={fmt.n(t.indirect_info, 1)} unit="tCO₂e" icon={<ZapOff size={18} />} accent="amber"
          delta={<>Annex II goods – reported, not charged</>} />
        <KpiCard label="Indirect share" value={fmt.pct(t.indirect_share)} icon={<Plug size={18} />} accent="purple"
          delta={<>of emissions that need certificates</>} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ChartCard title={`Direct vs indirect by ${by}`} subtitle="Hatched = indirect emissions of Annex II goods (shown for transparency, not charged)" accent="blue"
          right={<Segmented value={by} onChange={setBy} options={[{ value: "sector", label: "Sector" }, { value: "quarter", label: "Quarter" }]} />}>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} barCategoryGap="28%">
                <Hatch />
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="key" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmt.n(v, 0)} />
                <Tooltip formatter={tip} cursor={{ fill: "#f1f5f9" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="direct" name="Direct" stackId="a" fill={SPLIT.direct} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="indirect" name="Indirect (counted)" stackId="a" fill={SPLIT.indirect} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="indirect_info" name="Indirect (excluded)" stackId="a" fill="url(#hatchInfo)" stroke={SPLIT.info} strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Which indirect emissions count?" subtitle="Reg. 2023/956 Annex II and the methodology rules" accent="teal">
          <ul className="space-y-3 text-[13px]">
            <li className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SPLIT.indirect }} />
              <span><b>Cement and fertilisers:</b> direct + indirect (electricity consumed × grid or supplier factor).</span></li>
            <li className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SPLIT.direct }} />
              <span><b>Iron & steel, aluminium, hydrogen</b> (Annex II): direct only. Their indirect emissions are still reported.</span></li>
            <li className="flex gap-2"><Info size={14} className="mt-0.5 shrink-0 text-ink-soft" />
              <span><b>Precursors:</b> a precursor's indirect emissions count only if the precursor itself is not an Annex II good.</span></li>
            <li className="flex gap-2"><Info size={14} className="mt-0.5 shrink-0 text-ink-soft" />
              <span><b>Electricity</b> imported as a good: all emissions treated as direct.</span></li>
          </ul>
        </ChartCard>
      </div>

      <ChartCard title="Intensity by CN code" subtitle="Specific embedded emissions per tonne vs the EC default value (without mark-up). Click a row for the calculation trace." accent="purple"
        right={<div className="flex flex-wrap gap-3 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SPLIT.direct }} />Direct / t</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SPLIT.indirect }} />Indirect / t</span>
          <span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-ink" />Default value</span></div>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="text-left">
              <th className="th">CN code</th><th className="th">Basis</th><th className="th w-[38%]">tCO₂e per tonne</th>
              <th className="th text-right">SEE dir</th><th className="th text-right">SEE ind</th><th className="th text-right">Default dir</th>
              <th className="th text-right">vs default</th><th className="th text-right">Embedded</th>
            </tr></thead>
            <tbody>
              {s.split.by_cn.map((r) => {
                const dv = r.dv_direct != null ? r.dv_direct + (["Cement", "Fertilisers"].includes(r.sector) ? r.dv_indirect ?? 0 : 0) : null;
                const see = r.see_direct + r.see_indirect;
                const diff = dv ? see / dv - 1 : null;
                return (
                  <tr key={r.cn_code} className="cursor-pointer hover:bg-gray-50" onClick={() => setCn(r.cn_code)}>
                    <td className="td"><div className="font-medium">{r.cn_code}</div><Badge tiny tone="gray">{r.sector}</Badge></td>
                    <td className="td">{r.basis.map((b) => <Badge key={b} tiny tone={b === "actual" ? "green" : "blue"}>{b === "actual" ? "Actual" : "Default"}</Badge>)}</td>
                    <td className="td">
                      <div className="relative h-3 w-full rounded-full bg-gray-100">
                        <div className="absolute left-0 top-0 flex h-3 overflow-hidden rounded-full" style={{ width: `${(see / maxSee) * 100}%` }}>
                          <div style={{ width: `${(r.see_direct / (see || 1)) * 100}%`, background: SPLIT.direct }} />
                          <div className="border-l-2 border-white" style={{ width: `${(r.see_indirect / (see || 1)) * 100}%`, background: SPLIT.indirect }} />
                        </div>
                        {dv != null && <div className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${(dv / maxSee) * 100}%` }} title={`Default ${fmt.n(dv, 3)}`} />}
                      </div>
                    </td>
                    <td className="td text-right tabular-nums">{fmt.n(r.see_direct, 3)}</td>
                    <td className="td text-right tabular-nums">{fmt.n(r.see_indirect, 3)}</td>
                    <td className="td text-right tabular-nums">{fmt.n(r.dv_direct, 3)}</td>
                    <td className="td text-right">
                      {diff == null ? "–" : <Badge tiny tone={diff < 0 ? "green" : diff > 0.001 ? "amber" : "gray"}>{diff > 0 ? "+" : ""}{fmt.pct(diff, 0)}</Badge>}
                    </td>
                    <td className="td text-right font-semibold tabular-nums">{fmt.n(r.embedded, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-soft">Default-basis lines sit above the marker by the mark-up (10% in 2026, 1% fertilisers). Verified actual data below the default is where savings come from.</p>
      </ChartCard>

      {cn && (
        <Drawer title={<>CN {cn} · calculation trace</>} onClose={() => setCn(null)}>
          {lines.isLoading ? <Loading /> : drill.map((l) => (
            <div key={l.id} className="mb-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{l.country_of_origin} · {fmt.date(l.import_date)} · {fmt.n(l.net_mass, 1)} t</span>
                <span className="flex gap-2 text-xs">
                  <span style={{ color: SPLIT.direct }}>dir {fmt.n(l.calc.emb_direct, 1)}</span>
                  <span style={{ color: SPLIT.indirect }}>ind {fmt.n(l.calc.emb_indirect_counted, 1)}</span>
                  {!!l.calc.emb_indirect_info && <span style={{ color: SPLIT.info }}>excl. {fmt.n(l.calc.emb_indirect_info, 1)}</span>}
                </span>
              </div>
              {l.calc.error ? <ErrorNote error={l.calc.error} /> : <Trace steps={l.calc.steps} />}
            </div>
          ))}
          <div className="text-xs text-ink-soft">Sector colour: <span style={{ color: SECTOR_COLOR[drill[0]?.calc.sector ?? ""] }}>{drill[0]?.calc.sector}</span></div>
        </Drawer>
      )}
    </div>,
  );
}
