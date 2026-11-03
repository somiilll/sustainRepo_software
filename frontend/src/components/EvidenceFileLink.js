import React from 'react';
import { toast } from 'sonner';
import { getEvidenceFileId } from '../lib/draftEvidence';
import { downloadSecureFile, isPreviewableFile, openSecureFile } from '../lib/secureFileAccess';

const LINK = 'text-xs text-blue-600 hover:underline';

/** View (PDF / images only) and Download links for an evidence item; Word, Excel etc. are download-only. */
export default function EvidenceFileLink({ evidence, testId }) {
  const fileId = getEvidenceFileId(evidence);
  const local = evidence?.is_draft && evidence.preview_url;
  if (!local && !fileId) return null;
  const filename = evidence.filename || evidence.name || 'evidence';
  const fail = () => toast.error('Unable to open evidence file');
  const canView = isPreviewableFile({ ...evidence, name: filename });

  return (
    <span className="inline-flex items-center gap-3">
      {canView && (local
        ? <a href={evidence.preview_url} target="_blank" rel="noopener noreferrer" className={LINK} data-testid={testId}>View</a>
        : <button type="button" className={LINK} data-testid={testId} onClick={() => openSecureFile(fileId).catch(fail)}>View</button>)}
      {local
        ? <a href={evidence.preview_url} download={filename} className={LINK} data-testid={`${testId}-download`}>Download</a>
        : <button type="button" className={LINK} data-testid={`${testId}-download`} onClick={() => downloadSecureFile(fileId).catch(fail)}>Download</button>}
    </span>
  );
}
