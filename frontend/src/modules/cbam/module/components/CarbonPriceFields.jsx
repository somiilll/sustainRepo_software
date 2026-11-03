

import { fmt } from "../api";
import { Field } from "../../ui";

export const EMPTY_CP = { type: "carbon_tax", scheme: "", currency: "EUR", amount_per_t: 0, rebate_per_t: 0, fx_to_eur: 1, evidence: "" };

export function cpEur(cp) {
  if (!cp || cp.type === "voluntary_credit") return 0;
  return Math.max(0, (cp.amount_per_t ?? 0) - (cp.rebate_per_t ?? 0)) * (cp.fx_to_eur ?? 0);
}

export function CarbonPriceFields({ value, onChange }) {
  const set = (k) => (e) => {
    const raw = e.target.value;
    const num = ["amount_per_t", "rebate_per_t", "fx_to_eur"].includes(k);
    const next = { ...value, [k]: num ? (raw === "" ? undefined : +raw) : raw };
    if (k === "currency" && raw === "EUR") next.fx_to_eur = 1;
    onChange(next);
  };
  const voluntary = value.type === "voluntary_credit";
  const ccts = /ccts/i.test(value.scheme ?? "");
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Instrument" required>
          <select className="input" value={value.type} onChange={set("type")}>
            <option value="carbon_tax">Carbon tax / levy / fee</option>
            <option value="ets">Emissions trading (allowances)</option>
            <option value="voluntary_credit">Voluntary carbon credits</option>
          </select>
        </Field>
        <Field label="Scheme" hint="e.g. K-ETS, China ETS, UK ETS"><input className="input" value={value.scheme ?? ""} onChange={set("scheme")} /></Field>
        <Field label="Currency"><input className="input uppercase" maxLength={3} value={value.currency ?? ""} onChange={set("currency")} /></Field>
        <Field label="Price paid per tonne of goods" required><input type="number" step="any" className="input" value={value.amount_per_t ?? ""} onChange={set("amount_per_t")} /></Field>
        <Field label="Rebates / compensation per tonne" hint="Free allocation, refunds, exemptions"><input type="number" step="any" className="input" value={value.rebate_per_t ?? ""} onChange={set("rebate_per_t")} /></Field>
        <Field label={`FX ${value.currency || "?"} → EUR`} required={value.currency !== "EUR"}>
          <input type="number" step="any" className="input" value={value.fx_to_eur ?? ""} disabled={value.currency === "EUR"} onChange={set("fx_to_eur")} />
        </Field>
      </div>
      <Field label="Evidence (proof of payment)" hint="File name or reference; required for the deduction to be accepted">
        <input className="input" value={value.evidence ?? ""} onChange={set("evidence")} />
      </Field>
      {voluntary ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Voluntary credits are not a carbon price under Art 3(29) of Reg. 2023/956 and cannot be deducted.</p>
      ) : (
        <p className="text-sm text-ink-soft">Deduction basis: <b className="text-ink">{fmt.eur(cpEur(value), 2)}</b> per tonne of goods (converted to certificates at the annual average CBAM price).</p>
      )}
      {ccts && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">India CCTS: eligibility is undetermined until the Commission's carbon-price implementing act is adopted – the deduction is provisional.</p>}
    </div>
  );
}
