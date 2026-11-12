export const STATUS_LABEL = { ready: 'Ready', check: 'Check', input: 'Needs input', unreadable: "Couldn't read", approved: 'Approved', rejected: 'Rejected' };
export const STATUS_ORDER = ['approved', 'ready', 'check', 'input', 'unreadable', 'rejected'];
export const STATUS_CLASS = {
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ready: 'bg-green-50 text-green-700 border-green-200',
  needs_attention: 'bg-amber-50 text-amber-800 border-amber-200',
  check: 'bg-amber-50 text-amber-800 border-amber-200',
  input: 'bg-rose-50 text-rose-700 border-rose-200',
  unreadable: 'bg-stone-100 text-stone-700 border-stone-300',
  rejected: 'bg-stone-100 text-stone-500 border-stone-200',
};
export const STATUS_BAR = { approved: '#059669', ready: '#4ade80', check: '#f59e0b', input: '#f43f5e', unreadable: '#78716c', rejected: '#a8a29e' };
export const SCOPE_LABEL = { scope_1: 'Scope 1', scope_2: 'Scope 2', scope_3: 'Scope 3', biogenic: 'Biogenic', water: 'Water', waste: 'Waste', none: 'Other' };
export const SCOPE_COLOR = { scope_1: '#10b981', scope_2: '#3b82f6', scope_3: '#8b5cf6', biogenic: '#f59e0b', water: '#0ea5e9', waste: '#a16207', none: '#94a3b8' };
export const SOURCE_LABEL = { memory: 'Remembered', user: 'You', rules: 'Rules', jev: 'Jev', openai_decisions: 'OpenAI', claude: 'Claude', 'rules+jev': 'Rules + Jev', 'rules+claude': 'Rules + Claude', 'rules+openai_decisions': 'Rules + OpenAI' };
export const TRUST_CLASS = { high: 'bg-emerald-50 text-emerald-700 border-emerald-200', check: 'bg-amber-50 text-amber-800 border-amber-200', needs_you: 'bg-rose-50 text-rose-700 border-rose-200' };
export const PENDING = ['input', 'check', 'unreadable', 'ready'];

export const fmtN = (n, d = 2) => (n == null ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const fmtCr = (n) => (n == null ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 }));
export const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
export const ago = (t) => {
  const s = Date.now() / 1000 - t;
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : fmtDate(t);
};
export const fmtWait = (s) => (s < 60 ? `${Math.max(5, Math.round(s / 5) * 5)} s` : `${Math.round(s / 60)} min`);
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const fileKind = (name) => {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'tif', 'tiff', 'gif'].includes(e)) return 'img';
  if (['xlsx', 'xlsm', 'xls', 'csv'].includes(e)) return 'sheet';
  return 'other';
};
export const rstate = (r) => {
  const s = (r.review && r.review.state) || r.review_status;
  return s === 'approved' || s === 'rejected' ? s : r.shown || (s === 'ready' ? 'ready' : 'input');
};
export const scopeOf = (r) => r.ghg?.scope || (r.modules?.includes('water') ? 'water' : r.modules?.includes('waste') ? 'waste' : 'none');
