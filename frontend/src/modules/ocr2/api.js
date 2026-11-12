import axios from 'axios';

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api/ocr-invoice`;

export const makeOcrApi = (headers) => {
  const get = (path, config = {}) => axios.get(`${BASE}${path}`, { headers, ...config }).then((r) => r.data);
  const send = (method, path, data) => axios({ method, url: `${BASE}${path}`, data, headers }).then((r) => r.data);
  return {
    meta: () => get('/meta'),
    usage: (days = 30) => get(`/usage?days=${days}`),
    grant: (credits, note) => send('post', '/usage/grant', { credits, note }),
    jobs: () => get('/jobs'),
    rows: (id) => get(`/jobs/${id}/rows`),
    audit: (id, itemId) => get(`/jobs/${id}/audit`, { params: { item_id: itemId } }),
    preview: (files) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      return axios.post(`${BASE}/preview`, fd, { headers }).then((r) => r.data);
    },
    start: (files, mode, choices, force) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('mode', mode);
      if (force) fd.append('force', 'true');
      if (choices && Object.keys(choices).length) fd.append('facilities', JSON.stringify(choices));
      return axios.post(`${BASE}/jobs`, fd, { headers }).then((r) => r.data);
    },
    cancel: (id) => send('post', `/jobs/${id}/cancel`),
    retry: (id) => send('post', `/jobs/${id}/retry`),
    remove: (id) => send('delete', `/jobs/${id}`),
    review: (id, row_ids, state) => send('post', `/jobs/${id}/review`, { row_ids, state }),
    edit: (id, itemId, body) => send('patch', `/jobs/${id}/items/${itemId}`, body),
    page: (id, file, page, q) => axios.get(`${BASE}/jobs/${id}/page`, { headers, params: { file, page, q }, responseType: 'blob' }),
    factors: (id, rowId, q) => get(`/jobs/${id}/rows/${encodeURIComponent(rowId)}/factors`, { params: { q } }),
    chooseFactor: (id, rowId, body) => send('post', `/jobs/${id}/rows/${encodeURIComponent(rowId)}/factor`, body),
    editConfig: (id, rowId) => get(`/jobs/${id}/rows/${encodeURIComponent(rowId)}/edit-config`),
    factorOptions: (id, rowId, params) => get(`/jobs/${id}/rows/${encodeURIComponent(rowId)}/factor-options`, { params }),
    factorPrefill: (id, rowId, params) => get(`/jobs/${id}/rows/${encodeURIComponent(rowId)}/factor-prefill`, { params }),
    formConfig: (categoryId, scope) => axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/calc-engine/form-config/${categoryId}`, { headers, params: { scope } }).then((r) => r.data),
    saveToGhg: (id, row_ids, pending_only = false) => send('post', `/jobs/${id}/save`, { row_ids, pending_only }),
    memory: () => get('/memory'),
    forget: (key) => send('post', '/memory/forget', { key }),
    change: (key, activity_id) => send('post', '/memory/change', { key, activity_id }),
    share: (key) => send('post', '/memory/share', { key }),
    clearMemory: () => send('delete', '/memory'),
  };
};

export const errText = (e, fallback = 'Something went wrong') => {
  const d = e?.response?.data;
  if (d instanceof Blob) return fallback;
  return d?.detail || e?.message || fallback;
};
