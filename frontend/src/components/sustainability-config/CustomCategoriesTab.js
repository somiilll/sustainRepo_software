import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Edit2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { RESPONSE_TYPES, toCode } from './constants';

export function CustomCategoriesTab({ orgConfig, onSave, saving }) {
  const customs = orgConfig?.categories?.custom || [];
  const disabled = orgConfig?.categories?.disabled || [];
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editCat, setEditCat] = useState(null);

  const startAdd = () => {
    setEditCat({
      module_code: '', module_name: '', category_code: '', category_name: '',
      section: 'environment', display_order: customs.length + 1, fields: [],
    });
    setEditingIdx(-1);
  };

  const startEdit = (idx) => {
    setEditCat({ ...customs[idx], fields: [...(customs[idx].fields || [])] });
    setEditingIdx(idx);
  };

  const saveCat = () => {
    if (!editCat.category_code || !editCat.category_name || !editCat.module_code) {
      toast.error('Module code, category name and code are required');
      return;
    }
    if (!editCat.module_name) {
      editCat.module_name = editCat.module_code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    const next = [...customs];
    if (editingIdx >= 0) next[editingIdx] = editCat; else next.push(editCat);
    onSave({ categories: { custom: next, disabled } });
    setEditCat(null);
  };

  const removeCat = (idx) => {
    if (!window.confirm('Remove?')) return;
    onSave({ categories: { custom: customs.filter((_, i) => i !== idx), disabled } });
  };

  return (
    <Card className="p-6" data-testid="custom-categories-tab">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Custom Categories</h2>
          <p className="text-sm text-stone-500">Add org-specific categories with their own fields.</p>
        </div>
        <Button size="sm" onClick={startAdd} data-testid="add-custom-cat-btn">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {customs.length === 0 ? (
        <p className="text-center py-6 text-stone-400 text-sm">No custom categories.</p>
      ) : (
        <div className="space-y-2">
          {customs.map((cat, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`custom-cat-${cat.category_code}`}>
              <div>
                <div className="font-medium text-sm">{cat.module_name || cat.module_code} &gt; {cat.category_name}</div>
                <div className="text-xs text-stone-500">Section: {cat.section || 'environment'} · {cat.fields?.length || 0} fields</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(idx)}><Edit2 className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeCat(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editCat && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditCat(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="custom-cat-dialog">
            <DialogHeader>
              <DialogTitle>{editingIdx >= 0 ? 'Edit' : 'Add'} Custom Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Section</Label>
                  <Select value={editCat.section || 'environment'} onValueChange={v => setEditCat(c => ({ ...c, section: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="environment">Environment</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="governance">Governance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Module Name</Label>
                  <Input
                    value={editCat.module_name || ''}
                    onChange={e => setEditCat(c => ({
                      ...c, module_name: e.target.value,
                      module_code: editingIdx >= 0 ? c.module_code : toCode(e.target.value),
                    }))}
                    placeholder="e.g. Power"
                    data-testid="custom-cat-module-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Module Code</Label>
                  <Input value={editCat.module_code} onChange={e => setEditCat(c => ({ ...c, module_code: e.target.value }))} disabled={editingIdx >= 0} className="text-xs font-mono" />
                </div>
                <div>
                  <Label>Category Name</Label>
                  <Input
                    value={editCat.category_name}
                    onChange={e => setEditCat(c => ({
                      ...c, category_name: e.target.value,
                      category_code: editingIdx >= 0 ? c.category_code : toCode(e.target.value),
                    }))}
                    placeholder="e.g. Electricity"
                    data-testid="custom-cat-name"
                  />
                </div>
                <div>
                  <Label>Category Code</Label>
                  <Input value={editCat.category_code} onChange={e => setEditCat(c => ({ ...c, category_code: e.target.value }))} disabled={editingIdx >= 0} className="text-xs font-mono" data-testid="custom-cat-code" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Fields / Questions</Label>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setEditCat(c => ({
                      ...c,
                      fields: [...(c.fields || []), {
                        field_code: '', label: '', field_type: 'input', response_type: 'number',
                        unit: '', required: false, display_order: (c.fields?.length || 0) + 1,
                      }],
                    }))}
                    data-testid="add-custom-field-btn"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                {(editCat.fields || []).map((f, fi) => (
                  <div key={fi} className="grid grid-cols-6 gap-2 mb-2 items-end">
                    <Input
                      placeholder="Label" value={f.label}
                      onChange={e => {
                        const fields = [...editCat.fields];
                        fields[fi] = { ...fields[fi], label: e.target.value, field_code: editingIdx >= 0 && f.field_code ? f.field_code : toCode(e.target.value) };
                        setEditCat(c => ({ ...c, fields }));
                      }}
                    />
                    <Input placeholder="Code" value={f.field_code} onChange={e => { const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], field_code: e.target.value }; setEditCat(c => ({ ...c, fields })); }} className="text-xs" />
                    <Select value={f.response_type} onValueChange={v => { const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], response_type: v }; setEditCat(c => ({ ...c, fields })); }}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{RESPONSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Unit" value={f.unit || ''} onChange={e => { const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], unit: e.target.value }; setEditCat(c => ({ ...c, fields })); }} className="text-xs" />
                    <label className="flex items-center gap-1 text-xs">
                      <Switch checked={f.required} onCheckedChange={v => { const fields = [...editCat.fields]; fields[fi] = { ...fields[fi], required: v }; setEditCat(c => ({ ...c, fields })); }} /> Req
                    </label>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setEditCat(c => ({ ...c, fields: c.fields.filter((_, i) => i !== fi) }))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCat(null)}>Cancel</Button>
              <Button onClick={saveCat} disabled={saving} data-testid="save-custom-cat-btn">
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
