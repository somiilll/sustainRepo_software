import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, UploadCloud, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { OcrBatchQueue } from './OcrBatchQueue';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.avif,.csv,.xlsx,.xls';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const fileKey = (file) => `${file.name}-${file.size}`;
const formatFileSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const formatAddedAt = (timestamp) => new Date(timestamp).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const validationError = (file) => {
  const extension = `.${file.name.split('.').pop().toLowerCase()}`;
  if (!ACCEPTED.split(',').includes(extension)) return 'Unsupported file type';
  if (file.size > MAX_FILE_BYTES) return 'File exceeds the 20MB limit';
  return '';
};

export const UploadWorkspace = ({ files, fileErrors = {}, onFilesChange, onProcess, processing, progress, onDownloadTemplate, downloadingTemplate, queue, onCancel, canCancelProcessing, cancelling }) => {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileAddedAt, setFileAddedAt] = useState({});
  const [validationErrors, setValidationErrors] = useState({});

  const addFiles = (incoming) => {
    const addedAt = Date.now();
    const incomingFiles = Array.from(incoming);
    const existing = new Map(files.map((file) => [fileKey(file), file]));
    incomingFiles.forEach((file) => existing.set(fileKey(file), file));
    setFileAddedAt((current) => {
      const next = { ...current };
      incomingFiles.forEach((file) => {
        if (!next[fileKey(file)]) next[fileKey(file)] = addedAt;
      });
      return next;
    });
    setValidationErrors((current) => {
      const next = { ...current };
      incomingFiles.forEach((file) => {
        const error = validationError(file);
        if (error) next[fileKey(file)] = error;
        else delete next[fileKey(file)];
      });
      return next;
    });
    onFilesChange(Array.from(existing.values()));
  };

  const removeFile = (target) => {
    setFileAddedAt((current) => {
      const next = { ...current };
      delete next[fileKey(target)];
      return next;
    });
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[fileKey(target)];
      return next;
    });
    onFilesChange(files.filter((file) => file !== target));
  };

  const hasFileErrors = files.some((file) => validationErrors[fileKey(file)] || fileErrors[fileKey(file)]);

  return (
    <section className="space-y-4" aria-labelledby="ocr-upload-heading" data-testid="ocr-upload-section">
      <div
        className={`flex w-full flex-col items-center justify-center px-6 text-center transition-[background-color] duration-200 ${
          files.length ? 'py-10' : 'min-h-[calc(100vh-14rem)] py-10'
        } ${
          dragActive ? 'bg-emerald-50' : 'bg-transparent'
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
        {files.length === 0 ? <>
          <span className="grid h-12 w-12 place-items-center bg-slate-900 text-white">
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="ocr-upload-heading" className="mt-4 text-lg font-semibold text-slate-950">Add source documents</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
            Invoices, utility bills, receipts, AVIF images, CSV ledgers and Excel workbooks up to 20MB each.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={processing} data-testid="ocr-browse-files-button">
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />Upload Files
            </Button>
            <Button type="button" variant="outline" onClick={onDownloadTemplate} disabled={processing || downloadingTemplate} data-testid="ocr-download-template-upload-button">
              {downloadingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}Download template
            </Button>
          </div>
        </> : <div className="w-full max-w-4xl space-y-4 text-left" data-testid="ocr-selected-files-list">
          <h2 id="ocr-upload-heading" className="sr-only">Selected source documents</h2>
          <div className="max-h-80 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white px-4" data-testid="ocr-selected-files-scroll-container">
            {files.map((file) => {
              const spreadsheet = /\.(csv|xlsx|xls)$/i.test(file.name);
              const Icon = spreadsheet ? FileSpreadsheet : FileText;
              const addedAt = fileAddedAt[fileKey(file)];
              const error = validationErrors[fileKey(file)] || fileErrors[fileKey(file)];
              return (
                <div key={fileKey(file)} className="flex min-w-0 items-center gap-3 py-4" data-testid={`ocr-selected-file-${file.name}`}>
                  <Icon className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <p className="max-w-full truncate font-medium text-slate-900" data-testid={`ocr-selected-file-name-${file.name}`}>{file.name}</p>
                      <span data-testid={`ocr-selected-file-size-${file.name}`}>Size {formatFileSize(file.size)}</span>
                      {addedAt && <time dateTime={new Date(addedAt).toISOString()} className="text-slate-500" data-testid={`ocr-selected-file-uploaded-at-${file.name}`}>Uploaded at {formatAddedAt(addedAt)}</time>}
                      {error && <span className="font-medium text-red-700" role="alert" data-testid={`ocr-selected-file-error-${file.name}`}>{error}</span>}
                    </div>
                  </div>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(file)} disabled={processing} className="grid h-8 w-8 place-items-center text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700" data-testid={`ocr-remove-file-${file.name}`}>
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
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={onProcess} disabled={processing || hasFileErrors} className="bg-emerald-700 hover:bg-emerald-800" data-testid="ocr-process-files-button">
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {processing ? 'Extracting activity data' : `Process ${files.length} file${files.length === 1 ? '' : 's'}`}
            </Button>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={processing} data-testid="ocr-upload-more-files-button">
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />Upload More Files
            </Button>
          </div>
        </div>}
      </div>
      <OcrBatchQueue queue={queue} onCancel={onCancel} canCancelProcessing={canCancelProcessing} cancelling={cancelling} />
    </section>
  );
};
