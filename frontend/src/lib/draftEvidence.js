import axios from 'axios';

export const getEvidenceFileId = (evidence) => (
  evidence?.file_id
  || (!evidence?.is_draft ? evidence?.id : null)
  || evidence?.url?.match(/\/api\/files\/([a-f0-9-]+)/i)?.[1]
  || evidence?.upload_url?.match(/\/api\/files\/([a-f0-9-]+)/i)?.[1]
);

export const createDraftEvidence = (file, extra = {}) => ({
  id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  name: file.name,
  filename: file.name,
  file_type: file.type?.split('/')[1] || file.name.split('.').pop() || 'unknown',
  file_size: file.size,
  size: file.size,
  content_type: file.type,
  file,
  is_draft: true,
  preview_url: URL.createObjectURL(file),
  ...extra,
});

export const persistedEvidence = (items = []) => items.filter((item) => !item?.is_draft);
export const draftEvidence = (items = []) => items.filter((item) => item?.is_draft && item?.file);

export const toEvidencePayload = (item) => {
  const { file, is_draft, preview_url, ...payload } = item;
  return payload;
};

export const revokeDraftEvidence = (item) => {
  if (item?.is_draft && item?.preview_url) URL.revokeObjectURL(item.preview_url);
};

export const revokeDraftEvidences = (items = []) => items.forEach(revokeDraftEvidence);

export async function uploadDraftEvidences({ items, uploadUrl, headers, mapUploaded }) {
  const uploaded = [];
  const failed = [];

  for (const item of draftEvidence(items)) {
    const body = new FormData();
    body.append('file', item.file);
    try {
      const response = await axios.post(uploadUrl, body, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      uploaded.push(mapUploaded(response.data, item));
    } catch (error) {
      failed.push({ item, error });
    }
  }

  return { uploaded, failed };
}

export async function deleteEvidenceFiles(fileIds, apiBaseUrl, headers) {
  const ids = [...new Set([...fileIds].filter(Boolean))];
  const results = await Promise.allSettled(
    ids.map((fileId) => axios.delete(`${apiBaseUrl}/files/${fileId}`, { headers }))
  );
  return results.filter((result) => result.status === 'rejected').length;
}