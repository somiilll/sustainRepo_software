import React from 'react';
import { toast } from 'sonner';
import { getEvidenceFileId } from '../lib/draftEvidence';
import { openSecureFile } from '../lib/secureFileAccess';

/** "View" link for an evidence item: local drafts open their blob, saved files open through the authenticated file API. */
export default function EvidenceFileLink({ evidence, className = 'text-xs text-blue-600 hover:underline', testId, children = 'View' }) {
  if (evidence?.is_draft && evidence.preview_url) {
    return <a href={evidence.preview_url} target="_blank" rel="noopener noreferrer" className={className} data-testid={testId}>{children}</a>;
  }
  const fileId = getEvidenceFileId(evidence);
  if (!fileId) return null;
  return (
    <button type="button" className={className} data-testid={testId}
            onClick={() => openSecureFile(fileId).catch(() => toast.error('Unable to open evidence file'))}>
      {children}
    </button>
  );
}
