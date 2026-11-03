import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Building2, CalendarDays, Factory, Plus } from "lucide-react";
import { api, fmt } from "../api";

import { Badge, Empty, ErrorNote, Field, FormSection, Loading, Modal, PageHeader, statusTone } from "../../ui";

export default function Installations() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["installations"], queryFn: () => api.get("/installations") });
  return (
    <div>
      <PageHeader icon={<Factory size={22} />} title="CBAM Installations" subtitle="Operator side · monitor, attribute and report embedded emissions (SEE) and free allocation (SEFA)"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Add Installation</button>} />
      <div className="p-6">
        <div className="card overflow-x-auto">
          {q.isLoading ? <Loading /> : q.error ? <div className="p-5"><ErrorNote error={q.error} /></div> : !q.data?.length ? (
            <Empty icon={<Factory size={22} />} title="No installations" body="Link a SustainRepo facility that produces CBAM goods to start monitoring." />
          ) : (
            <table className="w-full">
              <thead><tr>{["Installation", "Country", "Period", "Goods (CN)", "SEE (tCO₂e/t)", "SEFA (tCO₂e/t)", "Net / t", "Verification", "Updated"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {q.data.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-gray-50/70" onClick={() => nav(`/cbam/installations/${i.id}`)}>
                    <td className="td font-semibold">{i.name}</td>
                    <td className="td">{i.country}</td>
                    <td className="td">CY{i.reporting_year}</td>
                    <td className="td">{i.summary?.map((s) => s.cn_code).join(", ") || "–"}</td>
                    <td className="td tabular-nums">{i.summary?.map((s) => fmt.n(s.see, 3)).join(", ")}</td>
                    <td className="td tabular-nums">{i.summary?.map((s) => fmt.n(s.sefa, 3)).join(", ")}</td>
                    <td className="td font-semibold tabular-nums">{i.summary?.map((s) => fmt.n(s.net_per_t, 3)).join(", ")}</td>
                    <td className="td"><Badge tone={statusTone(i.verification_status)}>{i.verification_status}</Badge></td>
                    <td className="td text-xs text-ink-soft">{fmt.dateTime(i.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {open && <NewInstallation onClose={() => setOpen(false)} onDone={(id) => { qc.invalidateQueries(); nav(`/cbam/installations/${id}`); }} />}
    </div>
  );
}

function NewInstallation({ onClose, onDone }) {
  const fac = useQuery({ queryKey: ["facilities"], queryFn: () => api.get("/platform/facilities") });
  const [f, setF] = useState({ facility_id: "", name: "", reporting_year: "2026", cn_code: "", process: "" });
  const m = useMutation({
    mutationFn: () => api.post("/installations", {
      facility_id: f.facility_id, name: f.name, reporting_year: +f.reporting_year,
      processes: f.cn_code ? [{ name: f.process || "Main process", cn_code: f.cn_code, activity_level_t: 0 }] : [],
    }),
    onSuccess: (r) => onDone(r.id),
  });
  return (
    <Modal title="Add Installation" onClose={onClose} wide={false}>
      <FormSection title="Primary information" subtitle="Link a SustainRepo facility and the CBAM good it produces.">
        <div className="space-y-4">
          <Field label="Facility" required icon={<Building2 size={15} />}>
            <select className="input" value={f.facility_id} onChange={(e) => {
              const x = fac.data?.find((d) => d.id === e.target.value);
              setF({ ...f, facility_id: e.target.value, name: x ? `${x.name} – ${x.type}` : f.name });
            }}>
              <option value="">Select facility</option>
              {fac.data?.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.country})</option>)}
            </select>
          </Field>
          <Field label="Installation name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reporting year" required icon={<CalendarDays size={15} />}><select className="input" value={f.reporting_year} onChange={(e) => setF({ ...f, reporting_year: e.target.value })}><option>2026</option><option>2027</option></select></Field>
            <Field label="First good – CN code" hint="e.g. 7208 51 20"><input className="input" value={f.cn_code} onChange={(e) => setF({ ...f, cn_code: e.target.value })} /></Field>
          </div>
          <Field label="Production process name"><input className="input" placeholder="e.g. Hot rolling" value={f.process} onChange={(e) => setF({ ...f, process: e.target.value })} /></Field>
        </div>
      </FormSection>
      <ErrorNote error={m.error} />
      <div className="flex justify-end gap-3"><button className="btn-outline rounded-full" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!f.name || m.isPending} onClick={() => m.mutate()}>Create</button></div>
    </Modal>
  );
}
