import React, { useEffect, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Plus, Trash2, History } from 'lucide-react';

// Helper to get FY labels
const getFYLabels = (allResponses) => {
  const reportingYear = allResponses?.reporting_year || `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`;
  // Handle both "2025-26" and "FY 2025-26" formats
  const match = reportingYear.match(/(?:FY\s*)?(\d{4})-(\d{2})/);
  if (!match) return { current: 'Current FY', previous: 'Previous FY' };
  const startYear = parseInt(match[1]);
  return {
    current: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
    previous: `FY ${startYear - 1}-${String(startYear).slice(-2)}`
  };
};

// Helper to check if autofill should apply
const shouldAutofill = (historicalData, questionKey) => {
  if (!historicalData) return false;
  const mapping = historicalData.autofill_mappings?.[questionKey];
  const prevResponses = historicalData.previous_responses?.[questionKey];
  return mapping && prevResponses !== undefined && prevResponses !== null;
};

// Helper to get autofilled value for array-based tables (rows of data)
const getAutofillValueForArrayTable = (historicalData, questionKey, rowIndex, sourceColumn) => {
  if (!historicalData?.previous_responses?.[questionKey]) return null;
  const prevData = historicalData.previous_responses[questionKey];
  if (!Array.isArray(prevData) || !prevData[rowIndex]) return null;
  return prevData[rowIndex][sourceColumn];
};

// Helper to get autofilled value for object-based tables (keyed by category)
const getAutofillValueForObjectTable = (historicalData, questionKey, rowKey, sourceColumn) => {
  if (!historicalData?.previous_responses?.[questionKey]) return null;
  const prevData = historicalData.previous_responses[questionKey];
  if (typeof prevData !== 'object' || !prevData[rowKey]) return null;
  return prevData[rowKey][sourceColumn];
};

export function HistoricalMaterialPercentageTableRenderer({ config, value, onChange, isEditing, historicalData = null, allResponses }) {
  const tableConfig = config.table_config || {};
  const columns = tableConfig.columns || [];
  const autofillConfig = tableConfig.historical_autofill_config || {};
  const questionKey = config.question_key;
  const rows = Array.isArray(value) ? value : [{}];
  const fyLabels = getFYLabels(allResponses);
  const hasAutofilled = useRef(false);

  // Autofill effect - runs once when historicalData becomes available
  useEffect(() => {
    if (hasAutofilled.current) return;
    if (!autofillConfig.enabled || !historicalData?.previous_responses?.[questionKey]) return;
    
    const prevData = historicalData.previous_responses[questionKey];
    if (!Array.isArray(prevData) || prevData.length === 0) return;
    
    const sourceCol = autofillConfig.source_column;
    const targetCol = autofillConfig.target_column;
    if (!sourceCol || !targetCol) return;

    // Build new rows with autofilled previous FY data
    const newRows = prevData.map((prevRow, idx) => {
      const currentRow = rows[idx] || {};
      // Only autofill if target column is empty
      if (currentRow[targetCol] === undefined || currentRow[targetCol] === '' || currentRow[targetCol] === null) {
        const autofillValue = prevRow[sourceCol];
        if (autofillValue !== undefined && autofillValue !== null && autofillValue !== '') {
          return { ...currentRow, [targetCol]: autofillValue };
        }
      }
      return currentRow;
    });

    // Check if any autofill happened
    const hasChanges = newRows.some((row, idx) => {
      const oldRow = rows[idx] || {};
      return row[targetCol] !== oldRow[targetCol];
    });

    if (hasChanges) {
      hasAutofilled.current = true;
      onChange(newRows);
    }
  }, [historicalData, questionKey, autofillConfig, rows, onChange]);

  const getColumnLabel = (col) => {
    if (col.key?.includes('current_fy') || col.label?.toLowerCase().includes('current')) 
      return col.label.replace(/Current FY|current FY/gi, fyLabels.current);
    if (col.key?.includes('previous_fy') || col.label?.toLowerCase().includes('previous')) 
      return col.label.replace(/Previous FY|previous FY/gi, fyLabels.previous);
    return col.label;
  };

  const isAutofillColumn = (colKey) => {
    return autofillConfig.enabled && colKey === autofillConfig.target_column;
  };
  
  const handleCellChange = (rowIndex, colKey, cellValue) => {
    const newRows = [...rows];
    if (!newRows[rowIndex]) newRows[rowIndex] = {};
    newRows[rowIndex][colKey] = cellValue;
    onChange(newRows);
  };
  
  const addRow = () => onChange([...rows, {}]);
  const removeRow = (index) => {
    if (rows.length > 1) onChange(rows.filter((_, i) => i !== index));
  };
  
  if (!isEditing) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium">{getColumnLabel(col)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className="text-xs">{row[col.key] ?? '-'}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-2">
      {autofillConfig.enabled && historicalData?.has_previous_data && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md">
          <History className="w-3.5 h-3.5" />
          <span>Previous FY column auto-populated from {historicalData.previous_year} data</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-emerald-50">
              {columns.map((col) => (
                <TableHead key={col.key} className={`text-xs font-medium ${isAutofillColumn(col.key) ? 'bg-amber-50' : ''}`} style={{ width: col.width }}>
                  {getColumnLabel(col)}
                  {isAutofillColumn(col.key) && <Badge variant="outline" className="ml-1 text-[9px] bg-amber-100 text-amber-700">Auto</Badge>}
                </TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={`p-1 ${isAutofillColumn(col.key) ? 'bg-amber-50/50' : ''}`}>
                    <Input
                      type={col.type === 'number' ? 'number' : 'text'}
                      value={row[col.key] ?? ''}
                      onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)}
                      className={`h-8 text-xs ${isAutofillColumn(col.key) ? 'bg-amber-50' : ''}`}
                      step="0.01"
                      placeholder={col.label}
                    />
                  </TableCell>
                ))}
                <TableCell className="p-1">
                  <Button variant="ghost" size="sm" onClick={() => removeRow(rowIdx)} className="h-6 w-6 p-0 text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="w-3 h-3 mr-1" /> Add Material
      </Button>
    </div>
  );
}

export function HistoricalReclaimPercentageTableRenderer({ config, value, onChange, isEditing, historicalData = null, allResponses }) {
  const tableConfig = config.table_config || {};
  const rowCategories = tableConfig.row_categories || [];
  const columnGroups = tableConfig.column_groups || [];
  const autofillConfig = tableConfig.historical_autofill_config || {};
  const questionKey = config.question_key;
  const fyLabels = getFYLabels(allResponses);
  const hasAutofilled = useRef(false);

  const getGroupLabel = (label) => {
    if (label?.toLowerCase().includes('current')) return fyLabels.current;
    if (label?.toLowerCase().includes('previous')) return fyLabels.previous;
    return label;
  };
  
  const data = value || rowCategories.reduce((acc, cat) => {
    acc[cat.key] = {};
    return acc;
  }, {});

  // Autofill effect for object-based table with multiple mappings
  useEffect(() => {
    if (hasAutofilled.current) return;
    if (!autofillConfig.enabled || !historicalData?.previous_responses?.[questionKey]) return;
    
    const prevData = historicalData.previous_responses[questionKey];
    if (typeof prevData !== 'object') return;
    
    const mappings = autofillConfig.mappings || [];
    if (mappings.length === 0) return;

    let hasChanges = false;
    const newData = { ...data };

    // For each row category
    rowCategories.forEach(cat => {
      if (!newData[cat.key]) newData[cat.key] = {};
      const prevRowData = prevData[cat.key] || {};
      
      // Apply each mapping
      mappings.forEach(({ source, target }) => {
        // Only autofill if target is empty
        if (newData[cat.key][target] === undefined || newData[cat.key][target] === '' || newData[cat.key][target] === null) {
          const sourceValue = prevRowData[source];
          if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
            newData[cat.key][target] = sourceValue;
            hasChanges = true;
          }
        }
      });
    });

    if (hasChanges) {
      hasAutofilled.current = true;
      onChange(newData);
    }
  }, [historicalData, questionKey, autofillConfig, data, rowCategories, onChange]);
  
  const handleCellChange = (rowKey, colKey, cellValue) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = cellValue;
    onChange(newData);
  };

  // Check if a column is an autofill target
  const isAutofillColumn = (colKey) => {
    if (!autofillConfig.enabled) return false;
    const mappings = autofillConfig.mappings || [];
    return mappings.some(m => m.target === colKey);
  };
  
  const allColumns = columnGroups.flatMap(g => g.columns.map(c => ({ ...c, group: g.label })));
  
  if (!isEditing) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-100">
              <TableHead rowSpan={2} className="text-xs font-medium border-r">Category</TableHead>
              {columnGroups.map((group) => (
                <TableHead key={group.label} colSpan={group.columns.length} className="text-xs font-medium text-center border-r last:border-r-0">
                  {getGroupLabel(group.label)}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="bg-stone-50">
              {allColumns.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium text-center">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowCategories.map((cat) => (
              <TableRow key={cat.key}>
                <TableCell className="text-xs font-medium border-r">{cat.label}</TableCell>
                {allColumns.map((col) => (
                  <TableCell key={col.key} className="text-xs text-center">
                    {data[cat.key]?.[col.key] !== undefined && data[cat.key]?.[col.key] !== '' ? `${data[cat.key][col.key]}${col.suffix || ''}` : '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-2">
      {autofillConfig.enabled && historicalData?.has_previous_data && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md">
          <History className="w-3.5 h-3.5" />
          <span>Previous FY columns auto-populated from {historicalData.previous_year} data</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-emerald-100">
              <TableHead rowSpan={2} className="text-xs font-medium border-r">Category</TableHead>
              {columnGroups.map((group, idx) => (
                <TableHead key={group.label} colSpan={group.columns.length} className={`text-xs font-medium text-center border-r last:border-r-0 ${idx === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  {getGroupLabel(group.label)}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {allColumns.map((col) => (
                <TableHead key={col.key} className={`text-xs font-medium text-center ${isAutofillColumn(col.key) ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                  {col.label}
                  {isAutofillColumn(col.key) && <Badge variant="outline" className="ml-1 text-[9px] bg-amber-100 text-amber-700">Auto</Badge>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowCategories.map((cat) => (
              <TableRow key={cat.key}>
                <TableCell className="text-xs font-medium border-r bg-stone-50">{cat.label}</TableCell>
                {allColumns.map((col) => (
                  <TableCell key={col.key} className={`p-1 ${isAutofillColumn(col.key) ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-center justify-center">
                      <Input type="number" value={data[cat.key]?.[col.key] ?? ''} onChange={(e) => handleCellChange(cat.key, col.key, parseFloat(e.target.value) || 0)} className={`h-8 text-xs text-center w-20 ${isAutofillColumn(col.key) ? 'bg-amber-50' : ''}`} step="0.01" placeholder="0" />
                      {col.suffix && <span className="ml-1 text-xs text-text-muted">{col.suffix}</span>}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function HistoricalWasteManagementMatrixRenderer({ config, value, onChange, isEditing, historicalData = null, allResponses }) {
  const tableConfig = config.table_config || {};
  const columns = tableConfig.columns || [];
  const autofillConfig = tableConfig.historical_autofill_config || {};
  const questionKey = config.question_key;
  const rows = Array.isArray(value) ? value : [{}];
  const fyLabels = getFYLabels(allResponses);
  const hasAutofilled = useRef(false);

  // Autofill effect - runs once when historicalData becomes available
  useEffect(() => {
    if (hasAutofilled.current) return;
    if (!autofillConfig.enabled || !historicalData?.previous_responses?.[questionKey]) return;
    
    const prevData = historicalData.previous_responses[questionKey];
    if (!Array.isArray(prevData) || prevData.length === 0) return;
    
    const sourceCol = autofillConfig.source_column;
    const targetCol = autofillConfig.target_column;
    if (!sourceCol || !targetCol) return;

    // Build new rows with autofilled previous FY data
    const newRows = prevData.map((prevRow, idx) => {
      const currentRow = rows[idx] || {};
      // Only autofill if target column is empty
      if (currentRow[targetCol] === undefined || currentRow[targetCol] === '' || currentRow[targetCol] === null) {
        const autofillValue = prevRow[sourceCol];
        if (autofillValue !== undefined && autofillValue !== null && autofillValue !== '') {
          return { ...currentRow, [targetCol]: autofillValue };
        }
      }
      return currentRow;
    });

    // Check if any autofill happened
    const hasChanges = newRows.some((row, idx) => {
      const oldRow = rows[idx] || {};
      return row[targetCol] !== oldRow[targetCol];
    });

    if (hasChanges) {
      hasAutofilled.current = true;
      onChange(newRows);
    }
  }, [historicalData, questionKey, autofillConfig, rows, onChange]);

  const getColumnLabel = (col) => {
    if (col.key?.includes('current_fy') || col.label?.toLowerCase().includes('current')) 
      return col.label.replace(/Current FY|current FY/gi, fyLabels.current);
    if (col.key?.includes('previous_fy') || col.label?.toLowerCase().includes('previous')) 
      return col.label.replace(/Previous FY|previous FY/gi, fyLabels.previous);
    return col.label;
  };

  const isAutofillColumn = (colKey) => {
    return autofillConfig.enabled && colKey === autofillConfig.target_column;
  };
  
  const handleCellChange = (rowIndex, colKey, cellValue) => {
    const newRows = [...rows];
    if (!newRows[rowIndex]) newRows[rowIndex] = {};
    newRows[rowIndex][colKey] = cellValue;
    onChange(newRows);
  };
  
  const addRow = () => onChange([...rows, {}]);
  const removeRow = (index) => {
    if (rows.length > 1) onChange(rows.filter((_, i) => i !== index));
  };
  
  if (!isEditing) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs font-medium">{getColumnLabel(col)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className="text-xs">
                    {row[col.key] !== undefined && row[col.key] !== '' ? `${row[col.key]}${col.suffix || ''}` : '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {autofillConfig.enabled && historicalData?.has_previous_data && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md">
          <History className="w-3.5 h-3.5" />
          <span>Previous FY column auto-populated from {historicalData.previous_year} data</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-emerald-50">
              {columns.map((col) => (
                <TableHead key={col.key} className={`text-xs font-medium ${isAutofillColumn(col.key) ? 'bg-amber-50' : ''}`} style={{ width: col.width }}>
                  {getColumnLabel(col)}
                  {isAutofillColumn(col.key) && <Badge variant="outline" className="ml-1 text-[9px] bg-amber-100 text-amber-700">Auto</Badge>}
                </TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={`p-1 ${isAutofillColumn(col.key) ? 'bg-amber-50/50' : ''}`}>
                    {col.type === 'number' ? (
                      <div className="flex items-center">
                        <Input type="number" value={row[col.key] ?? ''} onChange={(e) => handleCellChange(rowIdx, col.key, parseFloat(e.target.value) || 0)} className={`h-8 text-xs ${isAutofillColumn(col.key) ? 'bg-amber-50' : ''}`} step="0.01" placeholder="0" />
                        {col.suffix && <span className="ml-1 text-xs text-text-muted">{col.suffix}</span>}
                      </div>
                    ) : (
                      <Input value={row[col.key] || ''} onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)} className={`h-8 text-xs ${isAutofillColumn(col.key) ? 'bg-amber-50' : ''}`} placeholder={col.label} />
                    )}
                  </TableCell>
                ))}
                <TableCell className="p-1">
                  <Button variant="ghost" size="sm" onClick={() => removeRow(rowIdx)} className="h-6 w-6 p-0 text-red-500 hover:text-red-700">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {tableConfig.allow_add_row !== false && (
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="w-3 h-3 mr-1" /> Add Product Category
        </Button>
      )}
    </div>
  );
}
