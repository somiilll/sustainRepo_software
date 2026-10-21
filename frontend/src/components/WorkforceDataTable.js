/**
 * WorkforceDataTable — Reusable tabular data entry for workforce ESG KPIs.
 * Configuration-driven: supply title, rows, columns, validations, field mappings.
 * Auto-calculates totals, validates inline, maps to KPI field_values on save.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

function WorkforceDataTable({ config, fieldValues, onChange, isEditing }) {
  const { title, rows, columns, autoCalculate, validations, fieldMap } = config;
  const manualTotals = useRef(new Set());
  const cellId = (rowKey, colKey) => `${rowKey}:${colKey}`;
  const [collapsedRows, setCollapsedRows] = useState({});
  const childRows = useMemo(() => rows.reduce((all, row) => {
    if (row.parent) (all[row.parent] ||= []).push(row.key);
    return all;
  }, {}), [rows]);
  const rowVisible = (row) => {
    let parent = row.parent;
    while (parent) {
      if (collapsedRows[parent]) return false;
      parent = rows.find((candidate) => candidate.key === parent)?.parent;
    }
    return true;
  };

  // Determine which cells are auto-calculated vs editable per ROW
  // A row's "total" is auto-calc only if it has both source columns mapped
  const isAutoCalcCell = useCallback((rowKey, colKey) => {
    const sourceCols = autoCalculate?.[colKey];
    if (!sourceCols) return false;
    // Auto-calc only if this row has field mappings for ALL source columns
    return sourceCols.every(sc => fieldMap?.[rowKey]?.[sc]);
  }, [autoCalculate, fieldMap]);

  const mapped = (rk, ck) => !!fieldMap?.[rk]?.[ck];
  const childValues = (data, row, ck) => (row.sumOf || []).filter((c) => mapped(c, ck))
    .map((c) => data[c]?.[ck]).filter((v) => v != null);
  const isSumCell = (data, row, ck) => !!row.sumOf && mapped(row.key, ck) && childValues(data, row, ck).length > 0;

  // Fill parent rows from their children, then row totals from female + male
  const computeAuto = useCallback((data) => {
    const next = {};
    rows.forEach((r) => { next[r.key] = { ...data[r.key] }; });
    (config.sumOrder || []).forEach((pk) => {
      const prow = rows.find((r) => r.key === pk);
      columns.forEach((col) => {
        if (manualTotals.current.has(cellId(pk, col.key))) return;
        const vals = mapped(pk, col.key) ? childValues(next, prow, col.key) : [];
        if (vals.length) next[pk][col.key] = vals.reduce((x, y) => x + y, 0);
      });
    });
    Object.entries(autoCalculate || {}).forEach(([colKey, sourceCols]) => {
      rows.forEach((row) => {
        if (manualTotals.current.has(cellId(row.key, colKey))) return;
        if (!isAutoCalcCell(row.key, colKey) || isSumCell(data, row, colKey)) return;
        const sum = sourceCols.reduce((x, sc) => x + (next[row.key]?.[sc] || 0), 0);
        next[row.key][colKey] = sourceCols.some((sc) => next[row.key]?.[sc] != null) ? sum : null;
      });
    });
    return next;
  }, [rows, columns, autoCalculate, fieldMap, config.sumOrder, isAutoCalcCell]);

  const buildData = useCallback(() => {
    const data = {};
    rows.forEach((row) => {
      data[row.key] = {};
      columns.forEach((col) => {
        const fk = fieldMap?.[row.key]?.[col.key];
        data[row.key][col.key] = fk && fieldValues?.[fk] != null && fieldValues?.[fk] !== '' ? Number(fieldValues[fk]) : null;
      });
    });
    return computeAuto(data);
  }, [fieldValues, rows, columns, fieldMap, computeAuto]);

  const [tableData, setTableData] = useState(buildData);
  useEffect(() => setTableData(buildData()), [buildData]);

  const handleChange = (rowKey, colKey, value) => {
    const num = value === '' ? null : Number(value);
    const row = rows.find((item) => item.key === rowKey);
    const isDerivedCell = isAutoCalcCell(rowKey, colKey) || !!row?.sumOf;
    if (config.editableAutoTotals && isDerivedCell) {
      if (num == null) manualTotals.current.delete(cellId(rowKey, colKey));
      else manualTotals.current.add(cellId(rowKey, colKey));
    }
    const base = {};
    rows.forEach((r) => { base[r.key] = { ...tableData[r.key] }; });
    (config.sumOrder || []).forEach((pk) => {
      const prow = rows.find((r) => r.key === pk);
      columns.forEach((col) => {
        if (isSumCell(base, prow, col.key) && !manualTotals.current.has(cellId(pk, col.key))) {
          base[pk][col.key] = null;
        }
      });
    });
    base[rowKey][colKey] = num;
    const newData = computeAuto(base);

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
      {title && <h3 className="font-semibold text-text-primary mb-3" data-testid={`workforce-${config.key}-title`}>{title}</h3>}
      {config.dropdownFields?.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          {config.dropdownFields.map(df => (
            <div key={df.key}>
              <Label className="text-sm" data-testid={`workforce-${config.key}-${df.key}-label`}>{df.label}</Label>
              {isEditing ? (
                <Select value={fieldValues?.[df.key] || ''} onValueChange={v => onChange({ ...fieldValues, [df.key]: v })}>
                  <SelectTrigger className="mt-1 rounded-[10px]" data-testid={`workforce-${config.key}-${df.key}-select`}><SelectValue placeholder="Select..." /></SelectTrigger>
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
              <TableHead className="text-xs font-semibold sticky left-0 bg-stone-50 z-10 min-w-[180px]" data-testid={`workforce-${config.key}-category-heading`}>Category</TableHead>
              {columns.map(col => (
                <TableHead key={col.key} className={`text-xs font-semibold text-center min-w-[100px]`} data-testid={`workforce-${config.key}-${col.key}-heading`}>
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.filter(rowVisible).map((row, idx) => (
              <React.Fragment key={row.key}>
              {row.group && row.group !== rows[idx - 1]?.group && (
                <TableRow className="bg-stone-50/70">
                  <TableCell colSpan={columns.length + 1} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {row.group}
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="hover:bg-stone-50/50" data-testid={`workforce-row-${row.key}`}>
                <TableCell className="text-sm font-medium sticky left-0 bg-white z-10" style={{ paddingLeft: 16 + (row.level || 0) * 16 }} data-testid={`workforce-${config.key}-${row.key}-label`}>
                  <span className="inline-flex items-center gap-1">
                    {childRows[row.key]?.length ? <button type="button" onClick={() => setCollapsedRows(current => ({ ...current, [row.key]: !current[row.key] }))} data-testid={`workforce-${config.key}-${row.key}-toggle`} className="text-stone-500 hover:text-stone-800">{collapsedRows[row.key] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : <span className="w-4" />}
                    {row.label}
                  </span>
                </TableCell>
                {columns.map(col => {
                  if (!mapped(row.key, col.key)) {
                    return <TableCell key={col.key} className="text-center text-stone-300" data-testid={`workforce-${config.key}-${row.key}-${col.key}-unavailable`}>—</TableCell>;
                  }
                  const isAuto = isAutoCalcCell(row.key, col.key) || isSumCell(tableData, row, col.key);
                  const editableAutoTotal = config.editableAutoTotals && isAuto;
                  const val = tableData[row.key]?.[col.key];
                  return (
                    <TableCell key={col.key} className={`text-center ${isAuto ? 'bg-stone-50' : ''}`}>
                      {(isAuto && !editableAutoTotal) || !isEditing ? (
                        <span className={`text-sm ${val != null ? 'font-medium' : 'text-stone-300'}`} data-testid={`workforce-${config.key}-${row.key}-${col.key}-value`}>
                          {val != null ? val.toLocaleString() : '—'}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min="0"
                          className="h-8 w-24 mx-auto rounded-[10px] text-center text-sm"
                          value={val != null ? val : ''}
                          placeholder="—"
                          onChange={e => handleChange(row.key, col.key, e.target.value)}
                          data-testid={`workforce-${config.key}-${row.key}-${col.key}-input`}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Validation indicators */}
      {validationResults.length > 0 && (
        <div className="mt-3 space-y-1">
          {validationResults.map((v, i) => (
            <div key={i} className={`flex items-center gap-1.5 text-xs ${v.pass ? 'text-green-600' : 'text-amber-600'}`} data-testid={`workforce-${config.key}-validation-${i}`}>
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
