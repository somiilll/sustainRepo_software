/**
 * Target API service — thin axios layer around /api/targets.
 *
 * All methods take `{ getAuthHeader }` so the caller can plug in either
 * the AuthContext header builder or any other token source (tests, etc).
 */
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export async function listTargets({ getAuthHeader }) {
  const res = await axios.get(`${API}/targets`, { headers: getAuthHeader() });
  return res.data || [];
}

export async function createTarget({ getAuthHeader, payload }) {
  const res = await axios.post(`${API}/targets`, payload, { headers: getAuthHeader() });
  return res.data;
}

export async function updateTarget({ getAuthHeader, id, payload }) {
  const res = await axios.put(`${API}/targets/${id}`, payload, { headers: getAuthHeader() });
  return res.data;
}

export async function deleteTarget({ getAuthHeader, id }) {
  const res = await axios.delete(`${API}/targets/${id}`, { headers: getAuthHeader() });
  return res.data;
}
