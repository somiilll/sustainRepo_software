import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Plus, Trash2, Save } from 'lucide-react';
import { RESPONSE_TYPES, toCode } from './constants';

export function FieldEditorDialog({ title, description, fields, setFields, onSave, onClose, saving }) {
  const addField = () =>
    setFields(prev => [...prev, {
      field_code: '', label: '', field_type: 'input', response_type: 'number',
      unit: '', required: false, display_order: prev.length + 1,
    }]);

  const updateField = (idx, key, value) =>
    setFields(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      if (key === 'label' && !next[idx]._codeEdited) next[idx].field_code = toCode(value);
      return next;
    });

  const removeField = (idx) => setFields(prev => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="field-editor-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || 'Modify, add, or remove fields, then save to create an org-specific override.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {fields.map((f, idx) => (
            <div key={idx} className="grid grid-cols-7 gap-2 items-end p-2 border rounded" data-testid={`override-field-${idx}`}>
              <div>
                <Label className="text-xs">Label</Label>
                <Input value={f.label || ''} onChange={e => updateField(idx, 'label', e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Code</Label>
                <Input
                  value={f.field_code || ''}
                  onChange={e => { updateField(idx, 'field_code', e.target.value); updateField(idx, '_codeEdited', true); }}
                  className="text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={f.response_type || 'text'} onValueChange={v => updateField(idx, 'response_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{RESPONSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input value={f.unit || ''} onChange={e => updateField(idx, 'unit', e.target.value)} className="text-xs" />
              </div>
              <div>
                <Label className="text-xs">Field</Label>
                <Select value={f.field_type || 'input'} onValueChange={v => updateField(idx, 'field_type', v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="input">Input</SelectItem>
                    <SelectItem value="calculated">Calculated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-1 text-xs pb-1">
                <Switch checked={f.required || false} onCheckedChange={v => updateField(idx, 'required', v)} /> Req
              </label>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeField(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addField} className="mt-2" data-testid="add-override-field-btn">
          <Plus className="h-3 w-3 mr-1" /> Add Field
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} data-testid="save-override-btn">
            <Save className="h-4 w-4 mr-1" /> Save Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
