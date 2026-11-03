/** Shared dashboard plumbing: year + filters live in the URL so every dashboard tab sees the same slice. */
import { useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "./api";

import { DashboardHeader, Drawer } from "../ui";

export const FILTER_KEYS = ["sector", "country", "supplier", "quarter", "basis"] ;
 
const FILTER_LABEL = { sector: "Sector", country: "Country of origin", supplier: "Supplier", quarter: "Quarter", basis: "Data basis" };

/** Emissions split colours (validated: CVD-separated, >= 3:1 on white). Info-only indirect is also hatched. */
export const SPLIT = { direct: "#3b5bdb", indirect: "#0f9f8f", info: "#d97706" };
/** Sequential single-hue ramp (brand green), light -> dark, for maps and heat cells. */
export const SEQ = ["#ecfdf3", "#d1fadf", "#a6f4c5", "#6ce9a6", "#32d583", "#12b76a", "#039855", "#027a48", "#05603a", "#054f31"];
export const seqColor = (v, max) => (max > 0 && v > 0 ? SEQ[Math.min(SEQ.length - 1, 1 + Math.floor((v / max) * (SEQ.length - 2)))] : "#f1f5f9");
export const inkOn = (bg) => (SEQ.indexOf(bg) >= 5 ? "#ffffff" : "#1f2937");

export const SECTOR_COLOR = {
  "Iron and steel": "#334155", Aluminium: "#8b5cf6", Cement: "#10b981", Fertilisers: "#f59e0b", Hydrogen: "#3b82f6", Electricity: "#0d9488",
};

export function useDashboard() {
  const [sp, setSp] = useSearchParams();
  const year = sp.get("year") ?? "2026";
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ""])) ;
  const qs = new URLSearchParams({ year, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).toString();
  const q = useQuery({ queryKey: ["dashboard", qs], queryFn: () => api.get(`/dashboard?${qs}`) });
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };
  const toggle = (k, v) => {
    const cur = new Set(filters[k] ? filters[k].split(",") : []);
    if (cur.has(v)) cur.delete(v);
    else cur.add(v);
    set(k, [...cur].join(","));
  };
  const clear = () => {
    const n = new URLSearchParams();
    if (sp.get("year")) n.set("year", sp.get("year"));
    setSp(n, { replace: true });
  };
  const active = FILTER_KEYS.reduce((a, k) => a + (filters[k] ? filters[k].split(",").length : 0), 0);
  return { q, year, setYear: (y) => set("year", y), filters, toggle, clear, active, qs };
}

const TABS = [
  { to: "/cbam", label: "Overview", end: true },
  { to: "/cbam/emissions", label: "Direct vs Indirect" },
  { to: "/cbam/geography", label: "Supplier geography" },
  { to: "/cbam/holdings", label: "Certificates" },
  { to: "/cbam/simulator", label: "Cost simulator" },
];

/** Header + pill tabs + filter drawer + active-filter chips, shared by every dashboard tab. */
export function DashboardFrame({ title, d, onExport, children, hideFilters = false }

) {
  const [open, setOpen] = useState(false);
  const [sp] = useSearchParams();
  const s = d.q.data;
  const keep = sp.toString() ? `?${sp.toString()}` : "";
  const label = (k, v) => (k === "supplier" ? s?.filter_options?.supplier.find((x) => x.id === v)?.name ?? v : v);
  return (
    <div>
      <DashboardHeader title={title} subtitle={`Imports 1 Jan – 31 Dec ${d.year} · declaration due 30 Sep ${+d.year + 1}`}
        onExport={onExport} onFilters={hideFilters ? undefined : () => setOpen(true)} activeFilters={d.active}
        right={<select className="input w-28 py-1.5" value={d.year} onChange={(e) => d.setYear(e.target.value)} aria-label="Reporting year">
          {["2026", "2027"].map((y) => <option key={y}>{y}</option>)}</select>} />
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5">
        <div className="inline-flex rounded-full border border-line bg-white p-1">
          {TABS.map((t) => (
            <NavLink key={t.to} to={`${t.to}${keep}`} end={t.end}
              className={({ isActive }) => `rounded-full px-4 py-1.5 text-sm transition ${isActive ? "bg-brand text-white" : "text-ink hover:bg-gray-50"}`}>
              {t.label}
            </NavLink>
          ))}
        </div>
        {!hideFilters && FILTER_KEYS.flatMap((k) => (d.filters[k] ? d.filters[k].split(",") : []).map((v) => (
          <button key={k + v} onClick={() => d.toggle(k, v)} className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-mint px-3 py-1 text-xs text-brand">
            <span className="text-ink-soft">{FILTER_LABEL[k]}:</span> {label(k, v)} <X size={12} />
          </button>
        )))}
        {!hideFilters && d.active > 0 && <button className="text-xs text-ink-soft underline" onClick={d.clear}>Clear all</button>}
      </div>
      {children}
      {open && s?.filter_options && (
        <Drawer title="Filters" onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-ink-soft">Filters apply to every dashboard tab and to the numbers on screen (exports always use the full year).</p>
          {FILTER_KEYS.map((k) => {
            const opts = k === "supplier" ? s.filter_options.supplier.map((x) => ({ v: x.id, l: x.name }))
              : (s.filter_options[k] ).map((x) => ({ v: x, l: x }));
            const sel = new Set(d.filters[k] ? d.filters[k].split(",") : []);
            return (
              <div key={k} className="mb-5">
                <div className="label">{FILTER_LABEL[k]}</div>
                <div className="flex flex-wrap gap-2">
                  {opts.map((o) => (
                    <button key={o.v} onClick={() => d.toggle(k, o.v)}
                      className={`rounded-full border px-3 py-1 text-xs ${sel.has(o.v) ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-gray-50"}`}>
                      {k === "basis" ? (o.l === "actual" ? "Verified actual" : "Default values") : o.l}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex justify-between border-t border-line pt-4">
            <button className="btn-ghost" onClick={d.clear}>Clear all</button>
            <button className="btn-primary" onClick={() => setOpen(false)}>Done</button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
