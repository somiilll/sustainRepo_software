import axios from 'axios';

const STATUS_MESSAGES = {
  400: 'Please check the entered information and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to perform this action.",
  404: 'The requested information could not be found.',
  409: 'This action cannot be completed because the information has changed.',
  422: 'Please check the highlighted fields.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong. Please try again.',
  502: 'The service is temporarily unavailable. Please try again shortly.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
};

const TECHNICAL_MESSAGE = /traceback|exception|stack.?trace|sql|mongo|pymongo|boto|r2|s3|clienterror|nosuchkey|keyerror|attributeerror|typeerror|valueerror|integrityerror|validationerror|connectionerror|timeout|openai|llamaparse|httpx/i;

const safeText = (value) => (
  typeof value === 'string' && value.trim() && value.length <= 280 && !TECHNICAL_MESSAGE.test(value)
    ? value.trim().replace(/^Value error,\s*/i, '')
    : ''
);

const detailMessage = (detail) => {
  if (typeof detail === 'string') return safeText(detail);
  if (Array.isArray(detail)) return detail.map((item) => safeText(item?.msg || item?.message || item)).filter(Boolean)[0] || '';
  if (detail && typeof detail === 'object') return safeText(detail.message || detail.msg || detail.detail);
  return '';
};

export const getSafeUserMessage = (message, fallbackMessage = '') => safeText(message) || fallbackMessage;

export const getUserFriendlyError = (error, fallbackMessage = '', { preferFallback = false } = {}) => {
  if (!error?.response) return 'Unable to connect. Please check your connection and try again.';
  const { status, data } = error.response;
  if ([401, 403, 422, 429].includes(status)) return STATUS_MESSAGES[status];
  if (preferFallback && fallbackMessage) return fallbackMessage;
  const serverMessage = safeText(data?.message) || detailMessage(data?.detail);
  if (serverMessage && status < 500) return serverMessage;
  return fallbackMessage || STATUS_MESSAGES[status] || 'Unable to complete this request. Please try again.';
};

let interceptorInstalled = false;

export const normalizeAxiosError = (error) => {
  if (error.response && error.response.data && typeof error.response.data === 'object') {
    const message = getUserFriendlyError(error);
    error.response.data = { ...error.response.data, detail: message, message };
  }
  return error;
};

export const installGlobalErrorFormatter = () => {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  axios.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(normalizeAxiosError(error)),
  );
};