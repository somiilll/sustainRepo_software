/**
 * Scope 3 Dynamic Fields Renderer
 *
 * Extracted from Emissions.js Scope 3 edit dialog. Renders the calc-engine
 * driven `dynamicInputFields` (qty, unit, supplier basis, override checkboxes,
 * unit selectors, supplier-basis text units, etc.) + the Responsible Person
 * triplet for the edit dialog.
 *
 * This component is OWNED by the emissions module layer. Pages mount it
 * via `categoryRegistry.get(<cat>).DynamicFieldsRenderer` — the page itself
 * no longer needs to know how Scope 3 flat-field categories render.
 *
 * Behaviour, markup, and Tailwind classes are byte-identical to the
 * previous inline implementation in Emissions.js (pixel-perfect parity).
 */

import React from 'react';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';

export const Scope3DynamicFieldsRenderer = ({
  dynamicInputFields,
  dynamicFieldValues,
  updateDynamicFieldValue,
  formData,
  setFormData,
  scope3Method,
  selectedFuel,
  requiresSubcategory,
  scope3ActivityId,
  filteredScope3Activities,
  centralizedUnits,
  markFormDirty,
}) => {
  return (
    <div className="space-y-4">
      <div className="text-sm text-stone-500 mb-2 flex items-center gap-2">
        Input Fields (from calculation engine configuration)
      </div>

      {/* Supplier Method Disclaimer - Only for Scope 3 with supplier_basis */}
      {formData.scope === 'scope3' && scope3Method === 'supplier_basis' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the "Quantity Used" field.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {dynamicInputFields.map(field => {
          const isQtyField = field.variable === 'qty' || field.variable === 'qty_energy';

          // Get the currently saved unit for this field
          const savedUnit = dynamicFieldValues[`${field.variable}_unit`] || '';

          // Determine field units based on unit_source
          let fieldUnits = [];
          if (field.unitSource === 'fuel') {
            // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
            if (formData.scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
              const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
              fieldUnits = matchedActivity?.allowed_units || [];
            } else {
              fieldUnits = selectedFuel?.allowed_units || [];
            }
          } else if (field.unitSource === 'all_units') {
            // Show all units from centralized units list
            fieldUnits = centralizedUnits.map(u => u.symbol);

            // For emission_factor_supplier_based with supplier_basis method,
            // only show units with tCO2e or tCO2 in numerator
            if (field.variable === 'emission_factor_supplier_based' && scope3Method === 'supplier_basis') {
              fieldUnits = fieldUnits.filter(u => {
                const upperUnit = u.toUpperCase();
                // Check if the unit starts with tCO2e or tCO2 (in numerator)
                return upperUnit.startsWith('TCO2E') || upperUnit.startsWith('TCO2');
              });
            }
          } else if (field.unitSource === 'scope3_ef') {
            // For scope3_ef: Priority 1: scope3_ef.allowed_units, Priority 2: field mapping, Priority 3: formula expected_unit
            const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            if (matchedEF?.allowed_units?.length > 0) {
              fieldUnits = matchedEF.allowed_units;
            } else if (field.allowedUnits?.length > 0) {
              fieldUnits = field.allowedUnits;
            } else if (field.expectedUnit) {
              fieldUnits = [field.expectedUnit];
            } else {
              fieldUnits = [];
            }
          } else {
            // static - use allowed_units from mapping
            fieldUnits = field.allowedUnits.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
          }

          // Ensure the saved unit is included in fieldUnits (for edit mode)
          if (savedUnit && !fieldUnits.includes(savedUnit)) {
            fieldUnits = [savedUnit, ...fieldUnits];
          }

          // Unitless count fields - should never show unit selector (C6 Business Travel fields)
          const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days'].includes(field.variable);

          const showUnitSelector = fieldUnits.length > 0 && !isUnitlessCountField;

          // For supplier_basis method with supplier-based fields, use text input for units
          const isSupplierBasisUnitField = scope3Method === 'supplier_basis' &&
            (field.variable?.includes('supplier_based') || field.variable?.includes('supplier'));

          // Show checkbox for override fields OR optional fields (not required and not override)
          const showOverrideCheckbox = field.isOverride || (!field.required && !field.isOverride);

          return (
            <div key={field.id || field.variable} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                  {!showUnitSelector && !isSupplierBasisUnitField && field.expectedUnit && (
                    <span className="text-muted-foreground ml-1 text-xs font-normal">({field.expectedUnit})</span>
                  )}
                </Label>

                {showOverrideCheckbox && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`edit-override-${field.variable}`}
                      checked={dynamicFieldValues[`override_${field.variable}`] || false}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        updateDynamicFieldValue(`override_${field.variable}`, isChecked);

                        // When enabling override, initialize the unit to the first allowed unit
                        // This ensures the displayed unit matches what will be sent to backend
                        if (isChecked && !dynamicFieldValues[`${field.variable}_unit`]) {
                          let overrideUnits = [];
                          if (field.unitSource === 'fuel') {
                            // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
                            if (formData.scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
                              const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                              overrideUnits = matchedActivity?.allowed_units || [];
                            } else {
                              overrideUnits = selectedFuel?.allowed_units || [];
                            }
                          } else if (field.unitSource === 'all_units') {
                            overrideUnits = centralizedUnits.map(u => u.symbol);
                          } else {
                            overrideUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
                          }
                          if (overrideUnits.length > 0) {
                            updateDynamicFieldValue(`${field.variable}_unit`, overrideUnits[0]);
                          }
                        }
                      }}
                      className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label
                      htmlFor={`edit-override-${field.variable}`}
                      className="text-xs text-amber-600 font-medium"
                    >
                      Override Default
                    </label>
                  </div>
                )}
              </div>

              {/* Render based on field_type */}
              {field.fieldType === 'select' && field.options?.length > 0 ? (
                <select
                  value={dynamicFieldValues[field.variable] || ''}
                  onChange={(e) => updateDynamicFieldValue(field.variable, e.target.value)}
                  disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                  className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                  data-testid={`edit-select-${field.fieldKey}`}
                >
                  <option value="">Select {field.label}</option>
                  {field.options.map(opt => (
                    <option key={opt.value || opt} value={opt.value || opt}>
                      {opt.label || opt}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={showUnitSelector ? "flex gap-2" : ""}>
                  <Input
                    type={field.fieldType === 'text' ? 'text' : 'number'}
                    step={field.fieldType === 'number' ? 'any' : undefined}
                    min={field.fieldType === 'number' ? '0' : undefined}
                    placeholder={field.placeholder}
                    value={dynamicFieldValues[field.variable] || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (field.fieldType === 'text' || val === '' || parseFloat(val) >= 0) {
                        updateDynamicFieldValue(field.variable, val);
                        // Also sync to formData for legacy compatibility
                        if (isQtyField) {
                          setFormData(prev => ({ ...prev, quantity: val }));
                        }
                      }
                    }}
                    onKeyDown={(e) => { if (field.fieldType === 'number' && e.key === '-') e.preventDefault(); }}
                    disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                    className={`bg-stone-50 ${showUnitSelector ? 'flex-1' : ''} ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                    data-testid={`edit-input-${field.fieldKey}`}
                  />

                  {/* Supplier basis - use text input for units */}
                  {isSupplierBasisUnitField && (
                    <Input
                      type="text"
                      value={dynamicFieldValues[`${field.variable}_unit`] || ''}
                      onChange={(e) => updateDynamicFieldValue(`${field.variable}_unit`, e.target.value)}
                      disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                      className={`bg-stone-50 border border-stone-200 rounded-lg w-32 h-10 ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                      placeholder="Unit (e.g., L, tCO2/L)"
                      data-testid={`edit-unit-${field.fieldKey}`}
                    />
                  )}

                  {/* Non-supplier basis - use dropdown for units */}
                  {!isSupplierBasisUnitField && showUnitSelector && (
                    <select
                      value={dynamicFieldValues[`${field.variable}_unit`] || fieldUnits[0] || ''}
                      onChange={(e) => {
                        updateDynamicFieldValue(`${field.variable}_unit`, e.target.value);
                        if (isQtyField) {
                          setFormData(prev => ({ ...prev, quantity_unit: e.target.value }));
                        }
                      }}
                      disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                      className={`bg-stone-50 border border-stone-200 rounded-lg px-3 w-32 h-10 ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                      data-testid={`edit-unit-${field.fieldKey}`}
                    >
                      {(() => {
                        // Include saved unit in options if not already present
                        const savedUnitInner = dynamicFieldValues[`${field.variable}_unit`];
                        const allUnits = savedUnitInner && !fieldUnits.includes(savedUnitInner)
                          ? [savedUnitInner, ...fieldUnits]
                          : fieldUnits;
                        return allUnits.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ));
                      })()}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Person Responsible fields below dynamic inputs */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="space-y-2">
          <Label htmlFor="responsible_person">Person Responsible</Label>
          <Input
            id="responsible_person"
            value={formData.responsible_person}
            onChange={(e) => { setFormData({ ...formData, responsible_person: e.target.value }); markFormDirty(); }}
            className="bg-stone-50 h-10"
            placeholder="Name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="responsible_person_designation">Designation</Label>
          <Input
            id="responsible_person_designation"
            value={formData.responsible_person_designation}
            onChange={(e) => setFormData({ ...formData, responsible_person_designation: e.target.value })}
            className="bg-stone-50 h-10"
            placeholder="e.g., Environmental Manager"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="responsible_person_contact">Contact</Label>
          <Input
            id="responsible_person_contact"
            value={formData.responsible_person_contact}
            onChange={(e) => setFormData({ ...formData, responsible_person_contact: e.target.value })}
            className="bg-stone-50 h-10"
            placeholder="Email / Phone"
          />
        </div>
      </div>
    </div>
  );
};

export default Scope3DynamicFieldsRenderer;
