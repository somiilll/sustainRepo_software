/**
 * Approval API service — thin wrapper over /api/approvals/*
 * Centralizes axios calls so components never construct URLs by hand.
 */
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const authHeader = (getAuthHeader) => (getAuthHeader ? getAuthHeader() : {});

export async function listApprovals({ status, getAuthHeader }) {
  const params = status ? { status } : {};
  const { data } = await axios.get(`${API}/approvals`, {
    params,
    headers: authHeader(getAuthHeader),
  });
  return data || [];
}

export async function getPendingCount({ getAuthHeader }) {
  const { data } = await axios.get(`${API}/approvals/count`, {
    headers: authHeader(getAuthHeader),
  });
  return data?.pending ?? 0;
}

export async function decideApproval({ requestId, action, comment, getAuthHeader }) {
  const { data } = await axios.post(
    `${API}/approvals/${requestId}/decide`,
    { action, comment },
    { headers: authHeader(getAuthHeader) },
  );
  return data;
}
