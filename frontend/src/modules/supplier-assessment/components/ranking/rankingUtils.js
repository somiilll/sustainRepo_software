export const hasValue = (value) => (
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
);

export const scoreText = (value) => (
  hasValue(value) ? Number(value).toFixed(1).replace(/\.0$/, '') : '—'
);

export const completionText = (value) => (hasValue(value) ? `${scoreText(value)}%` : '—');

export const moduleName = (key) => (
  ({ esg: 'ESG', ghg: 'GHG', documents: 'Documents', training: 'Training' }[key] || key)
);

export const scoreMeta = (value) => {
  if (!hasValue(value)) return { color: '#d6d3d1' };
  if (Number(value) >= 80) return { color: '#10b981' };
  if (Number(value) >= 60) return { color: '#3b82f6' };
  if (Number(value) >= 40) return { color: '#f59e0b' };
  return { color: '#ef4444' };
};

export const initials = (name = '') => (
  name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '—'
);