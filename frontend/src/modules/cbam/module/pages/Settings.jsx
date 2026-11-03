import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Settings2 } from "lucide-react";
import { api } from "../api";

import { ErrorNote, Field, FormSection, Loading, PageHeader, useToast } from "../../ui";

const STEP_LABEL = {
  bulk_upload: "Bulk upload (Excel template) in the supplier portal",
  faq: "Help / FAQ panel next to each step",
  carbon_price: "Carbon price paid step",
  precursors: "Precursors step",
};
const FLOW = ["Request sent", "Supplier opens link", "Supplier submits", "Review & decide", "Lines switch to verified actual"];
const SAMPLE = { supplier: "Huaxia Aluminium Co.", org: "Org1", cn_codes: "7601 10 90", year: "2026", due: "31 May 2027", link: "https://…/cbam/supplier/abc123" };

/** Guardrailed workflow settings: the regulation fixes the order of steps; teams tune timing, approvers and wording. */
export default function Settings() {
  const qc = useQueryClient();
  const { toast, node } = useToast();
  const q = useQuery({ queryKey: ["workflow"], queryFn: () => api.get("/workflow/settings") });
  const [w, setW] = useState(null);
  useEffect(() => { if (q.data) setW(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put("/workflow/settings", w),
    onSuccess: () => { toast("Workflow settings saved"); qc.invalidateQueries({ queryKey: ["workflow"] }); },
  });
  if (q.isLoading || !w) return <Loading />;
  const set = (p) => setW({ ...w, ...p });
  const dirty = JSON.stringify(w) !== JSON.stringify(q.data);
  const preview = Object.entries(SAMPLE).reduce((t, [k, v]) => t.split(`{${k}}`).join(v), w.message_template);
  return (
    <div>
      {node}
      <PageHeader icon={<Settings2 size={22} />} title="Workflow Settings" subtitle="Supplier data requests: timing, approvals and what suppliers see"
        actions={<>
          {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
          <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save changes</button>
        </>} />
      <div className="space-y-5 p-6">
        <ErrorNote error={save.error} />
        <FormSection title="Fixed steps" subtitle="The order follows the CBAM Regulation and cannot be changed. At review you accept, ask for completion, or reject.">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            {FLOW.map((x, i) => (
              <li key={x} className="flex items-center gap-2">
                <span className="rounded-full bg-mint px-3 py-1 text-brand">{i + 1}. {x}</span>
                {i < FLOW.length - 1 && <ArrowRight size={14} className="text-ink-soft" />}
              </li>
            ))}
          </ol>
        </FormSection>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-5">
            <FormSection title="Timing & reminders">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Due date (days after request)" required><input type="number" className="input" min={7} max={365} value={w.due_days} onChange={(e) => set({ due_days: +e.target.value })} /></Field>
                <Field label="Remind every (days)" required><input type="number" className="input" min={1} max={60} value={w.reminder_every_days} onChange={(e) => set({ reminder_every_days: +e.target.value })} /></Field>
                <Field label="Automatic reminders" hint="Until the supplier submits">
                  <select className="input" value={w.auto_reminders ? "on" : "off"} onChange={(e) => set({ auto_reminders: e.target.value === "on" })}><option value="on">On</option><option value="off">Off</option></select>
                </Field>
              </div>
            </FormSection>
            <FormSection title="Approvals">
              <Field label="Who can accept supplier data" hint="Accepting switches import lines to verified actual values">
                <select className="input" value={w.approver_role} onChange={(e) => set({ approver_role: e.target.value  })}>
                  <option value="importer">Importer team (and admins)</option><option value="admin">Admins only</option>
                </select>
              </Field>
            </FormSection>
            <FormSection title="Supplier portal options" subtitle="Switch off steps your suppliers don't need">
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(STEP_LABEL) ).map((k) => (
                  <label key={k} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm hover:bg-gray-50">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#14532d]" checked={w.steps[k]} onChange={(e) => set({ steps: { ...w.steps, [k]: e.target.checked } })} />
                    {STEP_LABEL[k]}
                  </label>
                ))}
              </div>
            </FormSection>
          </div>

          <div className="card flex flex-col p-5">
            <h3 className="text-[17px] font-medium text-ink">Request message</h3>
            <p className="mt-0.5 text-sm text-ink-soft">Placeholders: {"{supplier} {org} {cn_codes} {year} {due} {link}"} – {"{link}"} is required</p>
            <textarea className="input mt-4 min-h-[180px] flex-1 font-mono text-[13px]" value={w.message_template} onChange={(e) => set({ message_template: e.target.value })} />
            <div className="kpi-label mb-2 mt-5">Preview</div>
            <div className="whitespace-pre-wrap rounded-lg border border-line bg-gray-50 p-4 text-[13px] leading-relaxed">{preview}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
