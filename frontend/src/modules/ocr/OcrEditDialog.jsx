import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { getOcrFactorOptions } from './ocrApi';

const emptyValues = { scope: 'scope1', category: '', ef_method: 'activity', quantity: '', cost: '', remember_override: false };
const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const matchingUnit = (factor, value) => (factor?.allowed_units || []).find((unit) => {
  const aliases = factor?.unit_aliases?.[unit] || [unit];
  return aliases.some((alias) => normalize(alias) === normalize(value));
});

const ExtractedValue = ({ label, value, field }) => (
  <p className="text-xs text-slate-500" data-testid={`ocr-edit-extracted-${field}`}>
    Extracted {label.toLowerCase()}: <span className="font-medium text-slate-700">{value || 'Not available'}</span>
  </p>
);

export const OcrEditDialog = ({ item, open, onOpenChange, configuration, onSave, saving, getAuthHeaders }) => {
  const [values, setValues] = useState(emptyValues);
  const [factors, setFactors] = useState([]);
  const [factorLoading, setFactorLoading] = useState(false);
  const [factorError, setFactorError] = useState('');
  const original = item?.original_values || {};

  useEffect(() => {
    if (item) {
      const current = { ...emptyValues, ...(item.current_values || {}) };
      if (current.scope === 'water') current.ef_method = 'activity';
      setValues(current);
    }
  }, [item]);

  const categories = useMemo(
    () => configuration.categories.filter((option) => option.scope === values.scope),
    [configuration.categories, values.scope],
  );

  useEffect(() => {
    if (!open || !values.scope || !values.category || !values.ef_method) {
      setFactors([]);
      return undefined;
    }
    let active = true;
    setFactorLoading(true);
    setFactorError('');
    getOcrFactorOptions(values.scope, values.category, values.ef_method, getAuthHeaders())
      .then(({ data }) => {
        if (!active) return;
        const options = data.factors || [];
        setFactors(options);
        setValues((current) => {
          const selected = options.find((option) => option.id === current.factor_id)
            || options.find((option) => normalize(option.value) === normalize(current.ef_lookup_key || current.subcategory))
            || options.find((option) => normalize(option.value) === normalize(original.ef_lookup_key || original.subcategory));
          if (!selected) {
            return { ...current, factor_id: '', fuel_id: '', scope3_ef_id: '', subcategory: '', fuel_name: '', ef_lookup_key: '', ef_database: '', unit: '' };
          }
          const matchedUnit = matchingUnit(selected, current.unit || original.unit);
          return {
            ...current,
            factor_id: selected.id,
            fuel_id: selected.collection === 'fuel_database' ? selected.id : '',
            scope3_ef_id: selected.collection === 'scope3_ef' ? selected.id : '',
            subcategory: selected.value,
            fuel_name: selected.value,
            ef_lookup_key: selected.value,
            ef_database: selected.database,
            naics_code: selected.naics_code || (selected.method === 'spend' ? current.naics_code : ''),
            naics_label: selected.naics_label || (selected.method === 'spend' ? current.naics_label : ''),
            unit: matchedUnit || '',
          };
        });
      })
      .catch(() => {
        if (active) {
          setFactors([]);
          setFactorError('Factor options could not be loaded.');
        }
      })
      .finally(() => { if (active) setFactorLoading(false); });
    return () => { active = false; };
  }, [open, values.scope, values.category, values.ef_method, getAuthHeaders, original.ef_lookup_key, original.subcategory, original.unit]);

  const selectedFactor = useMemo(
    () => factors.find((factor) => factor.id === values.factor_id),
    [factors, values.factor_id],
  );
  const allowedUnits = selectedFactor?.allowed_units || [];
  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));
  const resetFactor = (current, patch) => ({ ...current, ...patch, factor_id: '', fuel_id: '', scope3_ef_id: '', ef_database: '', naics_code: '', naics_label: '' });

  const changeScope = (scope) => setValues((current) => resetFactor(current, {
    scope, category: '', category_key: '', category_code: '', ef_method: scope === 'water' ? 'activity' : current.ef_method,
  }));
  const changeCategory = (category) => {
    const option = categories.find((entry) => entry.value === category);
    setValues((current) => resetFactor(current, { category, category_key: option?.key || '', category_code: option?.code || '' }));
  };
  const changeMethod = (ef_method) => setValues((current) => resetFactor(current, { ef_method }));
  const changeFactor = (factorId) => {
    const factor = factors.find((option) => option.id === factorId);
    if (!factor) return;
    const matchedUnit = matchingUnit(factor, values.unit);
    setValues((current) => ({
      ...current,
      factor_id: factor.id,
      fuel_id: factor.collection === 'fuel_database' ? factor.id : '',
      scope3_ef_id: factor.collection === 'scope3_ef' ? factor.id : '',
      subcategory: factor.value,
      fuel_name: factor.value,
      ef_lookup_key: factor.value,
      ef_database: factor.database,
      naics_code: factor.naics_code || '',
      naics_label: factor.naics_label || '',
      unit: matchedUnit || '',
    }));
  };

  const selectionComplete = Boolean(values.category && selectedFactor && values.subcategory && values.unit && !factorError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="ocr-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit activity classification</DialogTitle>
          <DialogDescription>The source extraction stays preserved for audit history.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3 sm:grid-cols-2">
          {[
            ['invoice_number', 'Invoice number'], ['vendor_name', 'Vendor'], ['item_description', 'Item description'],
            ['quantity', 'Quantity'], ['cost', 'Cost'], ['currency', 'Currency'],
            ['naics_code', 'NAICS code'], ['naics_label', 'NAICS commodity'],
          ].map(([field, label]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`ocr-${field}`}>{label}</Label>
              <Input id={`ocr-${field}`} type={['quantity', 'cost'].includes(field) ? 'number' : 'text'} value={values[field] ?? ''} onChange={(event) => set(field, ['quantity', 'cost'].includes(field) ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} data-testid={`ocr-edit-${field}-input`} />
            </div>
          ))}
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={values.scope} onValueChange={changeScope}>
              <SelectTrigger data-testid="ocr-edit-scope-select"><SelectValue /></SelectTrigger>
              <SelectContent>{configuration.enabled_scopes.map((scope) => <SelectItem key={scope} value={scope} data-testid={`ocr-edit-scope-${scope}`}>{scope === 'water' ? 'Water' : scope.replace('scope', 'Scope ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={values.category || ''} onValueChange={changeCategory}>
              <SelectTrigger data-testid="ocr-edit-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{categories.map((category) => <SelectItem key={category.value} value={category.value} data-testid={`ocr-edit-category-${category.code}`}>{category.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Calculation method</Label>
            <Select value={values.ef_method || 'activity'} onValueChange={changeMethod} disabled={values.scope === 'water'}>
              <SelectTrigger data-testid="ocr-edit-method-select"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="activity" data-testid="ocr-edit-method-activity">Activity</SelectItem><SelectItem value="spend" data-testid="ocr-edit-method-spend">Spend</SelectItem><SelectItem value="supplier" data-testid="ocr-edit-method-supplier">Supplier</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subcategory / lookup</Label>
            <Select value={values.factor_id || ''} onValueChange={changeFactor} disabled={factorLoading || factors.length === 0}>
              <SelectTrigger data-testid="ocr-edit-subcategory-select"><SelectValue placeholder={factorLoading ? 'Loading factors…' : 'Select a subcategory'} /></SelectTrigger>
              <SelectContent>{factors.map((factor, index) => <SelectItem key={`${factor.id}-${factor.value}`} value={factor.id} data-testid={`ocr-edit-factor-option-${index}`}>{factor.label}</SelectItem>)}</SelectContent>
            </Select>
            <ExtractedValue label="subcategory" value={original.ef_lookup_key || original.subcategory} field="subcategory" />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={values.unit || ''} onValueChange={(unit) => set('unit', unit)} disabled={!selectedFactor || allowedUnits.length === 0}>
              <SelectTrigger data-testid="ocr-edit-unit-select"><SelectValue placeholder="Select a unit" /></SelectTrigger>
              <SelectContent>{allowedUnits.map((unit, index) => <SelectItem key={unit} value={unit} data-testid={`ocr-edit-unit-option-${index}`}>{unit}</SelectItem>)}</SelectContent>
            </Select>
            <ExtractedValue label="unit" value={original.unit} field="unit" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ocr-ef-database">Factor database</Label>
            <Input id="ocr-ef-database" value={values.ef_database || ''} readOnly data-testid="ocr-edit-ef-database-input" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            {factorLoading && <p className="text-sm text-slate-600" data-testid="ocr-edit-factor-loading">Loading factor options…</p>}
            {!factorLoading && !factorError && values.category && factors.length === 0 && <p className="text-sm text-amber-700" data-testid="ocr-edit-no-factors">No factors are configured for this category and method. Choose another method or contact the factor administrator.</p>}
            {factorError && <p className="text-sm text-red-700" data-testid="ocr-edit-factor-error">{factorError}</p>}
            {!selectionComplete && factors.length > 0 && <p className="text-sm text-amber-700" data-testid="ocr-edit-selection-required">Select a subcategory and one of its allowed units before saving.</p>}
          </div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="ocr-rationale">Accounting rationale</Label><Textarea id="ocr-rationale" value={values.accounting_rationale || ''} onChange={(event) => set('accounting_rationale', event.target.value)} rows={3} data-testid="ocr-edit-rationale-input" /></div>
          <label className="flex items-start gap-3 border border-slate-200 bg-slate-50 p-3 sm:col-span-2" data-testid="ocr-remember-override-control">
            <Checkbox checked={Boolean(values.remember_override)} onCheckedChange={(checked) => set('remember_override', checked === true)} data-testid="ocr-remember-override-checkbox" />
            <span><span className="block text-sm font-medium text-slate-900">Remember this vendor classification</span><span className="mt-1 block text-xs text-slate-600">Future matching rows in this organization reuse the verified mapping.</span></span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="ocr-edit-cancel-button">Cancel</Button>
          <Button type="button" onClick={() => onSave(values)} disabled={saving || factorLoading || !selectionComplete} data-testid="ocr-edit-save-button">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};