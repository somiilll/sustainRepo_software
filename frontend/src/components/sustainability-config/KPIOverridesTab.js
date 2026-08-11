import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Edit2, Trash2 } from 'lucide-react';
import { FieldEditorDialog } from './FieldEditorDialog';
import { mapTypeBack } from './constants';

export function KPIOverridesTab({ orgConfig, allDefaultModules, onSave, saving }) {
  const overrides = orgConfig?.kpi_overrides || {};
  const [editingSubcat, setEditingSubcat] = useState(null);
  const [editFields, setEditFields] = useState([]);
  const [sectionFilter, setSectionFilter] = useState('environment');

  const sectionModules = allDefaultModules[sectionFilter] || [];
  const allSubcats = sectionModules.flatMap(m =>
    (m.subcategories || []).map(s => ({ ...s, module: m.module_name }))
  );

  const startEdit = (sub) => {
    const existing = overrides[sub.subcategory_code]?.fields;
    if (existing && existing.length > 0) {
      setEditFields(existing);
    } else {
      setEditFields((sub.fields || []).map(f => ({
        field_code: f.field_key || f.field_code || '',
        label: f.label || '',
        field_type: f.field_type || 'input',
        response_type: mapTypeBack(f.type || f.response_type || 'text'),
        unit: f.unit || '',
        required: f.required || false,
        help_text: f.placeholder || f.help_text || '',
        display_order: f.display_order || 0,
        enabled: true,
      })));
    }
    setEditingSubcat(sub);
  };

  const removeOverride = (code) => {
    const next = { ...overrides };
    delete next[code];
    onSave({ kpi_overrides: next });
  };

  const saveOverride = () => {
    if (!editingSubcat) return;
    const next = { ...overrides };
    next[editingSubcat.subcategory_code] = { fields: editFields };
    onSave({ kpi_overrides: next });
    setEditingSubcat(null);
  };

  return (
    <>
      <Card className="p-6" data-testid="kpi-overrides-tab">
        <h2 className="text-lg font-semibold mb-2">KPI Question Overrides</h2>
        <p className="text-sm text-stone-500 mb-4">
          Override default questions for global subcategories. Edit loads current defaults; save creates an org-specific override.
        </p>

        <div className="flex gap-2 mb-4">
          {['environment', 'social', 'governance'].map(s => (
            <Button
              key={s}
              size="sm"
              variant={sectionFilter === s ? 'default' : 'outline'}
              onClick={() => setSectionFilter(s)}
              data-testid={`section-filter-${s}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allSubcats.map(sub => {
              const hasOverride = !!overrides[sub.subcategory_code];
              return (
                <TableRow key={sub.subcategory_code}>
                  <TableCell className="text-sm">{sub.module}</TableCell>
                  <TableCell className="text-sm font-medium">{sub.subcategory_name}</TableCell>
                  <TableCell className="text-xs text-stone-500">{sub.field_count || sub.fields?.length || 0}</TableCell>
                  <TableCell>
                    {hasOverride
                      ? <Badge className="text-xs bg-amber-100 text-amber-700">Overridden</Badge>
                      : <Badge variant="outline" className="text-xs">Default</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(sub)} data-testid={`edit-override-${sub.subcategory_code}`}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {hasOverride && (
                        <Button variant="ghost" size="sm" onClick={() => removeOverride(sub.subcategory_code)} className="text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {allSubcats.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-stone-400 py-6">No subcategories for this section</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {editingSubcat && (
        <FieldEditorDialog
          title={`Override: ${editingSubcat.subcategory_name}`}
          description="Edit loads the current default questions. Modify, add, or remove fields, then save to create an org-specific override."
          fields={editFields}
          setFields={setEditFields}
          onSave={saveOverride}
          onClose={() => setEditingSubcat(null)}
          saving={saving}
        />
      )}
    </>
  );
}
