import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getUploadedFileId = (value) => {
  const source = typeof value === 'string' ? value : value?.file_id || value?.url;
  return source?.match(/\/api\/files\/([a-f0-9-]+)/i)?.[1] || null;
};

export const getSecureFileInfo = async (fileId) => {
  const response = await axios.get(`${API}/files/${fileId}/info`, { headers: authHeaders() });
  return response.data;
};

export const getSecureFileUrl = async (fileId, mode = 'view') => {
  const response = await axios.get(`${API}/files/${fileId}/${mode}`, {
    headers: authHeaders(),
    params: { resolve: true },
  });
  return response.data.url;
};

const isInlineViewable = (contentType) => contentType?.startsWith('image/') || contentType === 'application/pdf';

export const isPreviewableFile = (file) => {
  const value = typeof file === 'string' ? { name: file } : (file || {});
  if (value.content_type || value.type) {
    return isInlineViewable(value.content_type || value.type);
  }
  const filename = value.original_filename || value.filename || value.name || '';
  return /\.(pdf|png|jpe?g|gif|webp|heic|heif)$/i.test(filename);
};

export const downloadSecureFile = async (fileId) => {
  const url = await getSecureFileUrl(fileId, 'download');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

export const openSecureFile = async (fileId, mode = 'view') => {
  const popup = window.open('about:blank', '_blank');
  try {
    if (mode === 'view') {
      const fileInfo = await getSecureFileInfo(fileId);
      if (!isInlineViewable(fileInfo.content_type)) {
        popup?.close();
        await downloadSecureFile(fileId);
        return;
      }
    }
    const url = await getSecureFileUrl(fileId, mode);
    if (popup) {
      popup.opener = null;
      popup.location.replace(url);
    } else {
      window.location.assign(url);
    }
  } catch (error) {
    popup?.close();
    throw error;
  }
};