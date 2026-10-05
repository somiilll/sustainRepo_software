/**
 * Hydrates the edit dialog from a persisted record.
 *
 * UI state (dialog/loading/audit state) remains at the page boundary. All
 * editable record values move together through the shared EmissionDraft.
 */
import { emissionRecordToDraft } from '../../../modules/ghg/emissions/shared/domain';
import { getSecureFileInfo } from '../../../lib/secureFileAccess';

export async function editEmissionDispatch(emission, ctx) {
  const {
    scope3EFData,
    fugitiveEmissionsData,
    fuelDatabase,
    setEditDraft,
    setEditingEmissionId,
    setEmissionAuditLog,
    setIsEditLoading,
    setDialogOpen,
    setIsFormDirty,
    setEditingEmission,
    activeEditIdRef,
  } = ctx;

  activeEditIdRef.current = emission.id;

  const draft = emissionRecordToDraft(emission, {
    fuelDatabase,
    scope3EFData,
    fugitiveEmissionsData,
  });

  setIsFormDirty(false);
  setEditingEmission(emission);
  setEditDraft(draft);

  if (emission.evidence_url || emission.evidence_files?.length) {
    const persistedEvidences = Array.isArray(emission.evidence_files) ? emission.evidence_files : [];
    const persistedByUrl = new Map(persistedEvidences.filter((evidence) => evidence?.url).map((evidence) => [evidence.url, evidence]));
    const existingUrls = (emission.evidence_url || '').split(',').filter((url) => url.trim());
    const allEvidences = [
      ...persistedEvidences,
      ...existingUrls.filter((url) => !persistedByUrl.has(url)).map((url) => ({ url })),
    ];
    const evidencesWithFilenames = await Promise.all(
      allEvidences.map(async (evidence, idx) => {
        const trimmedUrl = evidence.url.trim();
        const fileIdMatch = trimmedUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
        if (!fileIdMatch) return { ...evidence, url: trimmedUrl, filename: evidence.filename || `Evidence ${idx + 1}` };

        try {
          const fileInfo = await getSecureFileInfo(fileIdMatch[1]);
          return {
            ...evidence,
            url: trimmedUrl,
            filename: evidence.filename || fileInfo.filename || `Evidence ${idx + 1}`,
            file_id: fileIdMatch[1],
          };
        } catch (error) {
          console.error('Failed to fetch file info:', error);
          return { ...evidence, url: trimmedUrl, filename: evidence.filename || `Evidence ${idx + 1}` };
        }
      }),
    );
    if (activeEditIdRef.current !== emission.id) return;
    setEditDraft((currentDraft) => ({
      ...currentDraft,
      existingEvidences: evidencesWithFilenames,
    }));
  }

  setEmissionAuditLog([]);
  setEditingEmissionId(emission.id);
  setIsEditLoading(true);
  setDialogOpen(true);

  await new Promise((resolve) => setTimeout(resolve, 50));
  if (activeEditIdRef.current !== emission.id) return;
  setIsEditLoading(false);
}

export default editEmissionDispatch;