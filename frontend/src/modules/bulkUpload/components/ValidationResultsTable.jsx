/**
 * ValidationResultsTable — per-row results with expandable error details.
 */
import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, HelpCircle,
} from 'lucide-react';
import { ROW_STATUS } from '../core/bulkUploadConstants';

export default function ValidationResultsTable({ rows, expandedRows, onToggleExpand }) {
  return (
    <div className="border rounded-lg overflow-hidden" data-testid="validation-results-table">
      <div className="max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead className="w-16">Sheet</TableHead>
              <TableHead className="w-16">Row</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const expandKey = `${row.sheet}-${row.row_number}`;
              const isExpanded = !!expandedRows[expandKey];
              const isInvalid = row.status === ROW_STATUS.INVALID;
              return (
                <React.Fragment key={`${row.sheet}-${row.row_number}-${idx}`}>
                  <TableRow
                    className={`cursor-pointer ${isInvalid ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-stone-50'}`}
                    onClick={() => row.errors?.length > 0 && onToggleExpand(expandKey)}
                  >
                    <TableCell className="font-mono text-xs font-medium text-blue-600">{row.sheet || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{row.row_number}</TableCell>
                    <TableCell>
                      {row.status === ROW_STATUS.VALID ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Valid
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                          <XCircle className="w-3 h-3 mr-1" /> Error
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{row.row_data?.facility_name || '-'}</TableCell>
                    <TableCell>{row.row_data?.reporting_period || '-'}</TableCell>
                    <TableCell className="max-w-[150px] truncate" title={row.sheet}>{row.sheet || '-'}</TableCell>
                    <TableCell>{row.row_data?.calculation_method || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={row.row_data?.activity}>
                      {row.row_data?.activity || '-'}
                    </TableCell>
                    <TableCell>
                      {row.errors?.length > 0 && (isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />)}
                    </TableCell>
                  </TableRow>
                  {isExpanded && row.errors?.length > 0 && (
                    <TableRow className="bg-red-50">
                      <TableCell colSpan={9} className="p-0">
                        <div className="p-4 space-y-2">
                          {row.errors.map((error, errIdx) => (
                            <div key={errIdx} className="flex items-start gap-3 p-3 bg-white rounded border border-red-200">
                              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{error.column}</Badge>
                                  <span className="font-medium text-red-700">{error.message}</span>
                                </div>
                                {error.suggestion && (
                                  <p className="text-sm text-text-muted mt-1">
                                    <HelpCircle className="w-3 h-3 inline mr-1" />
                                    {error.suggestion}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
