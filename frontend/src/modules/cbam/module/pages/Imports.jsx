import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, FileText, Filter, Globe2, Hash, MoreHorizontal, Plus, Search, Ship, Trash2, Upload } from "lucide-react";
import { api, fmt } from "../api";

import { CarbonPriceFields, EMPTY_CP } from "../components/CarbonPriceFields";
import { UploadWizard } from "../components/UploadWizard";
import { Badge, Drawer, Empty, ErrorNote, Field, FormSection, Loading, Modal, PageHeader, Segmented, Trace, statusTone, useToast } from "../../ui";

const SECTORS = ["All", "Iron and steel", "Aluminium", "Cement", "Fertilisers", "Hydrogen", "Electricity"] ;


const blank = { cn_code: "", description: "", country_of_origin: "India", import_date: "2026-01-15", net_mass: "", basis: "default",
  supplier_id: "", installation_name: "", customs_ref: "", see_direct: "", see_indirect: "", sefa: "", production_date: "",
  carbon_price_paid: "", electricity_ef: "", evidence: "" };

export default function Imports() {
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const [sector, setSector] = useState("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [trace, setTrace] = useState(null);
  const [menu, setMenu] = useState(null);

  const q = useQuery({ queryKey: ["imports"], queryFn: () => api.get("/imports") });
  const del = useMutation({ mutationFn: (id) => api.del(`/imports/${id}`), onSuccess: () => { qc.invalidateQueries(); toast("Import line deleted"); } });
  const [wizard, setWizard] = useState(false);

  const rows = useMemo(() => (q.data ?? []).filter((l) =>
    (sector === "All" || l.calc.sector === sector) &&
    (!search || `${l.cn_code} ${l.description} ${l.country_of_origin} ${l.installation_name}`.toLowerCase().includes(search.toLowerCase()))), [q.data, sector, search]);

  return (
    <div>
      <PageHeader icon={<Ship size={22} />} title="CBAM Import Lines" actions={<>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input className="input w-64 rounded-full pl-9" placeholder="Search imports..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-outline rounded-full"><Filter size={15} /> Show Filters</button>
        <button className="btn-outline rounded-full" onClick={() => setWizard(true)}><Upload size={15} /> Upload customs data</button>
        <button className="btn-primary" onClick={() => setOpen("new")}><Plus size={16} /> Add Import Line</button>
      </>} />

      <div className="space-y-4 p-6">
        <div className="overflow-x-auto"><Segmented pill value={sector} onChange={setSector} options={SECTORS.map((s) => ({ value: s, label: s === "Iron and steel" ? "Iron & Steel" : s }))} /></div>
        <div className="card overflow-x-auto">
          {q.isLoading ? <Loading /> : q.error ? <div className="p-5"><ErrorNote error={q.error} /></div> : rows.length === 0 ? (
            <Empty icon={<Ship size={22} />} title="No import lines" body="Add a line or upload a customs CSV/XLSX with CN code, Country of origin, Import date and Net mass columns." />
          ) : (
            <table className="w-full">
              <thead><tr className="bg-white">
                {["CN code", "Origin", "Import date", "Net mass (t)", "Basis", "SEE", "SEFA", "Certificates", "Cost", "Status", "Updated", "Actions"].map((h) => (
                  <th key={h} className="th">{h}{!["Actions"].includes(h) && <span className="ml-1 text-gray-300">⇅</span>}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50/70">
                    <td className="td">
                      <button className="text-left" onClick={() => setTrace(l)}>
                        <div className="font-semibold">{l.cn_code}</div>
                        <div className="max-w-[200px] truncate text-xs text-ink-soft">{l.description || l.calc.sector}</div>
                      </button>
                    </td>
                    <td className="td">{l.country_of_origin}</td>
                    <td className="td">{fmt.date(l.import_date)} <span className="text-xs text-ink-soft">Q{l.calc.quarter}</span></td>
                    <td className="td text-right font-medium tabular-nums">{fmt.n(l.net_mass, 1)}</td>
                    <td className="td">{l.basis === "actual" ? <Badge tone="green">Actual</Badge> : <Badge tone="blue">Default +{fmt.pct(l.calc.markup, 0)}</Badge>}</td>
                    <td className="td tabular-nums">{fmt.n(l.calc.see, 3)}</td>
                    <td className="td tabular-nums">{fmt.n(l.calc.sefa, 3)}</td>
                    <td className="td text-right font-semibold tabular-nums">
                      {l.calc.error ? <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={14} />Error</span> : fmt.n(l.calc.certificates, 1)}
                      {l.calc.floored && <AlertTriangle size={13} className="ml-1 inline text-amber-500" />}
                    </td>
                    <td className="td tabular-nums">{fmt.eur(l.calc.cost)}{l.calc.price_is_estimate && <span className="text-amber-600">*</span>}</td>
                    <td className="td"><Badge tone={statusTone(l.status)}>{l.status || "Draft"}</Badge> {l.evidence && <FileText size={14} className="ml-1 inline text-blue-500" />}</td>
                    <td className="td text-xs text-ink-soft">{fmt.dateTime(l.updated_at)}</td>
                    <td className="td relative">
                      <button className="rounded p-1 hover:bg-gray-100" onClick={() => setMenu(menu === l.id ? null : l.id)}><MoreHorizontal size={16} /></button>
                      {menu === l.id && (
                        <div className="absolute right-4 z-10 w-40 rounded-lg border border-line bg-white py-1 shadow-lg" onMouseLeave={() => setMenu(null)}>
                          <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50" onClick={() => { setOpen(l); setMenu(null); }}>Edit</button>
                          <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50" onClick={() => { setTrace(l); setMenu(null); }}>Calculation trace</button>
                          <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { del.mutate(l.id); setMenu(null); }}><Trash2 size={13} />Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-ink-soft">* Cost uses the {new Date().getFullYear()} average where the quarter's certificate price is not yet published.</p>
      </div>

      {open && <LineForm line={open === "new" ? null : open} onClose={() => setOpen(null)} onSaved={(m) => { qc.invalidateQueries(); toast(m); setOpen(null); }} />}
      {trace && <TraceDrawer line={trace} onClose={() => setTrace(null)} />}
      {wizard && <UploadWizard onClose={() => setWizard(false)} onDone={(n) => { qc.invalidateQueries(); toast(`${n} line(s) imported`); }} />}
      {node}
    </div>
  );
}

function TraceDrawer({ line, onClose }) {
  const c = line.calc;
  return (
    <Drawer title={<>Calculation trace · <span className="text-ink-soft">{line.cn_code}</span></>} onClose={onClose}>
      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div className="card p-3"><div className="kpi-label">Reporting year</div><div className="text-lg font-semibold">{c.reporting_year ?? "–"}</div></div>
        <div className="card p-3"><div className="kpi-label">Sector</div><div className="text-lg font-semibold">{c.sector ?? "–"}</div></div>
        <div className="card p-3"><div className="kpi-label">Certificates</div><div className="text-lg font-semibold">{fmt.n(c.certificates, 2)}</div></div>
      </div>
      {c.error && <ErrorNote error={c.error} />}
      {c.warnings?.map((w) => <div key={w} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{w}</div>)}
      <Trace steps={c.steps} />
      <p className="mt-4 text-xs text-ink-soft">Formula: Certificates = max[0; SEE − SEFA − SECPP / RP] × M. Default SEE pairs with the Column B benchmark only; actual SEE uses the operator's SEFA (Column A + precursors).</p>
    </Drawer>
  );
}

function LineForm({ line, onClose, onSaved }) {
  const [f, setF] = useState(line ? { ...blank, ...line } : blank);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api.get("/platform/suppliers") });
  const countries = useQuery({ queryKey: ["countries"], queryFn: () => api.get("/reference/countries") });
  const payload = () => Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== "" && k !== "calc"));
  const preview = useQuery({
    queryKey: ["preview", JSON.stringify(payload())],
    queryFn: () => api.post("/imports/preview", payload()),
    enabled: !!f.cn_code && !!f.net_mass && !!f.import_date,
  });
  const save = async () => {
    try {
      if (line) await api.put(`/imports/${line.id}`, payload());
      else await api.post("/imports", payload());
      onSaved(line ? "Import line updated" : "Import line added");
    } catch (e) { setErr(e); }
  };
  const actual = f.basis === "actual";
  const c = preview.data;
  return (
    <Modal title={line ? "Edit Import Line" : "Add Import Line"} onClose={onClose}>
      <FormSection title="Primary information" subtitle="Customs data for the goods released for free circulation.">
        <div className="grid grid-cols-3 gap-4">
          <Field label="CN code" required icon={<Hash size={15} />} hint="8-digit CN, e.g. 7208 51 20"><input className="input" value={f.cn_code} onChange={set("cn_code")} /></Field>
          <Field label="Description"><input className="input" value={f.description} onChange={set("description")} /></Field>
          <Field label="Country of origin" required icon={<Globe2 size={15} />}>
            <select className="input" value={f.country_of_origin} onChange={set("country_of_origin")}>
              {(countries.data?.countries ?? [f.country_of_origin]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Import date" required icon={<CalendarDays size={15} />}><input type="date" className="input" value={f.import_date} onChange={set("import_date")} /></Field>
          <Field label="Net mass (t)" required hint="MWh for electricity"><input type="number" step="any" className="input" value={f.net_mass} onChange={set("net_mass")} /></Field>
          <Field label="Customs reference (MRN)"><input className="input" value={f.customs_ref} onChange={set("customs_ref")} /></Field>
          <Field label="Supplier (SustainRepo)">
            <select className="input" value={f.supplier_id} onChange={set("supplier_id")}>
              <option value="">—</option>{suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Producing installation"><input className="input" value={f.installation_name} onChange={set("installation_name")} /></Field>
          <div>
            <span className="label">Data basis <span className="text-red-500">*</span></span>
            <div className="flex gap-5 pt-2 text-sm">
              {["default", "actual"].map((b) => (
                <label key={b} className="flex items-center gap-2"><input type="radio" className="accent-green-700" checked={f.basis === b} onChange={() => setF({ ...f, basis: b })} />{b === "default" ? "Default values" : "Verified actual"}</label>
              ))}
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title={actual ? "Verified operator data" : "Default values (EU)"}
        subtitle={actual ? "Copy from the operator's verified emissions report. SEFA = Column A benchmark + precursors." : "Taken automatically from Impl. Reg. 2025/2621 (corr. 2026/1740) with the year's mark-up and the Column B benchmark."}>
        {actual ? (
          <div className="grid grid-cols-3 gap-4">
            <Field label="SEE direct (tCO₂e/t)" required><input type="number" step="any" className="input" value={f.see_direct} onChange={set("see_direct")} /></Field>
            <Field label="SEE indirect (tCO₂e/t)" hint="Counted for cement & fertilisers only"><input type="number" step="any" className="input" value={f.see_indirect} onChange={set("see_indirect")} /></Field>
            <Field label="SEFA (tCO₂e/t)" required><input type="number" step="any" className="input" value={f.sefa} onChange={set("sefa")} /></Field>
            <Field label="Production date (evidence)" hint="Only from 2027 imports; never before 2026"><input type="date" className="input" value={f.production_date} onChange={set("production_date")} /></Field>
            <Field label="Verification report"><input className="input" placeholder="file name / reference" value={f.evidence} onChange={set("evidence")} /></Field>
            <div className="col-span-3 border-t border-line pt-4">
              <label className="mb-3 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-[#14532d]" checked={!!f.carbon_price} onChange={(e) => setF({ ...f, carbon_price: e.target.checked ? { ...EMPTY_CP } : null })} />
                Carbon price effectively paid in the country of origin
              </label>
              {f.carbon_price && <CarbonPriceFields value={f.carbon_price} onChange={(cp) => setF({ ...f, carbon_price: cp })} />}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 text-sm">
            <Field label="Default value (total)"><input className="input-muted" readOnly value={c?.steps.find((s) => s.label.startsWith("Default value"))?.value ?? "–"} /></Field>
            <Field label="Mark-up"><input className="input-muted" readOnly value={c?.markup !== undefined ? fmt.pct(c.markup, 0) : "–"} /></Field>
            <Field label="Production route"><input className="input-muted" readOnly value={c?.route || "–"} /></Field>
            <Field label="Benchmark (Column B)"><input className="input-muted" readOnly value={c?.bm ?? "–"} /></Field>
            {f.cn_code.replace(/\s/g, "").startsWith("2716") && (
              <Field label="Electricity EF (Annex III, tCO₂e/MWh)" required><input type="number" step="any" className="input" value={f.electricity_ef} onChange={set("electricity_ef")} /></Field>
            )}
          </div>
        )}
      </FormSection>

      <FormSection title="Live result" subtitle="Recalculated as you type">
        {preview.isFetching && !c ? <Loading label="Calculating" /> : c?.error ? <ErrorNote error={c.error} /> : c ? (
          <div className="grid grid-cols-5 gap-3">
            {[["SEE", fmt.n(c.see, 3), "tCO₂e/t"], ["SEFA", fmt.n(c.sefa, 3), "tCO₂e/t"], ["Embedded", fmt.n(c.embedded, 1), "tCO₂e"],
              ["Certificates", fmt.n(c.certificates, 1), ""], ["Cost", fmt.eur(c.cost), ""]].map(([k, v, u]) => (
              <div key={k} className="rounded-lg border border-line bg-white p-3"><div className="kpi-label">{k}</div><div className="mt-1 text-lg font-semibold">{v} <span className="text-xs font-normal text-ink-soft">{u}</span></div></div>
            ))}
            {c.warnings.map((w) => <div key={w} className="col-span-5 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{w}</div>)}
          </div>
        ) : <p className="text-sm text-ink-soft">Enter CN code, mass and date to see the obligation.</p>}
      </FormSection>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-3"><button className="btn-outline rounded-full" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>{line ? "Save changes" : "Add Import Line"}</button></div>
    </Modal>
  );
}
