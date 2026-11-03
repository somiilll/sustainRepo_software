/** Guided customs upload: 1 template -> 2 map columns -> 3 validate & preview -> confirm. */
import { useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { api, fmt } from "../api";
import { Badge, ErrorNote, Modal } from "../../ui";





const LABEL = { cn_code: "CN code", description: "Description", country_of_origin: "Country of origin", import_date: "Import date",
  net_mass: "Net mass (t)", customs_ref: "Customs ref (MRN)", installation_name: "Installation" };
const STEPS = ["Template", "Map columns", "Validate", "Done"];

export function UploadWizard({ onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [ins, setIns] = useState(null);
  const [map, setMap] = useState({});
  const [prev, setPrev] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setErr(null); setBusy(true); try { await fn(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const form = (extra = {}) => {
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    return fd;
  };
  const pick = (f) => run(async () => {
    setFile(f);
    const fd = new FormData();
    fd.append("file", f);
    const r = await api.form("/imports/inspect", fd);
    setIns(r);
    setMap(Object.fromEntries(Object.entries(r.suggested).filter(([, v]) => v)) );
    setStep(1);
  });
  const validate = () => run(async () => {
    setPrev(await api.form("/imports/upload", form({ mapping: JSON.stringify(map), dry_run: "true" })));
    setStep(2);
  });
  const commit = () => run(async () => {
    const r = await api.form("/imports/upload", form({ mapping: JSON.stringify(map) }));
    setPrev(r);
    setStep(3);
    onDone(r.created);
  });
  const missing = ins?.required.filter((f) => !map[f]) ?? [];

  return (
    <Modal title="Upload customs data" onClose={onClose}>
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 text-xs font-medium ${i === step ? "bg-brand text-white" : i < step ? "bg-mint text-brand" : "bg-white text-ink-soft"}`}>{i + 1}. {s}</li>
        ))}
      </ol>
      <ErrorNote error={err} />
      {step === 0 && (
        <div className="card space-y-4 p-6">
          <p className="text-sm">Export the customs declaration lines for CBAM goods (from your broker or ERP), one row per line. Any column names work – you map them next.</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn-outline" onClick={() => api.download("/imports/template.xlsx", "CBAM_customs_import_template.xlsx")}><Download size={15} /> Download template</button>
            <label className="btn-primary cursor-pointer"><Upload size={15} /> Choose CSV / XLSX
              <input type="file" accept=".csv,.xlsx" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} disabled={busy} /></label>
          </div>
          <p className="text-xs text-ink-soft">Required: CN code, country of origin, import date, net mass (t; MWh for electricity).</p>
        </div>
      )}
      {step === 1 && ins && (
        <div className="card space-y-4 p-6">
          <div className="flex items-center gap-2 text-sm"><FileSpreadsheet size={16} className="text-brand" /> {file?.name} · {ins.row_count} rows</div>
          <div className="grid gap-3 md:grid-cols-2">
            {ins.fields.map((f) => (
              <label key={f} className="grid grid-cols-[150px_1fr] items-center gap-3 text-sm">
                <span className="font-medium">{LABEL[f] ?? f}{ins.required.includes(f) && <span className="text-red-500"> *</span>}</span>
                <select className="input py-1.5" value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value })}>
                  <option value="">— not in file —</option>{ins.headers.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs"><thead><tr>{ins.headers.map((h) => <th key={h} className="th py-2 text-xs">{h}</th>)}</tr></thead>
              <tbody>{ins.sample.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="td py-1.5 text-xs">{c}</td>)}</tr>)}</tbody></table>
          </div>
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>Back</button>
            <button className="btn-primary" disabled={missing.length > 0 || busy} onClick={validate}>{missing.length ? `Map ${missing.map((m) => LABEL[m]).join(", ")}` : "Validate rows"}</button>
          </div>
        </div>
      )}
      {step === 2 && prev?.preview && (
        <div className="card space-y-4 p-6">
          <div className="flex gap-3 text-sm">
            <Badge tone="green">{prev.preview.length - prev.errors.length} ready</Badge>
            {prev.errors.length > 0 && <Badge tone="red">{prev.errors.length} with errors</Badge>}
            <span className="text-ink-soft">{fmt.n(prev.preview.reduce((a, r) => a + (r.certificates ?? 0), 0), 1)} certificates (preview)</span>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm"><thead><tr><th className="th">Row</th><th className="th">CN</th><th className="th">Origin</th><th className="th text-right">t</th><th className="th">Sector</th><th className="th text-right">Certificates</th><th className="th">Check</th></tr></thead>
              <tbody>{prev.preview.map((r) => (
                <tr key={r.row} className={r.error ? "bg-red-50/60" : ""}>
                  <td className="td">{r.row}</td><td className="td">{r.cn_code}</td><td className="td">{r.country_of_origin}</td>
                  <td className="td text-right tabular-nums">{fmt.n(r.net_mass, 1)}</td><td className="td">{r.sector ?? "–"}</td>
                  <td className="td text-right tabular-nums">{fmt.n(r.certificates, 1)}</td>
                  <td className="td whitespace-normal">{r.error ? <span className="text-xs text-red-700">{r.error}</span> : <CheckCircle2 size={15} className="text-green-600" />}</td>
                </tr>
              ))}</tbody></table>
          </div>
          <p className="text-xs text-ink-soft">Rows with errors are still imported as drafts so you can fix them in Import Lines.</p>
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary" disabled={busy} onClick={commit}>Import {prev.preview.length} line(s)</button>
          </div>
        </div>
      )}
      {step === 3 && prev && (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 size={40} className="text-green-600" />
          <h3 className="text-lg font-semibold">{prev.created} line(s) imported</h3>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      )}
    </Modal>
  );
}
