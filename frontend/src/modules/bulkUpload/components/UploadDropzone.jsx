/**
 * UploadDropzone — file selector + label + helper text.
 * Accepts xlsx only. Disabled when uploading or module is notImplemented.
 */
import React from 'react';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Upload, Loader2 } from 'lucide-react';

export default function UploadDropzone({ activeModule, uploading, onUpload }) {
  const disabled = uploading || activeModule?.notImplemented;
  return (
    <Card className="p-6" data-testid="upload-dropzone">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-green-100 rounded-lg">
          <Upload className="w-6 h-6 text-green-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-text-primary">
            Upload {activeModule?.label} Template
          </h2>
          <p className="text-text-muted mt-1 mb-4">
            {activeModule?.notImplemented
              ? `${activeModule.label} bulk upload is coming soon. Backend endpoints are being prepared — check back shortly.`
              : 'Fill in the template with your emissions data and upload it for validation. The system will check each row and highlight any errors. You can then choose to save valid rows, download error report, or upload a corrected file.'}
          </p>
          <div className="flex items-center gap-4">
            <Label
              htmlFor="file-upload"
              className={`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-10 px-4 py-2 ${
                disabled ? 'bg-stone-300 text-stone-500 cursor-not-allowed pointer-events-none' : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
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
              onChange={onUpload}
              disabled={disabled}
              data-testid="file-upload-input"
            />
            <span className="text-sm text-text-muted">Accepts .xlsx files only</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
