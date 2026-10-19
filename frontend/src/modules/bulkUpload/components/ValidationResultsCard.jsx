/**
 * ValidationResultsCard — summary header + action buttons.
 * Hides save buttons when validationResult has no valid rows; offers
 * download-errors and upload-new options instead.
 */
import React from 'react';
import { Button } from '../../../components/ui/button';
import {
  CheckCircle2, XCircle, AlertTriangle, FileDown, Loader2, RefreshCw,
} from 'lucide-react';
import { formatEmissions, shortUploadId } from '../shared/normalizers';

export default function ValidationResultsCard({
  validationResult, savingRows, downloadingErrors,
  onSave, onDownloadErrors, onDiscard,
}) {
  if (!validationResult) return null;
  const { summary, total_emissions_tco2e, upload_id, preview } = validationResult;
  const hasErrors = summary.invalid_rows > 0;

  return (
    <>
      {/* Summary Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Validation Results</h2>
          <p className="text-text-muted">Upload ID: {shortUploadId(upload_id)}</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-lg font-semibold text-green-600">{summary.valid_rows} Valid</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-lg font-semibold text-red-500">{summary.invalid_rows} Errors</span>
          </div>
          <div className="text-text-muted">Total: {summary.total_rows} rows</div>
        </div>
      </div>

      {/* Preview Breakdown */}
      {preview && preview.total_valid_records > 0 && (
        <div className="mb-6 border border-stone-200 rounded-lg overflow-hidden" data-testid="upload-preview-panel">
          <div className="bg-stone-100 px-4 py-2 border-b border-stone-200">
            <h3 className="text-sm font-semibold text-stone-700">Upload Preview</h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-stone-500">Valid Records</p>
              <p className="font-semibold text-stone-800">{preview.total_valid_records}</p>
            </div>
            <div>
              <p className="text-stone-500">Standard Fuel</p>
              <p className="font-semibold text-stone-800">{preview.standard_fuel_records}</p>
            </div>
            <div>
              <p className="text-stone-500">Custom Fuel</p>
              <p className="font-semibold text-amber-700">{preview.custom_fuel_records}</p>
            </div>
            <div>
              <p className="text-stone-500">Total CO2e</p>
              <p className="font-semibold text-stone-800">{formatEmissions(preview.total_co2e_tco2e)} tCO2e</p>
            </div>
          </div>
          {/* By scope breakdown */}
          {preview.by_scope && Object.keys(preview.by_scope).length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {Object.entries(preview.by_scope).map(([scope, count]) => (
                <span key={scope} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {scope.replace('scope', 'Scope ')}: {count}
                </span>
              ))}
            </div>
          )}
          {/* Custom fuel methodology breakdown */}
          {preview.by_methodology && Object.keys(preview.by_methodology).length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {Object.entries(preview.by_methodology).map(([method, count]) => (
                <span key={method} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  {method.replace(/_/g, ' ')}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Panel */}
      <div className="mb-6 p-4 bg-stone-50 rounded-lg" data-testid="validation-action-panel">
        {hasErrors ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span className="font-medium text-amber-700">{summary.invalid_rows} row(s) have errors</span>
            </div>

            {summary.valid_rows > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-blue-700 mb-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">{summary.valid_rows} valid row(s) ready to save</span>
                </div>
                <p className="text-sm text-blue-600">Total emissions: {formatEmissions(total_emissions_tco2e)} tCO2e</p>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm text-stone-600 mb-3 font-medium">Choose an action:</p>
              <div className="flex flex-wrap items-center gap-3">
                {summary.valid_rows > 0 && (
                  <Button onClick={onSave} disabled={savingRows} data-testid="save-valid-rows-btn" className="bg-green-600 hover:bg-green-700 text-white">
                    {savingRows ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Save {summary.valid_rows} Valid Row(s)
                  </Button>
                )}
                <Button variant="outline" onClick={onDownloadErrors} disabled={downloadingErrors} data-testid="download-errors-btn" className="border-red-200 text-red-700 hover:bg-red-50">
                  {downloadingErrors ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                  Download Error Report
                </Button>
                <Button variant="outline" onClick={onDiscard}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Upload New File
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircle2 className="w-6 h-6" />
              <div>
                <span className="font-semibold">All {summary.valid_rows} rows validated successfully!</span>
                <p className="text-sm text-green-500">Total emissions: {formatEmissions(total_emissions_tco2e)} tCO2e</p>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-stone-600 mb-3 font-medium">Choose an action:</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={onSave} disabled={savingRows} data-testid="save-all-rows-btn" className="bg-green-600 hover:bg-green-700 text-white">
                  {savingRows ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Save All {summary.valid_rows} Rows
                </Button>
                <Button variant="outline" onClick={onDiscard}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Upload New File
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
