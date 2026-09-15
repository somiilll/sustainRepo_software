import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

export const getOcrConfiguration = (headers) =>
  axios.get(`${API}/api/ocr-invoice/configuration`, { headers });

export const getOcrFactorOptions = (scope, category, method, headers) =>
  axios.get(`${API}/api/ocr-invoice/factor-options`, {
    headers,
    params: { scope, category, method },
  });

export const downloadOcrTemplate = (headers) =>
  axios.get(`${API}/api/ocr-invoice/template/download`, {
    headers,
    responseType: 'blob',
  });

export const getOcrUpload = (uploadId, headers) =>
  axios.get(`${API}/api/ocr-invoice/uploads/${uploadId}`, { headers });

export const uploadOcrFiles = (files, mode, headers, onUploadProgress) => {
  const body = new FormData();
  files.forEach((file) => body.append('files', file));
  body.append('mode', mode);
  return axios.post(`${API}/api/ocr-invoice/upload`, body, {
    headers: { ...headers, 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });
};

export const updateOcrLineItem = (itemId, values, headers) =>
  axios.put(`${API}/api/ocr-invoice/line-items/${itemId}`, values, { headers });

export const assignOcrUploadFacilities = (uploadId, assignments, headers) =>
  axios.put(`${API}/api/ocr-invoice/uploads/${uploadId}/facility-assignments`, { assignments }, { headers });

export const acceptOcrLineItem = (itemId, headers) =>
  axios.post(`${API}/api/ocr-invoice/line-items/${itemId}/accept`, {}, { headers });

export const saveOcrLineItemToGhg = (itemId, headers) =>
  axios.post(`${API}/api/ocr-invoice/line-items/${itemId}/save-ghg`, {}, { headers });

export const rejectOcrLineItem = (itemId, headers) =>
  axios.post(`${API}/api/ocr-invoice/line-items/${itemId}/reject`, {}, { headers });

export const deleteOcrUpload = (uploadId, headers) =>
  axios.delete(`${API}/api/ocr-invoice/uploads/${uploadId}`, { headers });

export const loadOcrPreview = (uploadId, fileIndex, headers) =>
  axios.get(`${API}/api/ocr-invoice/uploads/${uploadId}/files/${fileIndex}/preview`, {
    headers,
    responseType: 'blob',
  });

export const downloadOcrCsv = (uploadId, headers) =>
  axios.get(`${API}/api/ocr-invoice/uploads/${uploadId}/export`, {
    headers,
    responseType: 'blob',
  });
