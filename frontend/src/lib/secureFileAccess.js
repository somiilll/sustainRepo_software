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

export const openSecureFile = async (fileId, mode = 'view') => {
  const popup = window.open('', '_blank', 'noopener');
  try {
    const url = await getSecureFileUrl(fileId, mode);
    if (popup) {
      popup.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (error) {
    popup?.close();
    throw error;
  }
};

export const downloadSecureFile = (fileId) => openSecureFile(fileId, 'download');