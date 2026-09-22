import React from 'react';
import { FileSpreadsheet, FileText, Loader2, Maximize2 } from 'lucide-react';
import { Button } from '../../components/ui/button';

export const DocumentPreview = ({ file, previewUrl, loading, onLoadPreview }) => {
  if (!file) {
    return (
      <div className="grid min-h-72 place-items-center border border-slate-200 bg-slate-50 p-8 text-center" data-testid="ocr-preview-empty">
        <div>
          <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-700">Select a source document</p>
        </div>
      </div>
    );
  }

  if (!file.preview_supported) {
    return (
      <div className="grid min-h-72 place-items-center border border-slate-200 bg-slate-50 p-8 text-center" data-testid="ocr-spreadsheet-preview">
        <div>
          <FileSpreadsheet className="mx-auto h-9 w-9 text-emerald-700" aria-hidden="true" />
          <p className="mt-3 break-all text-sm font-semibold text-slate-900">{file.filename}</p>
          <p className="mt-1 text-xs text-slate-500">Spreadsheet rows are shown in the review table.</p>
        </div>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="grid min-h-72 place-items-center border border-slate-200 bg-slate-50 p-8 text-center" data-testid="ocr-preview-load-panel">
        <Button type="button" variant="outline" onClick={onLoadPreview} disabled={loading} data-testid="ocr-load-preview-button">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Maximize2 className="mr-2 h-4 w-4" />}
          Load secure preview
        </Button>
      </div>
    );
  }

  const isPdf = file.content_type === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf');
  return (
    <div className="min-h-72 overflow-hidden border border-slate-200 bg-slate-100" data-testid="ocr-document-preview">
      {isPdf ? (
        <iframe src={previewUrl} title={`Preview of ${file.filename}`} className="h-[34rem] w-full" data-testid="ocr-pdf-preview-frame" />
      ) : (
        <img src={previewUrl} alt={`Preview of ${file.filename}`} className="max-h-[34rem] w-full object-contain" data-testid="ocr-image-preview" />
      )}
    </div>
  );
};
