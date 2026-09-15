import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, UploadCloud, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls';

export const UploadWorkspace = ({ files, onFilesChange, onProcess, processing, progress, onDownloadTemplate, downloadingTemplate }) => {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const addFiles = (incoming) => {
    const existing = new Map(files.map((file) => [`${file.name}-${file.size}`, file]));
    Array.from(incoming).forEach((file) => existing.set(`${file.name}-${file.size}`, file));
    onFilesChange(Array.from(existing.values()));
  };

  const removeFile = (target) => {
    onFilesChange(files.filter((file) => file !== target));
  };

  return (
    <section className="space-y-4" aria-labelledby="ocr-upload-heading" data-testid="ocr-upload-section">
      <div
        className={`border-2 border-dashed px-6 py-10 text-center transition-[border-color,background-color] duration-200 ${
          dragActive ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-slate-50/70 hover:border-slate-500'
        }`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files); }}
        data-testid="ocr-drop-zone"
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED}
          multiple
          onChange={(event) => addFiles(event.target.files)}
          data-testid="ocr-file-input"
        />
        <span className="mx-auto grid h-12 w-12 place-items-center bg-slate-900 text-white">
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id="ocr-upload-heading" className="mt-4 text-lg font-semibold text-slate-950">Add source documents</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          Invoices, utility bills, receipts, CSV ledgers and Excel workbooks up to 20MB each.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            data-testid="ocr-browse-files-button"
          >
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            Browse files
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDownloadTemplate}
            disabled={processing || downloadingTemplate}
            data-testid="ocr-download-template-upload-button"
          >
            {downloadingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
            Download template
          </Button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-3" data-testid="ocr-selected-files-list">
          <div className="grid gap-2 sm:grid-cols-2">
            {files.map((file) => {
              const spreadsheet = /\.(csv|xlsx|xls)$/i.test(file.name);
              const Icon = spreadsheet ? FileSpreadsheet : FileText;
              return (
                <div key={`${file.name}-${file.size}`} className="flex min-w-0 items-center gap-3 border border-slate-200 bg-white px-3 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900" data-testid={`ocr-selected-file-name-${file.name}`}>{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeFile(file)}
                    disabled={processing}
                    className="grid h-8 w-8 place-items-center text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                    data-testid={`ocr-remove-file-${file.name}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          {processing && (
            <div className="space-y-2" data-testid="ocr-processing-status">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing with AI</span>
                <span data-testid="ocr-upload-progress-value">{progress}%</span>
              </div>
              <Progress value={progress} data-testid="ocr-upload-progress" />
            </div>
          )}
          <Button
            type="button"
            onClick={onProcess}
            disabled={processing}
            className="w-full bg-emerald-700 hover:bg-emerald-800 sm:w-auto"
            data-testid="ocr-process-files-button"
          >
            {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            {processing ? 'Extracting activity data' : `Process ${files.length} file${files.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}
    </section>
  );
};
