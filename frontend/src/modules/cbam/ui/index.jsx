/** SustainRepo UI kit (rebuilt from the platform screenshots so the add-on looks native). */
import { createContext, useContext, useEffect, useState } from "react";
import { ChevronDown, FileDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import NotificationBell from "../../../components/NotificationBell";

export const ReadOnlyContext = createContext(false);
const ReadOnlyPill = () => (useContext(ReadOnlyContext)
  ? <span className="ml-2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800" data-testid="cbam-readonly-pill">Read-only</span>
  : null);

export const ACCENTS = {
  green: "#16a34a", teal: "#0d9488", amber: "#f59e0b", lime: "#84cc16", blue: "#2563eb",
  slate: "#475569", purple: "#7c3aed", red: "#dc2626", indigo: "#4f46e5", orange: "#ea580c",
} ;
 

const tint = (hex, a = 0.12) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

export function IconTile({ icon, accent = "green", size = 36 }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, background: tint(ACCENTS[accent]), color: ACCENTS[accent] }}>
      {icon}
    </span>
  );
}

/** Dashboard header: sticky, full-width bar ("Org1 · <Title>" + year + bell / Export PDF / Show filters). */
export function DashboardHeader({ title, subtitle, onExport, right, onFilters, activeFilters = 0 }) {
  return (
    <div className="sticky top-0 z-40 -mx-4 border-b border-stone-200/70 bg-white px-6 pb-3 pt-3 lg:-mx-5 lg:px-8" data-testid="cbam-sticky-header">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-black text-[9px] font-bold text-white">ORG1</div>
          <div className="min-w-0">
            <h1 className="flex items-center truncate font-heading text-lg font-bold text-stone-900">{title}<ReadOnlyPill /></h1>
            {subtitle && <p className="truncate text-[11px] text-stone-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {right}
          <NotificationBell />
          {onExport && (
            <button className="btn-primary" onClick={onExport} data-testid="cbam-export-pdf">
              <FileDown size={15} /> Export PDF
            </button>
          )}
          {onFilters && (
            <button className="btn-primary" onClick={onFilters} data-testid="cbam-show-filters">
              <SlidersHorizontal size={15} /> Show filters
              {activeFilters > 0 && <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold text-brand">{activeFilters}</span>}
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** List/CRUD page header: tinted icon tile + large title + actions on the right. */
export function PageHeader({ icon, title, actions, subtitle }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-7 py-5">
      <div className="flex items-center gap-4">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">{icon}</span>
        <div>
          <h1 className="flex items-center text-[28px] font-semibold leading-tight text-[#0f2e22]">{title}<ReadOnlyPill /></h1>
          {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">{actions}</div>
    </div>
  );
}

export function KpiCard({ label, value, unit, icon, accent = "green", delta, children, bar }

) {
  return (
    <div className="card relative min-w-0 overflow-hidden p-5" style={{ borderTop: `4px solid ${ACCENTS[accent]}` }}>
      <div className="flex min-w-0 items-center gap-3">
        <IconTile icon={icon} accent={accent} />
        <span className="kpi-label line-clamp-2 leading-tight" title={label}>{label}</span>
      </div>
      <div className="mt-4 flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[28px] font-semibold leading-none text-ink" title={typeof value === "string" ? value : undefined}>{value}</span>
        {unit && <span className="shrink-0 text-sm text-ink-soft">{unit}</span>}
        {bar !== undefined && (
          <span className="ml-2 h-1.5 flex-1 self-center rounded-full bg-gray-100">
            <span className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%`, background: ACCENTS[accent] }} />
          </span>
        )}
      </div>
      {delta && <div className="mt-2 min-h-[2.1rem] text-[11px] leading-snug text-ink-soft">{delta}</div>}
      {children}
    </div>
  );
}

export function ChartCard({ title, subtitle, accent = "green", right, children, className = "" }

) {
  return (
    <div className={`card flex min-w-0 flex-col p-5 ${className}`} style={{ borderTop: `4px solid ${ACCENTS[accent]}` }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function Segmented({ options, value, onChange, pill = false }

) {
  if (pill)
    return (
      <div className="inline-flex rounded-full border border-line bg-white p-1">
        {options.map((o) => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-full px-5 py-1.5 text-sm transition ${value === o.value ? "bg-brand text-white" : "text-ink hover:bg-gray-50"}`}>
            {o.label}
          </button>
        ))}
      </div>
    );
  return (
    <div className="inline-flex gap-1.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${value === o.value ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-gray-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const BADGE = {
  green: "bg-mint text-green-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700", red: "bg-red-50 text-red-700", gray: "bg-gray-100 text-gray-600",
};
export function Badge({ children, tone = "green", tiny = false }) {
  return <span className={`inline-flex items-center rounded ${tiny ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"} font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function statusTone(s) {
  if (!s) return "gray";
  if (/verified|completed|ready|submitted|accepted|actual/i.test(s)) return "green";
  if (/awaiting|opened|sent|draft|pending|needs|invited|planned/i.test(s)) return "amber";
  if (/reject|error/i.test(s)) return "red";
  if (/default/i.test(s)) return "blue";
  return "gray";
}

export function FormSection({ title, subtitle, children, right }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-[17px] font-medium text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, required, children, hint, icon }) {
  return (
    <label className="block">
      <span className="label">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand">{icon}</span>}
        <div className={icon ? "[&_.input]:pl-9" : ""}>{children}</div>
      </div>
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide = true }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
      <div className={`w-full ${wide ? "max-w-5xl" : "max-w-xl"} rounded-2xl bg-[#f3f5f4] shadow-2xl`}>
        <div className="flex items-center justify-between px-7 pb-3 pt-6">
          <h2 className="text-[19px] font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-soft hover:bg-gray-200"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-7 pb-7">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-6 py-4">
          <div className="text-[17px] font-semibold">{title}</div>
          <button onClick={onClose} className="rounded p-1 text-ink-soft hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Loading({ label = "Loading" }) {
  return <div className="flex items-center gap-2 p-10 text-sm text-ink-soft"><Loader2 className="animate-spin" size={16} /> {label}…</div>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{String((error ).message ?? error)}</div>;
}

export function Empty({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-14 text-center">
      <IconTile icon={icon} size={48} />
      <h4 className="mt-2 font-semibold">{title}</h4>
      <p className="max-w-md text-sm text-ink-soft">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-brand px-4 py-3 text-sm text-white shadow-lg">{msg}</div>
  ) : null;
  return { toast: setMsg, node };
}

export function LegendRow({ color, label, value }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-[13px]">
      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/** Calculation trace (formula -> value) used in drawers and installation results. */
export function Trace({ steps }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {steps.map((s, i) => (
        <div key={i} className="grid grid-cols-[1.3fr_1.4fr_auto] items-center gap-3 border-t border-line px-3 py-2 text-[13px] first:border-t-0 odd:bg-gray-50/60">
          <span className="font-medium">{s.label}</span>
          <code className="truncate text-[12px] text-ink-soft" title={s.formula}>{s.formula}</code>
          <span className="text-right font-semibold tabular-nums">
            {s.value.toLocaleString("en-GB", { maximumFractionDigits: 4 })} <span className="font-normal text-ink-soft">{s.unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
