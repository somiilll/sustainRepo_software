import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { deriveGhgFields } from '../ghg/config/deriveGhgFields';
import { errText } from './api';
import { MonthPicker } from './MonthPicker';

const METHOD = { activity: 'activity_basis', spend: 'spend_basis', supplier: 'supplier_basis' };
const METHOD_LABEL = { activity: 'Average data', spend: 'Spend' };
const inputCls = 'w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm disabled:bg-stone-100 disabled:text-stone-400';
const Field = ({ label, children, full, hint }) => <label className={`block text-sm ${full ? 'sm:col-span-2' : ''}`}><span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>{children}{hint && <span className="mt-0.5 block text-xs text-stone-500">{hint}</span>}</label>;
const num = (v) => (v === '' || v == null ? null : Number(v));
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const pickUnit = (list, u) => (list || []).find((x) => same(x, u)) || (list?.length === 1 ? list[0] : '');
const catCode = (c) => { const m = /^C(\d+)\b/i.exec(c?.name || ''); return m ? `c${m[1]}` : ''; };

const initState = (row, cur) => {
  const raw = row.quantity == null;
  return { fac: '', period: row.reporting_period || '', scope: cur.scope || '', cat: cur.category_id || '', method: cur.ef_method || 'activity', factor: cur.factor?.id || '',
    q: (raw ? row.raw_quantity : row.quantity) ?? '', u: (raw ? row.raw_unit : row.unit) || row.raw_unit || '', a: row.amount ?? '', cur: row.currency || 'INR',
    dyn: cur.dynamic || {}, rem: true };
};

const DynamicInputs = ({ fields, dyn, setDyn }) => (
  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2" data-testid="ocr-edit-dynamic-fields">
    {fields.map((fld) => {
      const cur = dyn[fld.variable] || {};
      const unit = cur.unit || fld.expectedUnit || fld.allowedUnits?.[0] || '';
      const multi = fld.unitSource !== 'none' && fld.allowedUnits?.length > 1;
      const put = (value, u) => setDyn({ ...dyn, [fld.variable]: { value, unit: u ?? unit } });
      return (
        <Field key={fld.id || fld.variable} label={`${fld.label}${fld.required ? ' *' : ''}`}>
          <div className="flex gap-2">
            <input className={inputCls} type={fld.fieldType === 'text' ? 'text' : 'number'} step="any" value={cur.value ?? ''} placeholder={fld.placeholder}
              onChange={(e) => put(fld.fieldType === 'text' ? e.target.value : e.target.value === '' ? '' : Number(e.target.value))} data-testid={`ocr-edit-dyn-${fld.variable}`} />
            {multi ? <select className={`${inputCls} w-28`} value={unit} onChange={(e) => put(cur.value ?? '', e.target.value)} data-testid={`ocr-edit-dyn-${fld.variable}-unit`}>{fld.allowedUnits.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              : fld.unitSource !== 'none' && unit ? <span className="flex items-center text-sm text-stone-500">{unit}</span> : null}
          </div>
        </Field>
      );
    })}
  </div>
);

export const EditDialog = ({ row, meta, jobOf, api, onClose, onSaved }) => {
  const job = jobOf(row);
  const rid = row._rid || row.row_id;
  const [cfg, setCfg] = useState(null);
  const [base, setBase] = useState(null);
  const [f, setF] = useState(null);
  const [factors, setFactors] = useState([]);
  const [fObj, setFObj] = useState(null);
  const [fText, setFText] = useState('');
  const [fLoading, setFLoading] = useState(false);
  const [formConfig, setFormConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.editConfig(job, rid).then((c) => { setCfg(c); const s = initState(row, c.current); setBase(s); setF(s); setFObj(c.current.factor); }).catch((e) => setErr(errText(e, 'Could not load the edit options')));
  }, [api, job, rid]);

  const cascade = !!f && ['scope1', 'scope2', 'scope3', 'biogenic'].includes(f.scope);
  const method = f?.scope === 'scope3' ? f.method : 'activity';
  const cats = useMemo(() => (cfg && f ? cfg.categories.filter((c) => c.scope === f.scope) : []), [cfg, f?.scope]);
  const catObj = cats.find((c) => c.id === f?.cat);
  const methods = f?.scope === 'scope3' ? catObj?.methods || ['activity'] : ['activity'];

  useEffect(() => {
    if (f?.scope === 'scope3' && catObj && !methods.includes(f.method)) setF((s) => ({ ...s, method: methods[0], factor: '', dyn: {}, u: '' }));
  }, [catObj?.id, f?.method, f?.scope]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cascade || !f.cat) { setFactors([]); return undefined; }
    let dead = false;
    setFLoading(true);
    const t = setTimeout(() => api.factorOptions(job, rid, { scope: f.scope, category_id: f.cat, method, q: fText })
      .then((d) => { if (!dead) setFactors(d.options); }).catch((e) => { if (!dead) { setFactors([]); setErr(errText(e)); } }).finally(() => { if (!dead) setFLoading(false); }), fText ? 250 : 0);
    return () => { dead = true; clearTimeout(t); };
  }, [api, job, rid, cascade, f?.scope, f?.cat, method, fText]);

  useEffect(() => {
    if (f?.scope !== 'scope3' || !f.cat) { setFormConfig(null); return undefined; }
    let dead = false;
    api.formConfig(f.cat, 'scope3').then((d) => { if (!dead) setFormConfig(d); }).catch(() => { if (!dead) setFormConfig(null); });
    return () => { dead = true; };
  }, [api, f?.scope, f?.cat]);

  const dynFields = useMemo(() => {
    if (f?.scope !== 'scope3' || !formConfig || !catObj || f.method === 'spend' || /^c[1235]$/.test(catCode(catObj))) return [];
    return deriveGhgFields({ formConfig, context: { scope: 'scope3', isScope3Like: true, categoryId: catObj.id, categoryDefinition: { code: catCode(catObj) }, scope3Method: METHOD[f.method],
      scopeId: formConfig.category?.scope_id, scope3ActivityType: fObj?.activity_type || '', scope3Subcategory: '', decisionFieldValues: { calculation_method_scope3: METHOD[f.method] }, selectedFuel: fObj } })
      .fields.filter((x) => !x.presentationOnly);
  }, [formConfig, catObj, f?.scope, f?.method, fObj]);

  if (!f) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl" data-testid="ocr-edit-dialog"><DialogHeader><DialogTitle>Edit record</DialogTitle></DialogHeader>
          {err ? <p className="text-sm text-rose-700">{err}</p> : <div className="h-24 animate-pulse rounded bg-stone-100" />}</DialogContent>
      </Dialog>
    );
  }

  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const isSpend = cascade && method === 'spend';
  const units = fObj?.allowed_units || [];
  const changeScope = (scope) => { set({ scope, cat: '', factor: '', dyn: {}, u: '' }); setFObj(null); setFText(''); };
  const changeCat = (cat) => { const ms = cats.find((c) => c.id === cat)?.methods || ['activity']; set({ cat, method: ms.includes(f.method) ? f.method : ms[0], factor: '', dyn: {}, u: '' }); setFObj(null); setFText(''); };
  const changeMethod = (m) => { set({ method: m, factor: '', dyn: {}, u: '' }); setFObj(null); };
  const changeFactor = (id) => {
    const o = factors.find((x) => x.id === id);
    if (!o) return;
    setFObj(o);
    set({ factor: id, u: pickUnit(o.allowed_units, f.u), cur: isSpend ? pickUnit(o.allowed_units, f.cur) || f.cur : f.cur });
    api.factorPrefill(job, rid, { collection: o.collection, factor_id: id, category_id: f.cat, method }).then((p) => {
      const patch = {};
      if (p.dynamic && Object.keys(p.dynamic).length) patch.dyn = p.dynamic;
      if (!isSpend && p.quantity != null && p.unit) { patch.q = p.quantity; patch.u = p.unit; }
      if (Object.keys(patch).length) set(patch);
    }).catch(() => {});
  };

  const dynOk = dynFields.every((x) => !x.required || (f.dyn[x.variable]?.value ?? '') !== '');
  const fieldsOk = dynFields.length ? dynOk : isSpend ? num(f.a) != null && !!f.cur : num(f.q) != null && !!f.u;
  const cascadeChanged = cascade && (f.scope !== base.scope || f.cat !== base.cat || f.method !== base.method || f.factor !== base.factor || JSON.stringify(f.dyn) !== JSON.stringify(base.dyn));
  const useOverride = cascade && (cascadeChanged || cfg.current.from_override);
  const blocked = useOverride && (!f.cat || !f.factor || !fieldsOk);

  const save = async () => {
    const body = { remember: f.rem, scope: 'vendor' };
    if (f.fac) body.facility_id = f.fac;
    if (f.period && f.period !== base.period) body.reporting_period = f.period;
    if (num(f.q) !== num(base.q) && num(f.q) != null) body.quantity = num(f.q);
    if (f.u && f.u !== base.u) body.unit = f.u;
    if (num(f.a) !== num(base.a) && num(f.a) != null) body.amount = num(f.a);
    if (useOverride) {
      body.override = { scope: f.scope, category_id: f.cat, ef_method: method, factor_collection: fObj.collection, factor_id: f.factor,
        quantity: num(f.q), unit: f.u || null, amount: num(f.a), currency: f.cur || null, dynamic: dynFields.length ? Object.fromEntries(dynFields.filter((x) => f.dyn[x.variable]).map((x) => [x.variable, f.dyn[x.variable]])) : null };
    }
    setBusy(true);
    try { await api.edit(job, row.item_id, body); toast.success('Saved. Emissions are calculated when the row is saved to GHG records.'); onSaved(); } catch (e) { toast.error(`Could not save: ${errText(e)}`); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="ocr-edit-dialog">
        <DialogHeader><DialogTitle>Edit record</DialogTitle></DialogHeader>
        {row.decision?.question && <div className="rounded-md border-l-4 border-sky-500 bg-sky-50 p-2 text-sm"><b>Question:</b> {row.decision.question}</div>}
        <p className="text-sm text-stone-600">{row.extracted_item}{row.original_text ? ` · "${row.original_text.slice(0, 100)}"` : ''}</p>
        {err && <p className="text-sm text-rose-700" data-testid="ocr-edit-error">{err}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Scope"><select className={inputCls} value={f.scope} onChange={(e) => changeScope(e.target.value)} disabled={f.scope === 'water'} data-testid="ocr-edit-scope">
            {!f.scope && <option value="">Select scope</option>}{cfg.scopes.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}</select></Field>
          <Field label="Reporting month"><MonthPicker className={inputCls} value={f.period} onChange={(v) => set({ period: v })} testid="ocr-edit-period" /></Field>
          <Field label="Facility" full><select className={inputCls} value={f.fac} onChange={(e) => set({ fac: e.target.value })} data-testid="ocr-edit-facility"><option value="">- keep ({row.facility?.name || 'none'}) -</option>{meta.facilities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          {cascade && <Field label="Category" full><select className={inputCls} value={f.cat} onChange={(e) => changeCat(e.target.value)} data-testid="ocr-edit-category"><option value="">Select category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
          {f.scope === 'scope3' && f.cat && <Field label="Calculation method" full><select className={inputCls} value={f.method} onChange={(e) => changeMethod(e.target.value)} data-testid="ocr-edit-method">{methods.map((k) => <option key={k} value={k}>{METHOD_LABEL[k]}</option>)}</select></Field>}
          {cascade && f.cat && (
            <Field label="Activity" full hint={row.ghg?.subcategory_label ? `Read from the document: ${row.ghg.subcategory_label}` : undefined}>
              <input className={`${inputCls} mb-1`} value={fText} onChange={(e) => setFText(e.target.value)} placeholder="Filter activities..." data-testid="ocr-edit-activity-filter" />
              <select className={inputCls} value={f.factor} onChange={(e) => changeFactor(e.target.value)} disabled={fLoading} data-testid="ocr-edit-activity">
                <option value="">{fLoading ? 'Loading...' : factors.length ? 'Select activity' : 'No activities for this category and method'}</option>
                {fObj && !factors.some((x) => x.id === fObj.id) && <option value={fObj.id}>{fObj.label}</option>}
                {factors.map((o) => <option key={o.id} value={o.id}>{o.label}{o.source ? ` · ${o.source}` : ''}{o.region ? ` · ${o.region}` : ''}</option>)}
              </select>
            </Field>
          )}
          {(!cascade || f.factor) && dynFields.length > 0 && <DynamicInputs fields={dynFields} dyn={f.dyn} setDyn={(dyn) => set({ dyn })} />}
          {(!cascade || f.factor) && dynFields.length === 0 && !isSpend && (
            <>
              <Field label="Quantity"><input className={inputCls} type="number" step="any" value={f.q} onChange={(e) => set({ q: e.target.value })} data-testid="ocr-edit-quantity" /></Field>
              <Field label="Unit">{cascade && units.length ? <select className={inputCls} value={f.u} onChange={(e) => set({ u: e.target.value })} data-testid="ocr-edit-unit"><option value="">Select unit</option>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                : <input className={inputCls} value={f.u} onChange={(e) => set({ u: e.target.value })} placeholder="L, kg, kWh, KL, MT, km..." data-testid="ocr-edit-unit" />}</Field>
            </>
          )}
          {(!cascade || f.factor) && isSpend && (
            <>
              <Field label="Amount spent"><input className={inputCls} type="number" step="any" value={f.a} onChange={(e) => set({ a: e.target.value })} data-testid="ocr-edit-amount" /></Field>
              <Field label="Currency">{units.length ? <select className={inputCls} value={f.cur} onChange={(e) => set({ cur: e.target.value })} data-testid="ocr-edit-currency">{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                : <input className={inputCls} value={f.cur} onChange={(e) => set({ cur: e.target.value })} data-testid="ocr-edit-currency" />}</Field>
            </>
          )}
          {!cascade && <Field label={`Amount (${row.currency || ''})`}><input className={inputCls} type="number" step="any" value={f.a} onChange={(e) => set({ a: e.target.value })} data-testid="ocr-edit-amount" /></Field>}
        </div>
        <p className="text-xs text-stone-500" data-testid="ocr-edit-note">Nothing is calculated here. Emissions are calculated when the approved row is saved to GHG records.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.rem} onChange={(e) => set({ rem: e.target.checked })} data-testid="ocr-edit-remember" />Remember this activity for similar lines</label>
        <DialogFooter><Button variant="outline" onClick={onClose} data-testid="ocr-edit-cancel">Cancel</Button><Button disabled={busy || blocked} onClick={save} data-testid="ocr-edit-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
