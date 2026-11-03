import { getStoredAccessToken } from "../../../lib/authSession";

export const CBAM_API = `${process.env.REACT_APP_BACKEND_URL}/api/cbam`;

let tokenProvider = null;

export function setTokenProvider(fn) {
  tokenProvider = fn;
}

async function token() {
  return tokenProvider ? await tokenProvider() : getStoredAccessToken();
}

export class ApiError extends Error {}

async function req(method, path, body, isForm = false) {
  const headers = { Authorization: `Bearer ${await token()}` };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const r = await fetch(`${CBAM_API}${path}`, {
    method,
    headers,
    body: body ? (isForm ? (body ) : JSON.stringify(body)) : undefined,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).detail ?? msg;
    } catch {}
    throw new ApiError(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}

export const api = {
  get: (p) => req("GET", p),
  post: (p, b) => req("POST", p, b),
  put: (p, b) => req("PUT", p, b),
  del: (p) => req("DELETE", p),
  upload: (p, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return req("POST", p, fd, true);
  },
  form: (p, fd) => req("POST", p, fd, true),
  async download(path, filename) {
    const r = await fetch(`${CBAM_API}${path}`, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!r.ok) throw new ApiError(`Download failed: ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  },
  // Public supplier portal (no SustainRepo login)
  publicGet: async ( p) => {
    const r = await fetch(`${CBAM_API}/public${p}`);
    if (!r.ok) throw new ApiError((await r.json()).detail ?? r.statusText);
    return r.json();
  },
  publicForm: async ( p, fd) => {
    const r = await fetch(`${CBAM_API}/public${p}`, { method: "POST", body: fd });
    if (!r.ok) throw new ApiError((await r.json()).detail ?? r.statusText);
    return r.json();
  },
  publicPost: async ( p, b) => {
    const r = await fetch(`${CBAM_API}/public${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    if (!r.ok) throw new ApiError((await r.json()).detail ?? r.statusText);
    return r.json();
  },
};

export const fmt = {
  n: (v, d = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? "–" : v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }),
  eur: (v, d = 0) =>
    v === null || v === undefined ? "–" : "€" + v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }),
  pct: (v, d = 1) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(d)}%`),
  date: (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "–"),
  dateTime: (s) =>
    s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") : "–",
};
