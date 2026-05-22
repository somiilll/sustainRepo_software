import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Card } from '../../../components/ui/card';
import { History, Calendar as CalendarIcon, User } from 'lucide-react';

/**
 * EmissionHistoryDialog
 *
 * Displays the version history of an emission record. Pure presentational component
 * extracted from Emissions.js (Phase E6) — behavior is byte-identical to the original
 * inline JSX. No business logic changes.
 */
export default function EmissionHistoryDialog({
  open,
  onOpenChange,
  history: selectedEmissionHistory = [],
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {selectedEmissionHistory.length > 0 ? (
            selectedEmissionHistory.map((history, idx) => {
              // Determine if this is a creation or update based on old_values
              const hasOldValues = history.changes?.old_values && Object.keys(history.changes.old_values).length > 0;
              const action = history.changes?.action || (hasOldValues ? 'updated' : 'created');
              const isCreation = action === 'created' || !hasOldValues;
              const oldValues = history.changes?.old_values || {};
              const newValues = history.changes?.new_values || {};

              // Field label mapping for better display
              const fieldLabelMap = {
                'quantity': 'Quantity',
                'quantity_unit': 'Unit',
                'category': 'Category',
                'sub_category': 'Activity',
                'subcategory': 'Sub Category',
                'activity_name': 'Activity',
                'fuel_type': 'Fuel Type',
                'fuel_name': 'Fuel Name',
                'scope': 'Scope',
                'reporting_period': 'Reporting Period',
                'reporting_year': 'Reporting Year',
                'responsible_person': 'Person Responsible',
                'process_names': 'Process Names',
                'notes': 'Notes',
                'total_emissions': 'Total Emissions (tCO₂e)',
                'co2_emissions': 'CO₂ Emissions',
                'ch4_emissions': 'CH₄ Emissions',
                'n2o_emissions': 'N₂O Emissions',
                'co2e_emissions': 'CO₂e Emissions',
                'activity': 'Activity',
                'scope3_activity': 'Scope 3 Activity',
                'scope3_activity_type': 'Activity Type',
                'calculation_method_scope3': 'Calculation Method',
                'emission_factor': 'Emission Factor',
                'ef_unit': 'EF Unit',
                'ef_source': 'EF Source',
                'supplier_name': 'Supplier Name',
                'supplier_code': 'Supplier Code',
                'distance_travelled': 'Distance Travelled',
                'employees': 'Employees',
                'monthly_totals': 'Monthly Totals',
                'monthly_total': 'Monthly Total',
                'yearly_total': 'Yearly Total',
                'dynamic_field_values': 'Input Values',
                'input_values': 'Input Values',
                'inputs': 'Inputs',
                'outputs': 'Outputs',
                'evidence': 'Evidence',
                'evidence_url': 'Evidence',
                // Location fields
                'from_location': 'From Location',
                'to_location': 'To Location',
                // Customer fields (C9)
                'customer_name': 'Customer Name',
                'customer_code': 'Customer Code',
                // Asset fields
                'asset_name': 'Asset Name',
                // Employee-specific fields (C6/C7)
                'employee_name': 'Employee Name',
                'employee_id': 'Employee ID',
                'employee_code': 'Employee Code',
                'employee_added': 'Employee Added',
                'employee_removed': 'Employee Removed',
                'employee_department': 'Employee Department',
                'employee_activity_type': 'Employee Activity Type',
                'employee_from_location': 'Employee From Location',
                'employee_to_location': 'Employee To Location',
                'employee_distance': 'Employee Distance',
                'employee_working_days': 'Employee Working Days',
                'employee_working_hours': 'Employee Working Hours',
                'employee_days_travelled': 'Employee Days Travelled',
                'employee_nights_stayed': 'Employee Nights Stayed',
                'employee_rooms_taken': 'Employee Rooms Taken',
                'employee_no_of_employees': 'Employee Count',
                'employee_emissions': 'Employee Emissions',
                // Dynamic input fields (will use display_name from backend)
                'employee_input_km_travelled': 'Distance Travelled (km)',
                'employee_input_qty_days_travelled': 'No. of Days Travelled',
                'employee_input_distance': 'Distance Travelled',
                'employee_input_working_days': 'Working Days',
                'employee_input_working_hours': 'Working Hours',
                'employee_input_fuel_consumed': 'Fuel Consumed',
                'employee_input_electricity_consumed': 'Electricity Consumed',
                'employee_input_qty': 'Quantity',
                'employee_input_activity_value': 'Activity Value',
                'employee_input_spent_value': 'Spent Value',
                // Travel fields
                'nights_stayed': 'Nights Stayed',
                'rooms_taken': 'Rooms Taken',
              };

              // Helper to format value for display - with proper nested object expansion
              const formatValue = (val, depth = 0) => {
                if (val === null || val === undefined) return '(empty)';
                if (typeof val === 'number') return val.toFixed(4);
                if (typeof val === 'string') return val || '(empty)';
                if (Array.isArray(val)) {
                  if (val.length === 0) return '(empty)';
                  // For arrays of primitives, join them
                  if (val.every(v => typeof v !== 'object' || v === null)) {
                    return val.filter(v => v !== null && v !== undefined).join(', ');
                  }
                  // For arrays of objects (like employees), show count
                  return `${val.length} item(s)`;
                }
                if (typeof val === 'object') {
                  // Skip internal fields
                  const skipKeys = [
                    'scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                    'co2', 'ch4', 'n2o', 'ppp', 'inflation_rate', 'scope3_subcategory', 'scope3_activity_type',
                    'scope3_activity', 'biogenic_scope_selection'
                  ];
                  const keys = Object.keys(val).filter(k => !skipKeys.includes(k));
                  if (keys.length === 0) return '(empty)';

                  // For nested objects, expand key-value pairs nicely
                  const entries = keys
                    .filter(k => val[k] !== null && val[k] !== undefined && val[k] !== '')
                    .map(k => {
                      const v = val[k];
                      // Handle nested objects (like {value: 100, unit: 'kg'})
                      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                        if (v.value !== undefined && v.unit !== undefined) {
                          return `${k}: ${v.value} ${v.unit}`;
                        }
                        return `${k}: ${JSON.stringify(v)}`;
                      }
                      if (typeof v === 'number') return `${k}: ${v.toFixed ? v.toFixed(4) : v}`;
                      return `${k}: ${v}`;
                    });

                  return entries.join(', ') || '(empty)';
                }
                return String(val) || '(empty)';
              };

              // Render complex value with expandable view
              const renderValue = (val, label, field) => {
                if (val === null || val === undefined) return <span className="text-stone-400">(empty)</span>;

                // Handle evidence field specially
                if (field === 'evidence') {
                  return <span className="font-medium">{val}</span>;
                }

                // Handle calculation_method_scope3 - show readable name instead of NaN
                if (field === 'calculation_method_scope3') {
                  const methodNames = {
                    'spend_based': 'Spend Based',
                    'average_data': 'Average Data',
                    'supplier_basis': 'Supplier Basis',
                    'distance_based': 'Distance Based',
                    'fuel_based': 'Fuel Based',
                    'asset_based': 'Asset Based',
                    'lessor_based': 'Lessor Based',
                    'lessee_based': 'Lessee Based',
                    'investment_based': 'Investment Based',
                    'equity_based': 'Equity Based'
                  };
                  const displayVal = methodNames[val] || val || '(not set)';
                  return <span className="font-medium">{displayVal}</span>;
                }

                // Handle sub_category for Scope 3 (shows activity name)
                if (field === 'sub_category' || field === 'scope3_activity') {
                  return <span className="font-medium">{val || '(not set)'}</span>;
                }

                // For Outputs, only show co2e (not individual gases for Scope 3)
                if (label === 'Outputs' && typeof val === 'object') {
                  const co2eVal = val.co2e;
                  if (co2eVal) {
                    const displayVal = typeof co2eVal === 'object' && co2eVal.value !== undefined
                      ? `${Number(co2eVal.value).toFixed(6)} ${co2eVal.unit || 'tCO₂e'}`
                      : `${Number(co2eVal).toFixed(6)} tCO₂e`;
                    return <span className="font-medium">{displayVal}</span>;
                  }
                }

                // Handle input_values (dynamic_field_values with only changed fields)
                if (field === 'input_values' && typeof val === 'object') {
                  const keys = Object.keys(val).filter(k =>
                    val[k]?.value !== null && val[k]?.value !== undefined && val[k]?.value !== ''
                  );
                  if (keys.length === 0) return <span className="text-stone-400">(empty)</span>;

                  const fieldLabelMap = {
                    'qty': 'Quantity',
                    'cv': 'Calorific Value',
                    'density': 'Density',
                    'ef': 'Emission Factor',
                    'ef_heat': 'EF (Heat Basis)',
                    'activity_value': 'Activity Value',
                    'spent_value': 'Spent Value',
                    'calculation_method_scope3': 'Calculation Method'
                  };

                  return (
                    <div className="text-xs space-y-0.5">
                      {keys.map(k => {
                        const v = val[k];
                        if (!v || v.value === null || v.value === undefined) return null;

                        // Format with full precision (up to 10 decimal places, trimmed)
                        const numVal = Number(v.value);
                        const displayVal = !isNaN(numVal)
                          ? `${numVal.toFixed(10).replace(/\.?0+$/, '')}${v.unit ? ' ' + v.unit : ''}`
                          : String(v.value);

                        return (
                          <div key={k} className="flex gap-1">
                            <span className="text-stone-500 capitalize">{fieldLabelMap[k] || k.replace(/_/g, ' ')}:</span>
                            <span className="font-medium">{displayVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // Check if it's a complex object that needs special rendering
                if (typeof val === 'object' && !Array.isArray(val)) {
                  // Fields to skip in version history display (internal IDs and redundant fields)
                  const skipKeys = [
                    'scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                    'co2', 'ch4', 'n2o', 'ppp', 'inflation_rate', 'scope3_subcategory', 'scope3_activity_type',
                    'scope3_activity', 'biogenic_scope_selection'
                  ];

                  const keys = Object.keys(val).filter(k => !skipKeys.includes(k) && !k.startsWith('override_'));
                  if (keys.length > 0) {
                    return (
                      <div className="text-xs space-y-0.5">
                        {keys.slice(0, 8).map(k => {
                          const v = val[k];
                          if (v === null || v === undefined || v === '') return null;

                          // Format value based on type - use full precision
                          let displayVal = v;
                          if (typeof v === 'object' && v !== null) {
                            if (v.value !== undefined) {
                              const numVal = Number(v.value);
                              displayVal = !isNaN(numVal)
                                ? `${numVal.toFixed(10).replace(/\.?0+$/, '')}${v.unit ? ' ' + v.unit : ''}`
                                : String(v.value);
                            } else {
                              displayVal = JSON.stringify(v);
                            }
                          } else if (typeof v === 'number') {
                            displayVal = v.toFixed(10).replace(/\.?0+$/, '');
                          }

                          return (
                            <div key={k} className="flex gap-1">
                              <span className="text-stone-500 capitalize">{k.replace(/_/g, ' ')}:</span>
                              <span className="font-medium">{displayVal}</span>
                            </div>
                          );
                        })}
                        {keys.length > 8 && (
                          <span className="text-stone-400">+{keys.length - 8} more...</span>
                        )}
                      </div>
                    );
                  }
                  return <span className="text-stone-400">(empty)</span>;
                }

                // For simple values - use full precision for numbers
                if (typeof val === 'number') {
                  return <span>{val.toFixed(10).replace(/\.?0+$/, '')}</span>;
                }
                return <span>{formatValue(val)}</span>;
              };

              // Use field_changes from backend if available (new format), otherwise compute manually
              let changedFields = [];

              // Get record's frequency type from version history context (use newValues/oldValues already extracted)
              const recordFrequencyType = newValues?.frequency_type || oldValues?.frequency_type;
              const isC7Record = newValues?.category?.includes('C7') || oldValues?.category?.includes('C7');

              // Fields to skip in version history (internal IDs, metadata, individual gases for Scope 3)
              const skipFields = [
                'scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                'scope3_subcategory', 'scope3_activity_type', 'ppp', 'inflation_rate',
                'scope3_activity', 'biogenic_scope_selection',
                // Skip CO₂e emissions for Scope 3 (redundant with total_emissions)
                'co2e_emissions'
              ];

              // Dynamic skip fields based on frequency type
              if (recordFrequencyType === 'monthly') {
                skipFields.push('yearly_total'); // Don't show yearly_total for monthly records
              }
              if (recordFrequencyType === 'yearly') {
                skipFields.push('monthly_totals'); // Don't show monthly_totals for yearly records
              }

              // For C7 records, skip aggregate total_emissions (we show per-employee instead)
              if (isC7Record) {
                skipFields.push('total_emissions');
              }

              // For Scope 2 records, hide the "Activity" field (sub_category /
              // activity_name) — it duplicates the category for these records.
              const isScope2Record =
                newValues?.scope === 'scope2' || oldValues?.scope === 'scope2';
              if (isScope2Record) {
                skipFields.push('sub_category', 'activity_name');
              }

              if (history.field_changes && history.field_changes.length > 0) {
                // New format: backend provides field_changes array
                changedFields = history.field_changes
                  .filter(fc => !skipFields.includes(fc.field))
                  .map(fc => ({
                    label: fc.display_name || fieldLabelMap[fc.field] || fc.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    oldValue: fc.old_value,
                    newValue: fc.new_value,
                    field: fc.field,
                    fieldType: fc.field_type,
                    employeeName: fc.employee_name,
                    employeeId: fc.employee_id,
                    isComplex: typeof fc.old_value === 'object' || typeof fc.new_value === 'object',
                    oldIsOverride: fc.old_is_override,
                    newIsOverride: fc.new_is_override
                  }));
              } else if (!isCreation && oldValues && newValues) {
                // Fallback: Legacy format - compute from old_values/new_values
                const getEmissionValue = (obj, primaryKey, fallbackKey) => {
                  return obj[primaryKey] ?? obj[fallbackKey] ?? null;
                };

                const fieldsToCompare = [
                  { key: 'quantity', label: 'Quantity' },
                  { key: 'quantity_unit', label: 'Unit' },
                  { key: 'category', label: 'Category' },
                  { key: 'sub_category', label: 'Sub Category' },
                  { key: 'fuel_type', label: 'Fuel Type' },
                  { key: 'scope', label: 'Scope' },
                  { key: 'calculation_method_scope3', label: 'Calculation Method' },
                  { key: 'reporting_period', label: 'Reporting Period' },
                  { key: 'responsible_person', label: 'Person Responsible' },
                  { key: 'process_names', label: 'Process Names' },
                  { key: 'notes', label: 'Notes' },
                  { key: 'total_emissions', label: 'Total Emissions (tCO₂e)', fallback: 'calculated_co2e' },
                  { key: 'co2_emissions', label: 'CO₂ Emissions', fallback: 'calculated_co2' },
                  { key: 'ch4_emissions', label: 'CH₄ Emissions', fallback: 'calculated_ch4' },
                  { key: 'n2o_emissions', label: 'N₂O Emissions', fallback: 'calculated_n2o' },
                ];

                fieldsToCompare.forEach(({ key, label, fallback }) => {
                  let oldVal = fallback ? getEmissionValue(oldValues, key, fallback) : oldValues[key];
                  let newVal = fallback ? getEmissionValue(newValues, key, fallback) : newValues[key];

                  if ((oldVal === null || oldVal === undefined) && (newVal === null || newVal === undefined)) {
                    return;
                  }

                  const oldStr = formatValue(oldVal);
                  const newStr = formatValue(newVal);

                  if (oldStr === newStr) return;

                  // Store raw values for proper rendering
                  changedFields.push({
                    label,
                    oldValue: oldVal,
                    newValue: newVal,
                    field: key,
                    isComplex: typeof oldVal === 'object' || typeof newVal === 'object'
                  });
                });
              }

              return (
                <Card key={history.id} className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${isCreation ? 'bg-green-100' : 'bg-primary/10'}`}>
                      <History className={`w-4 h-4 ${isCreation ? 'text-green-600' : 'text-primary'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-text-primary">
                          {isCreation ? 'Created' : 'Updated'}
                        </p>
                        <span className={`text-xs px-2 py-1 rounded ${
                          idx === 0 ? 'bg-blue-100 text-blue-700' :
                          idx === selectedEmissionHistory.length - 1 ? 'bg-green-100 text-green-700' : 'bg-stone-100'
                        }`}>
                          {idx === 0 ? 'Latest' : idx === selectedEmissionHistory.length - 1 ? 'Initial' : ''}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-text-primary flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-text-muted" />
                          {new Date(history.changed_at).toLocaleString()}
                        </p>
                        <p className="text-sm text-text-secondary flex items-center gap-2">
                          <User className="w-4 h-4 text-text-muted" />
                          {history.changed_by_name || history.changed_by_email || 'Unknown User'}
                        </p>
                      </div>

                      {/* Show changed fields for updates only */}
                      {!isCreation && changedFields.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-stone-200">
                          <p className="text-xs font-semibold text-text-muted uppercase mb-3">Changes Made</p>
                          <div className="space-y-2">
                            {changedFields.map((field, fieldIdx) => (
                              <div key={fieldIdx} className="bg-stone-50 rounded-lg p-3">
                                <p className="text-xs font-medium text-text-primary mb-2">
                                  {field.label}
                                  {/* Show employee name/id for employee-specific changes */}
                                  {field.employeeName && (
                                    <span className="ml-1 text-blue-600 font-normal">
                                      ({field.employeeName})
                                    </span>
                                  )}
                                  {!field.employeeName && field.employeeId && (
                                    <span className="ml-1 text-blue-600 font-normal">
                                      (ID: {field.employeeId})
                                    </span>
                                  )}
                                </p>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div className="bg-red-50 p-2 rounded border border-red-100">
                                    <span className="text-xs text-red-600 font-medium block mb-1">
                                      Old Value
                                      {field.oldIsOverride === false && field.fieldType === 'input_values' && (
                                        <span className="ml-1 text-stone-500 font-normal">(default)</span>
                                      )}
                                      {field.oldIsOverride === true && (
                                        <span className="ml-1 text-orange-600 font-normal">(custom)</span>
                                      )}
                                    </span>
                                    <div className="text-red-800 break-words">
                                      {renderValue(field.oldValue, field.label, field.field)}
                                    </div>
                                  </div>
                                  <div className="bg-green-50 p-2 rounded border border-green-100">
                                    <span className="text-xs text-green-600 font-medium block mb-1">
                                      New Value
                                      {field.newIsOverride === false && field.fieldType === 'input_values' && (
                                        <span className="ml-1 text-stone-500 font-normal">(default)</span>
                                      )}
                                      {field.newIsOverride === true && (
                                        <span className="ml-1 text-orange-600 font-normal">(custom)</span>
                                      )}
                                    </span>
                                    <div className="text-green-800 break-words">
                                      {renderValue(field.newValue, field.label, field.field)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-8 text-text-muted">
              <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No version history available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
