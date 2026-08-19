/**
 * Hydrates the edit dialog from a persisted record.
 *
 * UI state (dialog/loading/audit state) remains at the page boundary. All
 * editable record values move together through the shared EmissionDraft.
 */
import axios from 'axios';
import { emissionRecordToDraft } from '../../../modules/ghg/emissions/shared/domain';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

  if (emission.evidence_url) {
    const existingUrls = emission.evidence_url.split(',').filter((url) => url.trim());
    const evidencesWithFilenames = await Promise.all(
      existingUrls.map(async (url, idx) => {
        const trimmedUrl = url.trim();
        const fileIdMatch = trimmedUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
        if (!fileIdMatch) return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };

        try {
          const response = await axios.get(`${API}/files/${fileIdMatch[1]}/info`);
          return {
            url: trimmedUrl,
            filename: response.data.filename || `Evidence ${idx + 1}`,
            file_id: fileIdMatch[1],
          };
        } catch (error) {
          console.error('Failed to fetch file info:', error);
          return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };
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