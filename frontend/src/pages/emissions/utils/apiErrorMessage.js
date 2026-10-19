const cleanMessage = (message) => (
  typeof message === 'string'
    ? message.replace(/^Value error,\s*/i, '').trim()
    : ''
);

const extractDetailMessage = (detail) => {
  if (typeof detail === 'string') return cleanMessage(detail);

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (
        typeof item === 'string'
          ? cleanMessage(item)
          : cleanMessage(item?.msg || item?.message || item?.detail)
      ))
      .filter(Boolean);
    return [...new Set(messages)].join(', ');
  }

  if (detail && typeof detail === 'object') {
    return cleanMessage(detail.msg || detail.message || detail.detail || detail.error);
  }

  return '';
};

export const getEmissionUpdateErrorMessage = (
  error,
  fallback = 'Failed to update emissions. Please try again.',
) => extractDetailMessage(error?.response?.data?.detail) || fallback;