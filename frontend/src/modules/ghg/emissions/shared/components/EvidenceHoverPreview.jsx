import React from 'react';
import { FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { downloadSecureFile, getUploadedFileId, isPreviewableFile, openSecureFile } from '../../../../../lib/secureFileAccess';

const formatEvidenceSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getEvidenceMetadata = (evidence) => {
  const size = formatEvidenceSize(evidence?.size || evidence?.file?.size);
  const timestamp = evidence?.file?.lastModified || evidence?.uploaded_at || evidence?.created_at;
  const date = timestamp ? new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  return [size, date].filter(Boolean).join(' · ') || (evidence?.is_draft ? 'Ready to upload' : 'Attached evidence');
};

export const EvidenceHoverPreview = ({ evidences = [], onRemove, disabled = false, testIdPrefix }) => {
  if (evidences.length === 0) return <div className="px-3 py-2.5 text-xs text-stone-600">Upload evidence (PDF, Excel, Word)</div>;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2.5">
        <span className="text-sm font-semibold text-stone-900">Evidence</span>
        <span className="text-xs text-stone-500" data-testid={`${testIdPrefix}-count`}>{evidences.length} file{evidences.length > 1 ? 's' : ''} attached</span>
      </div>
      <div className="max-h-52 overflow-y-auto p-1.5">
        {evidences.map((evidence, index) => {
          const fileId = evidence?.file_id || getUploadedFileId(evidence);
          const canPreview = isPreviewableFile(evidence);
          const directUrl = evidence?.url || '#';
          const filename = evidence?.filename || `Evidence ${index + 1}`;
          const openEvidence = (event) => {
            if (!fileId) return;
            event.preventDefault();
            void openSecureFile(fileId).catch(() => toast.error('Unable to open evidence file'));
          };
          return (
            <div key={`${fileId || evidence?.url || filename}-${index}`} className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-stone-50" data-testid={`${testIdPrefix}-item-${index}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><FileText className="h-4 w-4" aria-hidden="true" /></div>
              <div className="min-w-0 flex-1">
                {evidence?.url ? canPreview ? <a href={directUrl} target="_blank" rel="noopener noreferrer" onClick={openEvidence} className="block truncate text-sm font-medium text-stone-900 hover:text-emerald-800" title={filename} data-testid={`${testIdPrefix}-view-${index}`}>{filename}</a> : <button type="button" onClick={() => { if (fileId) void downloadSecureFile(fileId).catch(() => toast.error('Unable to download evidence file')); }} className="block w-full truncate text-left text-sm font-medium text-stone-900 hover:text-emerald-800" title={`Download ${filename}`} data-testid={`${testIdPrefix}-download-${index}`}>{filename}</button> : <p className="truncate text-sm font-medium text-stone-900" title={filename}>{filename}</p>}
                <p className="mt-0.5 text-xs text-stone-500" data-testid={`${testIdPrefix}-metadata-${index}`}>{getEvidenceMetadata(evidence)}</p>
              </div>
              {onRemove && <button type="button" onClick={(event) => { event.stopPropagation(); Promise.resolve(onRemove(index, evidence)).catch(() => toast.error('Unable to remove evidence file')); }} disabled={disabled} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50" title="Remove" aria-label={`Remove ${filename}`} data-testid={`${testIdPrefix}-remove-${index}`}><X className="h-4 w-4" /></button>}
            </div>
          );
        })}
      </div>
      <div className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">Click the evidence icon to add more files.</div>
    </div>
  );
};