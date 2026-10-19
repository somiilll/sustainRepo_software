import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Edit2, Trash2, Target } from 'lucide-react';
import { FieldEditorDialog } from './FieldEditorDialog';

const DEFAULT_TARGET_FIELDS = [
  { field_code: 'target_value', label: 'Target Value', response_type: 'number', required: true, field_type: 'input', display_order: 1 },
  { field_code: 'target_unit', label: 'Target Unit', response_type: 'text', required: true, field_type: 'input', display_order: 2 },
  { field_code: 'baseline_value', label: 'Baseline Value', response_type: 'number', required: false, field_type: 'input', display_order: 3 },
  { field_code: 'target_reduction_pct', label: 'Target Reduction %', response_type: 'percentage', required: false, field_type: 'input', display_order: 4 },
  { field_code: 'target_year', label: 'Target Year', response_type: 'integer', required: false, field_type: 'input', display_order: 5 },
  { field_code: 'remarks', label: 'Remarks', response_type: 'text', required: false, field_type: 'input', display_order: 6 },
];

export function TargetOverridesTab({ orgConfig, allDefaultModules, onSave, saving }) {
  const overrides = orgConfig?.target_overrides || {};
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
      setEditFields(existing.map(f => ({ ...f })));
    } else {
      // Load default target fields as starting point
      setEditFields(DEFAULT_TARGET_FIELDS.map(f => ({ ...f })));
    }
    setEditingSubcat(sub);
  };

  const removeOverride = (code) => {
    const next = { ...overrides };
    delete next[code];
    onSave({ target_overrides: next });
  };

  const saveOverride = () => {
    if (!editingSubcat) return;
    const next = { ...overrides };
    next[editingSubcat.subcategory_code] = { fields: editFields };
    onSave({ target_overrides: next });
    setEditingSubcat(null);
  };

  const overriddenCount = Object.keys(overrides).length;

  return (
    <>
      <Card className="p-6" data-testid="target-overrides-tab">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Target Question Overrides</h2>
          </div>
          {overriddenCount > 0 && (
            <Badge className="text-xs bg-emerald-100 text-emerald-700">{overriddenCount} overridden</Badge>
          )}
        </div>
        <p className="text-sm text-stone-500 mb-4">
          Define custom questions for the Set Target tab per subcategory. Subcategories without overrides use the 6 default fields (Target Value, Unit, Baseline, Reduction %, Year, Remarks).
        </p>

        {/* Section filter */}
        <div className="flex gap-2 mb-4">
          {['environment', 'social', 'governance'].map(s => (
            <Button
              key={s}
              size="sm"
              variant={sectionFilter === s ? 'default' : 'outline'}
              onClick={() => setSectionFilter(s)}
              data-testid={`target-section-filter-${s}`}
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
              <TableHead>Target Fields</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allSubcats.map(sub => {
              const override = overrides[sub.subcategory_code];
              const hasOverride = !!override;
              const fieldCount = hasOverride ? (override.fields?.length || 0) : DEFAULT_TARGET_FIELDS.length;
              return (
                <TableRow key={sub.subcategory_code} data-testid={`target-row-${sub.subcategory_code}`}>
                  <TableCell className="text-sm">{sub.module}</TableCell>
                  <TableCell className="text-sm font-medium">{sub.subcategory_name}</TableCell>
                  <TableCell className="text-xs text-stone-500">{fieldCount} fields</TableCell>
                  <TableCell>
                    {hasOverride
                      ? <Badge className="text-xs bg-amber-100 text-amber-700">Custom</Badge>
                      : <Badge variant="outline" className="text-xs">Default</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => startEdit(sub)}
                        data-testid={`edit-target-override-${sub.subcategory_code}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {hasOverride && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => removeOverride(sub.subcategory_code)}
                          className="text-red-500"
                          data-testid={`delete-target-override-${sub.subcategory_code}`}
                        >
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
                <TableCell colSpan={5} className="text-center text-stone-400 py-6">
                  No subcategories for this section
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {editingSubcat && (
        <FieldEditorDialog
          title={`Target Questions: ${editingSubcat.subcategory_name}`}
          description="Define the questions users see in the 'Set Target' form for this subcategory. Default fields are pre-loaded; modify or replace as needed."
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
