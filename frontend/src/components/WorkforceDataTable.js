/**
 * WorkforceDataTable — Reusable tabular data entry for workforce ESG KPIs.
 * Configuration-driven: supply title, rows, columns, validations, field mappings.
 * Auto-calculates totals, validates inline, maps to KPI field_values on save.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

function WorkforceDataTable({ config, fieldValues, onChange, isEditing }) {
  const { title, rows, columns, autoCalculate, validations, fieldMap } = config;

  // Determine which cells are auto-calculated vs editable per ROW
  // A row's "total" is auto-calc only if it has both source columns mapped
  const isAutoCalcCell = useCallback((rowKey, colKey) => {
    const sourceCols = autoCalculate?.[colKey];
    if (!sourceCols) return false;
    // Auto-calc only if this row has field mappings for ALL source columns
    return sourceCols.every(sc => fieldMap?.[rowKey]?.[sc]);
  }, [autoCalculate, fieldMap]);

  // Build table data from fieldValues using fieldMap
  const buildData = useCallback(() => {
    const data = {};
    rows.forEach(row => {
      data[row.key] = {};
      columns.forEach(col => {
        if (isAutoCalcCell(row.key, col.key)) {
          data[row.key][col.key] = null; // Will be computed
        } else {
          const fk = fieldMap?.[row.key]?.[col.key];
          data[row.key][col.key] = fk && fieldValues?.[fk] != null ? Number(fieldValues[fk]) : null;
        }
      });
    });
    // Compute auto-calculated cells
    Object.entries(autoCalculate || {}).forEach(([colKey, sourceCols]) => {
      rows.forEach(row => {
        if (isAutoCalcCell(row.key, colKey)) {
          const sum = sourceCols.reduce((s, sc) => s + (data[row.key]?.[sc] || 0), 0);
          const hasInput = sourceCols.some(sc => data[row.key]?.[sc] != null);
          data[row.key][colKey] = hasInput ? sum : null;
        }
      });
    });
    return data;
  }, [fieldValues, rows, columns, autoCalculate, fieldMap, isAutoCalcCell]);

  const [tableData, setTableData] = useState(buildData);
  useEffect(() => setTableData(buildData()), [buildData]);

  const handleChange = (rowKey, colKey, value) => {
    const num = value === '' ? null : Number(value);
    const newData = { ...tableData };
    newData[rowKey] = { ...newData[rowKey], [colKey]: num };

    // Recompute auto-calculated columns for this row (only if row has source mappings)
    Object.entries(autoCalculate || {}).forEach(([calcCol, sourceCols]) => {
      if (isAutoCalcCell(rowKey, calcCol)) {
        const sum = sourceCols.reduce((s, sc) => s + (newData[rowKey]?.[sc] || 0), 0);
        const hasInput = sourceCols.some(sc => newData[rowKey]?.[sc] != null);
        newData[rowKey][calcCol] = hasInput ? sum : null;
      }
    });

    setTableData(newData);

    // Map back to field_values
    const updatedFv = { ...fieldValues };
    rows.forEach(row => {
      columns.forEach(col => {
        const fk = fieldMap?.[row.key]?.[col.key];
        if (fk) {
          const v = newData[row.key]?.[col.key];
          updatedFv[fk] = v != null ? v : '';
        }
      });
    });
    onChange(updatedFv);
  };

  // Run validations
  const validationResults = useMemo(() => {
    if (!validations) return [];
    return validations.map(v => {
      if (v.type === 'sum_equals') {
        return columns.map(col => {
          const sum = v.rows.reduce((s, rk) => s + (tableData[rk]?.[col.key] || 0), 0);
          const target = tableData[v.target]?.[col.key];
          if (target == null) return null;
          const pass = sum === target;
          return { pass, message: `${col.label}: ${v.rows.map(r => rows.find(rr => rr.key === r)?.label || r).join(' + ')} ${pass ? '=' : '≠'} ${rows.find(rr => rr.key === v.target)?.label}`, col: col.key };
        }).filter(Boolean);
      }
      if (v.type === 'less_than_or_equal') {
        return columns.map(col => {
          const val = tableData[v.row]?.[col.key];
          const target = tableData[v.target]?.[col.key];
          if (val == null || target == null) return null;
          const pass = val <= target;
          return { pass, message: `${col.label}: ${rows.find(r => r.key === v.row)?.label} ${pass ? '≤' : '>'} ${rows.find(r => r.key === v.target)?.label}`, col: col.key };
        }).filter(Boolean);
      }
      return [];
    }).flat().filter(Boolean);
  }, [tableData, validations, columns, rows]);

  return (
    <Card className="p-4 border border-stone-200" data-testid={`workforce-table-${config.key || 'default'}`}>
      {title && <h3 className="font-semibold text-text-primary mb-3">{title}</h3>}
      {config.dropdownFields?.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          {config.dropdownFields.map(df => (
            <div key={df.key}>
              <Label className="text-sm">{df.label}</Label>
              {isEditing ? (
                <Select value={fieldValues?.[df.key] || ''} onValueChange={v => onChange({ ...fieldValues, [df.key]: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {df.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm mt-1 font-medium">{fieldValues?.[df.key] || '—'}</p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead className="text-xs font-semibold sticky left-0 bg-stone-50 z-10 min-w-[180px]">Category</TableHead>
              {columns.map(col => (
                <TableHead key={col.key} className={`text-xs font-semibold text-center min-w-[100px]`}>
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.key} className="hover:bg-stone-50/50">
                <TableCell className="text-sm font-medium sticky left-0 bg-white z-10">{row.label}</TableCell>
                {columns.map(col => {
                  const isAuto = isAutoCalcCell(row.key, col.key);
                  const val = tableData[row.key]?.[col.key];
                  return (
                    <TableCell key={col.key} className={`text-center ${isAuto ? 'bg-stone-50' : ''}`}>
                      {isAuto || !isEditing ? (
                        <span className={`text-sm ${val != null ? 'font-medium' : 'text-stone-300'}`}>
                          {val != null ? val.toLocaleString() : '—'}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min="0"
                          className="h-8 text-sm text-center w-24 mx-auto"
                          value={val != null ? val : ''}
                          placeholder="—"
                          onChange={e => handleChange(row.key, col.key, e.target.value)}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Validation indicators */}
      {validationResults.length > 0 && (
        <div className="mt-3 space-y-1">
          {validationResults.map((v, i) => (
            <div key={i} className={`flex items-center gap-1.5 text-xs ${v.pass ? 'text-green-600' : 'text-amber-600'}`}>
              {v.pass ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              <span>{v.message}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default WorkforceDataTable;
