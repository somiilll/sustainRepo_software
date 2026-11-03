import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileCode2, FileJson, Receipt, XCircle } from "lucide-react";
import { api, fmt } from "../api";

import { ChartCard, ErrorNote, Loading, PageHeader, useToast } from "../../ui";




export default function Declarations() {
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [year, setYear] = useState(2026);
  const q = useQuery({ queryKey: ["declaration", year], queryFn: () => api.get(`/declarations/${year}`) });
  const xml = useQuery({ queryKey: ["xml-status", year], queryFn: () => api.get(`/declarations/${year}/xml-status`) });
  const st = useMutation({ mutationFn: (status) => api.post(`/declarations/${year}/status`, { status }), onSuccess: (_r, s) => { qc.invalidateQueries(); toast(`Declaration marked ${s}`); } });
  if (q.isLoading) return <Loading />;
  if (q.error) return <div className="p-7"><ErrorNote error={q.error} /></div>;
  const d = q.data;
  const s = d.summary;
  const allOk = d.checklist.every((c) => c.ok);
  const status = d.snapshot?.status ?? "Draft";
  return (
    <div>
      <PageHeader icon={<Receipt size={22} />} title="Annual CBAM Declaration" subtitle={`Imports of ${year} · submit via the CBAM Registry by ${fmt.date(d.deadline)}${d.snapshot ? ` · last change ${fmt.dateTime(d.snapshot.updated_at)} by ${d.snapshot.by}` : ""}`}
        actions={<>
          <select className="input w-28 rounded-full" value={year} onChange={(e) => setYear(+e.target.value)} aria-label="Declaration year"><option>2026</option><option>2027</option></select>
          <div className="inline-flex items-center gap-2">
            <span className="text-xs text-ink-soft">Status</span>
            <div className="inline-flex rounded-full border border-line bg-white p-1">
              {(["Draft", "Ready", "Submitted"] ).map((x) => {
                const locked = x !== "Draft" && !allOk;
                return (
                  <button key={x} disabled={locked || st.isPending} onClick={() => status !== x && st.mutate(x)}
                    title={locked ? "Resolve the checklist items first" : `Mark as ${x}`}
                    className={`rounded-full px-4 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${status === x ? "bg-brand text-white" : "text-ink hover:bg-gray-50"}`}>{x}</button>
                );
              })}
            </div>
          </div>
        </>} />
      <div className="space-y-5 p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <ChartCard title="Declaration summary" subtitle="Articles 6, 7, 9 and 31 of the CBAM Regulation" accent="green">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
          {[["Net mass imported", `${fmt.n(s.net_mass, 1)} t`], ["Embedded emissions", `${fmt.n(s.embedded, 1)} tCO₂e`], ["Free allocation adjustment", `${fmt.n(s.faa, 1)} tCO₂e`],
            ["Carbon price paid deduction", `${fmt.n(s.cp_deduction, 1)} tCO₂e`], ["Certificates to surrender", `${s.certificates_whole.toLocaleString("en-GB")}`], ["Estimated cost", fmt.eur(s.cost)],
            ["Verified-data share", fmt.pct(s.actual_coverage, 0)], ["Import lines", `${s.lines}`], ["De minimis", s.obligated ? "Obligated (> 50 t)" : "Exempt"]].map(([k, v]) => (
            <div key={k} className="bg-white p-4"><div className="kpi-label">{k}</div><div className="mt-1 text-lg font-semibold">{v}</div></div>
          ))}
        </div>
      </ChartCard>
      <ChartCard title="Validation checklist" subtitle={allOk ? "Ready to submit" : "Resolve the items below"} accent={allOk ? "green" : "amber"}>
        <div className="space-y-2.5">
          {d.checklist.map((c) => (
            <div key={c.item} className="flex gap-2.5 text-sm">
              {c.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-green-600" /> : <XCircle size={17} className="mt-0.5 shrink-0 text-amber-500" />}
              <div><div className="font-medium">{c.item}</div><div className="text-xs text-ink-soft">{c.detail}</div></div>
            </div>
          ))}
        </div>
      </ChartCard>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <ChartCard title="By sector" subtitle="Aggregated goods categories" accent="purple">
        <table className="w-full">
          <thead><tr>{["Sector", "Mass (t)", "Embedded (tCO₂e)", "Certificates", "Cost"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{s.by_sector.map((r) => (
            <tr key={r.sector}><td className="td font-medium">{r.sector}</td><td className="td tabular-nums">{fmt.n(r.mass, 1)}</td><td className="td tabular-nums">{fmt.n(r.embedded, 1)}</td><td className="td font-semibold tabular-nums">{fmt.n(r.certificates, 1)}</td><td className="td tabular-nums">{fmt.eur(r.cost)}</td></tr>
          ))}</tbody>
        </table>
      </ChartCard>
      <ChartCard title="Exports" subtitle="Snapshot includes reference-data versions and factors" accent="blue">
        <div className="flex flex-col gap-2.5">
          <button className="btn-outline justify-center rounded-full" onClick={() => api.download(`/declarations/${year}/export.xlsx`, `CBAM_declaration_${year}.xlsx`)}><Download size={15} />Declaration workbook (XLSX)</button>
          <button className="btn-outline justify-center rounded-full" onClick={() => api.download(`/declarations/${year}/export.pdf`, `CBAM_declaration_${year}.pdf`)}><Download size={15} />Summary report (PDF)</button>
          <button className="btn-outline justify-center rounded-full" onClick={() => api.download(`/declarations/${year}/export.json`, `CBAM_declaration_${year}.json`)}><FileJson size={15} />Registry data (JSON)</button>
          <button className="btn-outline justify-center rounded-full" onClick={() => api.download(`/declarations/${year}/export.xml`, `CBAM_declaration_${year}${xml.data?.valid ? "" : "_DRAFT"}.xml`)}><FileCode2 size={15} />Registry upload (XML)</button>
          {xml.data && (
            <div className={`rounded-lg px-3 py-2 text-xs ${xml.data.status === "valid" ? "bg-mint text-green-800" : xml.data.status === "invalid" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
              <b>{xml.data.status === "valid" ? "Schema-valid" : xml.data.status === "invalid" ? "Schema errors" : "Draft XML"}</b> – {xml.data.status === "draft"
                ? "the definitive-period declaration XSD is not published yet; drop it into reference/data/declaration.xsd to validate. Do not upload a draft to the Registry."
                : xml.data.message}
              {xml.data.errors.slice(0, 3).map((e) => <div key={e} className="mt-1 font-mono">{e}</div>)}
            </div>
          )}
        </div>
      </ChartCard>
        </div>
      </div>
      {node}
    </div>
  );
}
