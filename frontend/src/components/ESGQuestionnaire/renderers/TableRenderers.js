import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Badge } from '../../ui/badge';
import { Plus, Trash2 } from 'lucide-react';

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

export function DynamicTableRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const columns = tableConfig.columns || [];
  const rows = Array.isArray(value) ? value : [{}];

  const handleCellChange = (rowIdx, colKey, cellValue) => {
    const newRows = [...rows];
    if (!newRows[rowIdx]) newRows[rowIdx] = {};
    newRows[rowIdx][colKey] = cellValue;
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
                <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className="text-xs">{row[col.key] || '-'}</TableCell>
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
                <TableHead key={col.key} className="text-xs font-medium" style={{ width: col.width }}>{col.label}</TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.key} className="p-1">
                    {col.type === 'auto_increment' ? (
                      <span className="text-xs font-medium">{rowIdx + 1}</span>
                    ) : col.type === 'yes_no' ? (
                      <Select value={row[col.key] || ''} onValueChange={(v) => handleCellChange(rowIdx, col.key, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Y</SelectItem>
                          <SelectItem value="no">N</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : col.type === 'select' ? (
                      <Select value={row[col.key] || ''} onValueChange={(v) => handleCellChange(rowIdx, col.key, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {(col.options || []).map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : col.type === 'date' ? (
                      <Input type="date" value={row[col.key] || ''} onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)} className="h-8 text-xs" />
                    ) : col.type === 'url' ? (
                      <Input type="url" value={row[col.key] || ''} onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)} className="h-8 text-xs" placeholder="https://..." />
                    ) : col.type === 'expandable_text' || col.type === 'textarea' ? (
                      <Textarea value={row[col.key] || ''} onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)} className="text-xs min-h-[60px]" placeholder={col.label} />
                    ) : col.type === 'number' ? (
                      <Input type="number" value={row[col.key] || ''} onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)} className="h-8 text-xs" step="0.01" />
                    ) : (
                      <Input value={row[col.key] || ''} onChange={(e) => handleCellChange(rowIdx, col.key, e.target.value)} className="h-8 text-xs" placeholder={col.label} />
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
          <Plus className="w-3 h-3 mr-1" /> Add Row
        </Button>
      )}
    </div>
  );
}

export function FYComparisonTableRenderer({ config, value, onChange, isEditing, allResponses }) {
  const tableConfig = config.table_config || {};
  const fixedRows = tableConfig.fixed_rows || [];
  const columns = tableConfig.columns || [
    { key: 'current_fy', label: 'Current FY', type: 'number' },
    { key: 'previous_fy', label: 'Previous FY', type: 'number' }
  ];
  const data = value || {};
  const fyLabels = getFYLabels(allResponses);

  const getColumnLabel = (col) => {
    if (col.key === 'current_fy' || col.label?.toLowerCase().includes('current')) return fyLabels.current;
    if (col.key === 'previous_fy' || col.label?.toLowerCase().includes('previous')) return fyLabels.previous;
    return col.label;
  };

  const handleCellChange = (rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = val;
    onChange(newData);
  };

  if (fixedRows.length === 0) {
    return (
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              {columns.map(col => (
                <TableHead key={col.key} className="text-xs font-medium">{getColumnLabel(col)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              {columns.map(col => (
                <TableCell key={col.key} className="p-1">
                  {!isEditing ? (
                    <span className="text-sm">{data[col.key] ?? '-'}</span>
                  ) : (
                    <Input type="number" value={data[col.key] ?? ''} onChange={(e) => onChange({ ...data, [col.key]: e.target.value })} className="h-8 text-sm" />
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50">
            <TableHead className="text-xs font-medium w-48">Category</TableHead>
            {columns.map(col => (
              <TableHead key={col.key} className="text-xs font-medium">{getColumnLabel(col)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixedRows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="text-xs font-medium">{row.label}</TableCell>
              {columns.map(col => (
                <TableCell key={col.key} className="p-1">
                  {!isEditing ? (
                    <span className="text-sm">{data[row.key]?.[col.key] ?? '-'}</span>
                  ) : (
                    <Input type="number" value={data[row.key]?.[col.key] ?? ''} onChange={(e) => handleCellChange(row.key, col.key, e.target.value)} className="h-8 text-sm" />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function FixedRowTableRenderer({ config, value, onChange, isEditing }) {
  const tableConfig = config.table_config || {};
  const fixedRows = tableConfig.fixed_rows || [];
  const columns = tableConfig.columns || [];
  const data = value || {};

  const handleCellChange = (rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[rowKey]) newData[rowKey] = {};
    newData[rowKey][colKey] = val;
    onChange(newData);
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50">
            <TableHead className="text-xs font-medium w-48">Category</TableHead>
            {columns.map(col => (
              <TableHead key={col.key} className="text-xs font-medium">{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fixedRows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="text-xs font-medium">{row.label}</TableCell>
              {columns.map(col => (
                <TableCell key={col.key} className="p-1">
                  {!isEditing ? (
                    <span className="text-sm">{data[row.key]?.[col.key] ?? '-'}</span>
                  ) : col.type === 'select' ? (
                    <Select value={data[row.key]?.[col.key] || ''} onValueChange={(v) => handleCellChange(row.key, col.key, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {(col.options || []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={col.type === 'number' ? 'number' : 'text'} value={data[row.key]?.[col.key] ?? ''} onChange={(e) => handleCellChange(row.key, col.key, e.target.value)} className="h-8 text-sm" />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function GroupedMatrixTableRenderer({ config, value, onChange, isEditing, allResponses }) {
  const tableConfig = config.table_config || {};
  const groups = tableConfig.groups || [];
  const columns = tableConfig.columns || [
    { key: 'current_fy', label: 'Current FY' },
    { key: 'previous_fy', label: 'Previous FY' }
  ];
  const data = value || {};
  const fyLabels = getFYLabels(allResponses);

  const getColumnLabel = (col) => {
    if (col.key === 'current_fy' || col.label?.toLowerCase().includes('current')) return fyLabels.current;
    if (col.key === 'previous_fy' || col.label?.toLowerCase().includes('previous')) return fyLabels.previous;
    return col.label;
  };

  const handleCellChange = (groupKey, rowKey, colKey, val) => {
    const newData = { ...data };
    if (!newData[groupKey]) newData[groupKey] = {};
    if (!newData[groupKey][rowKey]) newData[groupKey][rowKey] = {};
    newData[groupKey][rowKey][colKey] = val;
    onChange(newData);
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-stone-50">
            <TableHead className="text-xs font-medium w-64">Parameter</TableHead>
            <TableHead className="text-xs font-medium w-80">Metrics</TableHead>
            {columns.map(col => (
              <TableHead key={col.key} className="text-xs font-medium">{getColumnLabel(col)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(group => (
            group.rows.map((row, rowIdx) => (
              <TableRow key={`${group.key}-${row.key}`} className={rowIdx === 0 ? 'border-t-2' : ''}>
                {rowIdx === 0 && (
                  <TableCell rowSpan={group.rows.length} className="font-medium text-sm align-top bg-stone-50/50">
                    {group.label}
                  </TableCell>
                )}
                <TableCell className="text-sm">{row.label}</TableCell>
                {columns.map(col => (
                  <TableCell key={col.key} className="p-1">
                    {!isEditing ? (
                      <span className="text-sm">{data[group.key]?.[row.key]?.[col.key] ?? '-'}</span>
                    ) : (
                      <Input type="text" value={data[group.key]?.[row.key]?.[col.key] ?? ''} onChange={(e) => handleCellChange(group.key, row.key, col.key, e.target.value)} className="h-8 text-sm" />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
