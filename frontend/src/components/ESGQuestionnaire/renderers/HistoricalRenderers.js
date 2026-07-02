import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { getYearLabelsForTable, replaceYearPlaceholders } from '../../../utils/reportingYearUtils';

/**
 * Helper to get FY/CY labels based on reporting year and organization settings
 * Supports both "FY 2025-2026" and "CY 2025" formats
 * @param {Object} allResponses - Contains reporting_year and optionally year_type/framework
 * @returns {{ current: string, previous: string, yearType: string }}
 */
const getFYLabels = (allResponses) => {
  const reportingYear = allResponses?.reporting_year;
  const yearType = allResponses?.year_type || allResponses?.reporting_year_type || 'financial_year';
  const framework = allResponses?.framework || null;
  
  return getYearLabelsForTable({ reportingYear, yearType, framework });
};

/**
 * Helper to extract previous year's "current FY" value as our "previous FY" display value.
 * 
 * In the new 1-doc-per-year model:
 * - currentYearData contains THIS year's values (displayed in Current FY column)
 * - previousYearData contains LAST year's values (their "current" becomes our "previous")
 * 
 * For backward compatibility during transition, we also check if data was entered
 * in the OLD model (with *_previous_fy fields in the same document).
 */
const getPreviousYearValue = (historicalData, questionKey, fieldKey, rowIdentifier = null) => {
  if (!historicalData?.previous_responses) return null;
  
  const prevData = historicalData.previous_responses[questionKey];
  if (!prevData) return null;
  
  // For array-based tables (like env_recycled_input_material)
  if (Array.isArray(prevData) && rowIdentifier !== null) {
    const row = prevData[rowIdentifier];
    if (!row) return null;
    // Map: previous year's "current_fy" field → our "previous_fy" display
    const currentFyKey = fieldKey.replace('_previous_fy', '_current_fy');
    return row[currentFyKey] ?? row[fieldKey] ?? null;
  }
  
  // For object-based tables (like env_reclaimed_products_packaging)
  if (typeof prevData === 'object' && rowIdentifier !== null) {
    const row = prevData[rowIdentifier];
    if (!row) return null;
    const currentFyKey = fieldKey.replace('_previous_fy', '_current_fy');
    return row[currentFyKey] ?? row[fieldKey] ?? null;
  }
  
  return null;
};

/**
 * Helper to extract "backward fill" value from next year's document.
 * 
 * When viewing FY 2024-25, if the user entered data in 2025-26's "Previous FY" column,
 * that data represents 2024-25 and should appear in 2024-25's "Current FY" column.
 * 
 * This handles the case where data was entered as previous_fy in a future year doc.
 */
const getBackwardFillValue = (historicalData, questionKey, fieldKey, rowIdentifier = null) => {
  if (!historicalData?.next_year_data) return null;
  
  const nextData = historicalData.next_year_data[questionKey];
  if (!nextData) return null;
  
  // The next year's "previous_fy" field contains our "current_fy" data
  const previousFyKey = fieldKey.replace('_current_fy', '_previous_fy');
  
  // For array-based tables
  if (Array.isArray(nextData) && rowIdentifier !== null) {
    const row = nextData[rowIdentifier];
    if (!row) return null;
    return row[previousFyKey] ?? null;
  }
  
  // For object-based tables
  if (typeof nextData === 'object' && rowIdentifier !== null) {
    const row = nextData[rowIdentifier];
    if (!row) return null;
    return row[previousFyKey] ?? null;
  }
  
  return null;
};

export function HistoricalMaterialPercentageTableRenderer({ config, value, onChange, isEditing, historicalData = null, allResponses }) {
  const tableConfig = config.table_config || {};
  const columns = tableConfig.columns || [];
  const questionKey = config.question_key;
  const rows = Array.isArray(value) ? value : [{}];
  const fyLabels = getFYLabels(allResponses);

  const getColumnLabel = (col) => {
    if (col.key?.includes('current_fy') || col.label?.toLowerCase().includes('current')) 
      return col.label.replace(/Current FY|current FY/gi, fyLabels.current);
    if (col.key?.includes('previous_fy') || col.label?.toLowerCase().includes('previous')) 
      return col.label.replace(/Previous FY|previous FY/gi, fyLabels.previous);
    return col.label;
  };

  // Check if this is a "previous_fy" column that should pull from historical data
  const isPreviousFyColumn = (colKey) => colKey?.includes('previous_fy');
  
  // Get the display value - for previous FY columns, try to get from historical data first
  const getDisplayValue = (row, colKey, rowIndex) => {
    // For current FY columns, just use the row value
    if (!isPreviousFyColumn(colKey)) {
      return row[colKey] ?? '';
    }
    
    // For previous FY columns:
    // 1. If user has entered a value in this row, use it
    if (row[colKey] !== undefined && row[colKey] !== null && row[colKey] !== '') {
      return row[colKey];
    }
    
    // 2. Otherwise, try to get from previous year's data
    const historicalValue = getPreviousYearValue(historicalData, questionKey, colKey, rowIndex);
    return historicalValue ?? '';
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
                    {getDisplayValue(row, col.key, idx) || '-'}
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-emerald-50">
              {columns.map((col) => (
                <TableHead 
                  key={col.key} 
                  className={`text-xs font-medium ${isPreviousFyColumn(col.key) ? 'bg-amber-50' : ''}`} 
                  style={{ width: col.width }}
                >
                  {getColumnLabel(col)}
                </TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={`p-1 ${isPreviousFyColumn(col.key) ? 'bg-amber-50/50' : ''}`}>
                    <Input
                      type={col.type === 'number' ? 'number' : 'text'}
                      value={getDisplayValue(row, col.key, rowIdx)}
                      onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)}
                      className={`h-8 text-xs ${isPreviousFyColumn(col.key) ? 'bg-amber-50' : ''}`}
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
  const questionKey = config.question_key;
  const fyLabels = getFYLabels(allResponses);

  const getGroupLabel = (label) => {
    if (label?.toLowerCase().includes('current')) return fyLabels.current;
    if (label?.toLowerCase().includes('previous')) return fyLabels.previous;
    return label;
  };
  
  const data = value || rowCategories.reduce((acc, cat) => {
    acc[cat.key] = {};
    return acc;
  }, {});

  const isPreviousFyColumn = (colKey) => colKey?.includes('previous_fy');
  const isCurrentFyColumn = (colKey) => colKey?.includes('current_fy');

  // Get display value - handles both forward fill (previous year) and backward fill (next year)
  const getDisplayValue = (catKey, colKey) => {
    // If user has entered a value directly, use it
    if (data[catKey]?.[colKey] !== undefined && data[catKey]?.[colKey] !== null && data[catKey]?.[colKey] !== '') {
      return data[catKey][colKey];
    }
    
    // For previous FY columns, try to get from previous year's current FY data
    if (isPreviousFyColumn(colKey)) {
      const historicalValue = getPreviousYearValue(historicalData, questionKey, colKey, catKey);
      if (historicalValue !== null) return historicalValue;
    }
    
    // For current FY columns, try backward fill from next year's previous FY data
    if (isCurrentFyColumn(colKey)) {
      const backfillValue = getBackwardFillValue(historicalData, questionKey, colKey, catKey);
      if (backfillValue !== null) return backfillValue;
    }
    
    return '';
  };
  
  const handleCellChange = (rowKey, colKey, cellValue) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = cellValue;
    onChange(newData);
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
                {allColumns.map((col) => {
                  const displayVal = getDisplayValue(cat.key, col.key);
                  return (
                    <TableCell key={col.key} className="text-xs text-center">
                      {displayVal !== '' ? `${displayVal}${col.suffix || ''}` : '-'}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  
  return (
    <div className="mt-2 space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-emerald-100">
              <TableHead rowSpan={2} className="text-xs font-medium border-r">Category</TableHead>
              {columnGroups.map((group, idx) => (
                <TableHead 
                  key={group.label} 
                  colSpan={group.columns.length} 
                  className={`text-xs font-medium text-center border-r last:border-r-0 ${idx === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}
                >
                  {getGroupLabel(group.label)}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {allColumns.map((col) => (
                <TableHead 
                  key={col.key} 
                  className={`text-xs font-medium text-center ${isPreviousFyColumn(col.key) ? 'bg-amber-50' : 'bg-emerald-50'}`}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowCategories.map((cat) => (
              <TableRow key={cat.key}>
                <TableCell className="text-xs font-medium border-r bg-stone-50">{cat.label}</TableCell>
                {allColumns.map((col) => (
                  <TableCell key={col.key} className={`p-1 ${isPreviousFyColumn(col.key) ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-center justify-center">
                      <Input 
                        type="number" 
                        value={getDisplayValue(cat.key, col.key)} 
                        onChange={(e) => handleCellChange(cat.key, col.key, parseFloat(e.target.value) || 0)} 
                        className={`h-8 text-xs text-center w-20 ${isPreviousFyColumn(col.key) ? 'bg-amber-50' : ''}`} 
                        step="0.01" 
                        placeholder="0" 
                      />
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
  const questionKey = config.question_key;
  const rows = Array.isArray(value) ? value : [{}];
  const fyLabels = getFYLabels(allResponses);

  const getColumnLabel = (col) => {
    if (col.key?.includes('current_fy') || col.label?.toLowerCase().includes('current')) 
      return col.label.replace(/Current FY|current FY/gi, fyLabels.current);
    if (col.key?.includes('previous_fy') || col.label?.toLowerCase().includes('previous')) 
      return col.label.replace(/Previous FY|previous FY/gi, fyLabels.previous);
    return col.label;
  };

  const isPreviousFyColumn = (colKey) => colKey?.includes('previous_fy');

  const getDisplayValue = (row, colKey, rowIndex) => {
    if (!isPreviousFyColumn(colKey)) {
      return row[colKey] ?? '';
    }
    
    if (row[colKey] !== undefined && row[colKey] !== null && row[colKey] !== '') {
      return row[colKey];
    }
    
    const historicalValue = getPreviousYearValue(historicalData, questionKey, colKey, rowIndex);
    return historicalValue ?? '';
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
                {columns.map((col) => {
                  const displayVal = getDisplayValue(row, col.key, idx);
                  return (
                    <TableCell key={col.key} className="text-xs">
                      {displayVal !== '' ? `${displayVal}${col.suffix || ''}` : '-'}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-emerald-50">
              {columns.map((col) => (
                <TableHead 
                  key={col.key} 
                  className={`text-xs font-medium ${isPreviousFyColumn(col.key) ? 'bg-amber-50' : ''}`} 
                  style={{ width: col.width }}
                >
                  {getColumnLabel(col)}
                </TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={`p-1 ${isPreviousFyColumn(col.key) ? 'bg-amber-50/50' : ''}`}>
                    {col.type === 'number' ? (
                      <div className="flex items-center">
                        <Input 
                          type="number" 
                          value={getDisplayValue(row, col.key, rowIdx)} 
                          onChange={(e) => handleCellChange(rowIdx, col.key, parseFloat(e.target.value) || 0)} 
                          className={`h-8 text-xs ${isPreviousFyColumn(col.key) ? 'bg-amber-50' : ''}`} 
                          step="0.01" 
                          placeholder="0" 
                        />
                        {col.suffix && <span className="ml-1 text-xs text-text-muted">{col.suffix}</span>}
                      </div>
                    ) : (
                      <Input 
                        value={getDisplayValue(row, col.key, rowIdx)} 
                        onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)} 
                        className={`h-8 text-xs ${isPreviousFyColumn(col.key) ? 'bg-amber-50' : ''}`} 
                        placeholder={col.label} 
                      />
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
