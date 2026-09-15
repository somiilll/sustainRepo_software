import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';

const emptyValues = { scope: 'scope1', category: '', quantity: '', cost: '', remember_override: false };

export const OcrEditDialog = ({ item, open, onOpenChange, configuration, onSave, saving }) => {
  const [values, setValues] = useState(emptyValues);
  useEffect(() => {
    if (item) setValues({ ...emptyValues, ...(item.current_values || {}) });
  }, [item]);
  const categories = useMemo(() => configuration.categories.filter((option) => option.scope === values.scope), [configuration.categories, values.scope]);
  const set = (field, value) => setValues((current) => ({ ...current, [field]: value }));

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
            ['subcategory', 'Subcategory / lookup'], ['quantity', 'Quantity'], ['unit', 'Unit'],
            ['cost', 'Cost'], ['currency', 'Currency'], ['naics_code', 'NAICS code'], ['naics_label', 'NAICS commodity'],
          ].map(([field, label]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`ocr-${field}`}>{label}</Label>
              <Input id={`ocr-${field}`} type={['quantity', 'cost'].includes(field) ? 'number' : 'text'} value={values[field] ?? ''} onChange={(event) => set(field, ['quantity', 'cost'].includes(field) ? (Number(event.target.value) || '') : event.target.value)} data-testid={`ocr-edit-${field}-input`} />
            </div>
          ))}
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={values.scope} onValueChange={(scope) => setValues((current) => ({ ...current, scope, category: '' }))}>
              <SelectTrigger data-testid="ocr-edit-scope-select"><SelectValue /></SelectTrigger>
              <SelectContent>{configuration.enabled_scopes.map((scope) => <SelectItem key={scope} value={scope} data-testid={`ocr-edit-scope-${scope}`}>{scope.replace('scope', 'Scope ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={values.category || ''} onValueChange={(category) => set('category', category)}>
              <SelectTrigger data-testid="ocr-edit-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{categories.map((category) => <SelectItem key={category.value} value={category.value} data-testid={`ocr-edit-category-${category.value}`}>{category.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Calculation method</Label>
            <Select value={values.ef_method || 'activity'} onValueChange={(method) => set('ef_method', method)}>
              <SelectTrigger data-testid="ocr-edit-method-select"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="activity" data-testid="ocr-edit-method-activity">Activity</SelectItem><SelectItem value="spend" data-testid="ocr-edit-method-spend">Spend</SelectItem><SelectItem value="supplier" data-testid="ocr-edit-method-supplier">Supplier</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="ocr-ef-database">Factor database</Label><Input id="ocr-ef-database" value={values.ef_database || ''} onChange={(event) => set('ef_database', event.target.value)} data-testid="ocr-edit-ef-database-input" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="ocr-rationale">Accounting rationale</Label><Textarea id="ocr-rationale" value={values.accounting_rationale || ''} onChange={(event) => set('accounting_rationale', event.target.value)} rows={3} data-testid="ocr-edit-rationale-input" /></div>
          <label className="flex items-start gap-3 border border-slate-200 bg-slate-50 p-3 sm:col-span-2" data-testid="ocr-remember-override-control">
            <Checkbox checked={Boolean(values.remember_override)} onCheckedChange={(checked) => set('remember_override', checked === true)} data-testid="ocr-remember-override-checkbox" />
            <span><span className="block text-sm font-medium text-slate-900">Remember this vendor classification</span><span className="mt-1 block text-xs text-slate-600">Future matching rows in this organization reuse the verified mapping.</span></span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="ocr-edit-cancel-button">Cancel</Button>
          <Button type="button" onClick={() => onSave(values)} disabled={saving} data-testid="ocr-edit-save-button">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
