import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  Upload, 
  Download,
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  FileDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  History
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BulkUpload() {
  const { getAuthHeader } = useAuth();
  
  // States
  const [uploading, setUploading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [downloadingErrors, setDownloadingErrors] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [organization, setOrganization] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  // Check if organization has scope 3 access
  const hasScope3Access = organization?.enabled_access?.includes('scope1_2_3') || false;

  // Load organization
  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, {
          headers: getAuthHeader()
        });
        setOrganization(res.data);
      } catch (error) {
        console.error('Failed to load organization:', error);
      } finally {
        setLoadingOrg(false);
      }
    };
    fetchOrg();
  }, [getAuthHeader]);

  // Load previous sessions (jobs)
  const loadSessions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/bulk-upload/scope3/jobs`, {
        headers: getAuthHeader()
      });
      setSessions(res.data?.jobs || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Download template
  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await axios.get(`${API}/api/bulk-upload/scope3/template/download`, {
        headers: getAuthHeader(),
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Scope3_BulkUpload_Template_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Failed to download template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // Handle file upload - VALIDATION ONLY, no auto-save
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.xlsx')) {
      toast.error('Please upload an Excel file (.xlsx)');
      return;
    }
    
    setUploading(true);
    setValidationResult(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // Pass validate_only=true to prevent auto-saving
      const response = await axios.post(`${API}/api/bulk-upload/scope3/upload?validate_only=true`, formData, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Transform scope3 response to match UI expectations
      const data = response.data;
      const transformedResult = {
        upload_id: data.job_id,
        template_type: 'scope3',
        summary: {
          total_rows: data.total_rows,
          valid_rows: data.success_count,
          invalid_rows: data.error_count,
          categories: data.categories_processed?.reduce((acc, cat) => {
            acc[cat] = { category_name: cat, valid_rows: 0, invalid_rows: 0 };
            return acc;
          }, {}) || {}
        },
        rows: data.results?.map(r => ({
          sheet: r.sheet,
          row_number: r.row,
          status: r.success ? 'valid' : 'invalid',
          row_data: r.row_data || {},
          errors: r.errors?.map(e => ({
            column: e.column,
            message: e.message,
            suggestion: e.suggestion
          })) || []
        })) || [],
        total_emissions_tco2e: data.total_emissions_tco2e,
        is_validated_only: true  // Flag to indicate data not saved yet
      };
      
      setValidationResult(transformedResult);
      
      if (data.error_count === 0) {
        toast.success(`Validation complete: All ${data.success_count} rows are valid. Choose an action below.`);
      } else if (data.success_count > 0) {
        toast.warning(`Validation complete: ${data.success_count} valid, ${data.error_count} with errors. Choose an action below.`);
      } else {
        toast.error(`Validation complete: All ${data.error_count} rows have errors. Download error report or upload a corrected file.`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process file');
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  // Save valid rows - calls the save endpoint
  const handleSaveValidRows = async () => {
    if (!validationResult || !validationResult.upload_id) return;
    
    if (validationResult.summary.valid_rows === 0) {
      toast.error('No valid rows to save');
      return;
    }
    
    setSavingRows(true);
    try {
      const response = await axios.post(
        `${API}/api/bulk-upload/scope3/jobs/${validationResult.upload_id}/save`,
        {},
        { headers: getAuthHeader() }
      );
      
      if (response.data.success) {
        toast.success(`${response.data.saved_count} emission records saved successfully!`);
        setValidationResult(null);
        loadSessions();
      } else {
        toast.error(response.data.error || 'Failed to save records');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || 'Failed to save records';
      toast.error(errorMsg);
    } finally {
      setSavingRows(false);
    }
  };
  
  // Discard validation and start fresh
  const handleDiscardAndUploadNew = () => {
    setValidationResult(null);
    toast.info('Validation discarded. You can upload a new file.');
  };

  // Download error report
  const handleDownloadErrorReport = async () => {
    if (!validationResult) return;
    
    setDownloadingErrors(true);
    try {
      const response = await axios.get(
        `${API}/api/bulk-upload/scope3/jobs/${validationResult.upload_id}/errors/download`,
        {
          headers: getAuthHeader(),
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Error_Report_${validationResult.upload_id.slice(0, 8)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Error report downloaded');
    } catch (error) {
      toast.error('Failed to download error report');
    } finally {
      setDownloadingErrors(false);
    }
  };

  // Toggle row expansion
  const toggleRowExpansion = (rowNum) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowNum]: !prev[rowNum]
    }));
  };

  // Loading state
  if (loadingOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Access denied if no Scope 3 access
  if (!hasScope3Access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Bulk Upload</h1>
          <p className="text-text-muted mt-1">Upload GHG emissions data in bulk using Excel</p>
        </div>
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-stone-100 rounded-full">
              <AlertTriangle className="w-8 h-8 text-stone-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Scope 3 Access Required</h3>
              <p className="text-text-muted mt-2 max-w-md">
                Bulk upload is currently available for Scope 3 emissions only. 
                Your organization does not have Scope 3 access enabled. 
                Please contact your administrator to enable this feature.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-primary">Bulk Upload</h1>
          <p className="text-text-muted mt-1">Upload GHG emissions data in bulk using Excel</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowHistory(!showHistory)}
            data-testid="toggle-history-btn"
          >
            <History className="w-4 h-4 mr-2" />
            {showHistory ? 'Hide History' : 'Upload History'}
          </Button>
        </div>
      </div>

      {/* Upload History */}
      {showHistory && sessions.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Recent Uploads</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {sessions.map((session) => (
              <div 
                key={session.id} 
                className="flex items-center justify-between p-2 bg-stone-50 rounded text-sm"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <span className="font-medium">{session.filename || `Upload ${session.id?.slice(0,8)}`}</span>
                  <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                    {session.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-text-muted">
                  <span>{session.success_count || 0} valid / {session.total_rows || 0} total</span>
                  <span>{session.total_emissions_tco2e?.toFixed(2) || 0} tCO2e</span>
                  <span>{new Date(session.uploaded_at || session.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Step 1: Download Template - Hidden for now */}
      {/* <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Download className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Step 1: Download Template</h2>
            <div className="flex items-center gap-4 mt-4">
              <Button 
                onClick={handleDownloadTemplate}
                disabled={downloadingTemplate}
                data-testid="download-template-btn"
              >
                {downloadingTemplate ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-2" />
                )}
                Download Template
              </Button>
            </div>
          </div>
        </div>
      </Card> */}

      {/* Upload File */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-green-100 rounded-lg">
            <Upload className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Step 2: Upload Filled Template</h2>
            <p className="text-text-muted mt-1 mb-4">
              Fill in the template with your emissions data and upload it for validation. 
              The system will check each row and highlight any errors. You can then choose to save valid rows, download error report, or upload a corrected file.
            </p>
            <div className="flex items-center gap-4">
              <Label 
                htmlFor="file-upload" 
                className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {uploading ? 'Validating...' : 'Select File'}
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
                data-testid="file-upload-input"
              />
              <span className="text-sm text-text-muted">Accepts .xlsx files only</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Validation Results */}
      {validationResult && (
        <Card className="p-6" data-testid="validation-results">
          {/* Summary */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Validation Results</h2>
              <p className="text-text-muted">Upload ID: {validationResult.upload_id.slice(0, 8)}...</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-lg font-semibold text-green-600">
                  {validationResult.summary.valid_rows} Valid
                </span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-lg font-semibold text-red-500">
                  {validationResult.summary.invalid_rows} Errors
                </span>
              </div>
              <div className="text-text-muted">
                Total: {validationResult.summary.total_rows} rows
              </div>
            </div>
          </div>

          {/* Action Buttons - Different display for errors vs success */}
          <div className="mb-6 p-4 bg-stone-50 rounded-lg">
            {validationResult.summary.invalid_rows > 0 ? (
              /* When there are errors - show 3 options */
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <span className="font-medium text-amber-700">
                    {validationResult.summary.invalid_rows} row(s) have errors
                  </span>
                </div>
                
                {validationResult.summary.valid_rows > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-blue-700 mb-2">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">
                        {validationResult.summary.valid_rows} valid row(s) ready to save
                      </span>
                    </div>
                    <p className="text-sm text-blue-600">
                      Total emissions: {validationResult.total_emissions_tco2e?.toFixed(2) || 0} tCO2e
                    </p>
                  </div>
                )}
                
                <div className="border-t pt-4">
                  <p className="text-sm text-stone-600 mb-3 font-medium">Choose an action:</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {validationResult.summary.valid_rows > 0 && (
                      <Button
                        onClick={handleSaveValidRows}
                        disabled={savingRows}
                        data-testid="save-valid-rows-btn"
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {savingRows ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                        )}
                        Save {validationResult.summary.valid_rows} Valid Row(s)
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      onClick={handleDownloadErrorReport}
                      disabled={downloadingErrors}
                      data-testid="download-errors-btn"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                    >
                      {downloadingErrors ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileDown className="w-4 h-4 mr-2" />
                      )}
                      Download Error Report
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={handleDiscardAndUploadNew}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Upload New File
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* All rows valid - show save option */
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-green-600">
                  <CheckCircle2 className="w-6 h-6" />
                  <div>
                    <span className="font-semibold">
                      All {validationResult.summary.valid_rows} rows validated successfully!
                    </span>
                    <p className="text-sm text-green-500">
                      Total emissions: {validationResult.total_emissions_tco2e?.toFixed(2) || 0} tCO2e
                    </p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-sm text-stone-600 mb-3 font-medium">Choose an action:</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={handleSaveValidRows}
                      disabled={savingRows}
                      data-testid="save-all-rows-btn"
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {savingRows ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Save All {validationResult.summary.valid_rows} Rows
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={handleDiscardAndUploadNew}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Upload New File
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results Table */}
          <div className="border rounded-lg overflow-hidden">
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
                  {validationResult.rows.map((row, idx) => (
                    <React.Fragment key={`${row.sheet}-${row.row_number}-${idx}`}>
                      <TableRow 
                        className={`cursor-pointer ${
                          row.status === 'invalid' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-stone-50'
                        }`}
                        onClick={() => row.errors?.length > 0 && toggleRowExpansion(`${row.sheet}-${row.row_number}`)}
                      >
                        <TableCell className="font-mono text-xs font-medium text-blue-600">{row.sheet || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{row.row_number}</TableCell>
                        <TableCell>
                          {row.status === 'valid' ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Valid
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                              <XCircle className="w-3 h-3 mr-1" /> Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.row_data?.facility_name || '-'}
                        </TableCell>
                        <TableCell>{row.row_data?.reporting_period || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={row.sheet}>
                          {row.sheet || '-'}
                        </TableCell>
                        <TableCell>{row.row_data?.calculation_method || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={row.row_data?.activity}>
                          {row.row_data?.activity || '-'}
                        </TableCell>
                        <TableCell>
                          {row.errors?.length > 0 && (
                            expandedRows[row.row_number] ? (
                              <ChevronUp className="w-4 h-4 text-text-muted" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-text-muted" />
                            )
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {/* Error Details Expansion */}
                      {expandedRows[`${row.sheet}-${row.row_number}`] && row.errors?.length > 0 && (
                        <TableRow className="bg-red-50">
                          <TableCell colSpan={9} className="p-0">
                            <div className="p-4 space-y-2">
                              {row.errors.map((error, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded border border-red-200">
                                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs">
                                        {error.column}
                                      </Badge>
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
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      )}

      {/* No Results State */}
      {!validationResult && (
        <Card className="p-12 text-center">
          <FileSpreadsheet className="w-16 h-16 text-stone-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No file uploaded yet</h3>
          <p className="text-text-muted max-w-md mx-auto">
            Download the template, fill it with your emissions data, and upload it for validation.
            After validation, you can choose to save valid rows, download error report, or upload a new file.
          </p>
        </Card>
      )}
    </div>
  );
}
