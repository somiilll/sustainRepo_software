import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const TOKEN_KEY = 'token';

let refreshPromise = null;
let interceptorIds = null;
let sessionHandlers = { onToken: null, onSessionExpired: null };

const isApiRequest = (url = '') => String(url).startsWith(API);
const isAuthRequest = (url = '') => String(url).startsWith(`${API}/auth/`);

export const getStoredAccessToken = () => localStorage.getItem(TOKEN_KEY);

export const storeAccessToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
};

export const clearStoredAccessToken = () => localStorage.removeItem(TOKEN_KEY);

export const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = axios.post(`${API}/auth/refresh`, {}, {
      withCredentials: true,
      skipAuthRefresh: true,
    }).then(({ data }) => {
      if (!data?.access_token) throw new Error('Refresh response did not include an access token');
      storeAccessToken(data.access_token);
      sessionHandlers.onToken?.(data.access_token, data.user);
      return data.access_token;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

export const installAuthSessionInterceptors = (handlers) => {
  sessionHandlers = handlers;
  if (interceptorIds) return () => { sessionHandlers = { onToken: null, onSessionExpired: null }; };

  const requestId = axios.interceptors.request.use((config) => {
    if (isApiRequest(config.url)) {
      config.withCredentials = true;
      const token = getStoredAccessToken();
      if (token && !config.skipAuthRefresh) {
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
      }
    }
    return config;
  });

  const responseId = axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const request = error.config || {};
      const isRefreshRequest = String(request.url || '').endsWith('/auth/refresh');
      if (error.response?.status !== 401 || request.skipAuthRefresh || request._retry || isRefreshRequest || isAuthRequest(request.url) || !isApiRequest(request.url)) {
        return Promise.reject(error);
      }

      request._retry = true;
      try {
        const token = await refreshAccessToken();
        request.headers = { ...(request.headers || {}), Authorization: `Bearer ${token}` };
        return axios(request);
      } catch (refreshError) {
        clearStoredAccessToken();
        sessionHandlers.onSessionExpired?.();
        return Promise.reject(error);
      }
    },
  );
  interceptorIds = { requestId, responseId };

  return () => {
    sessionHandlers = { onToken: null, onSessionExpired: null };
  };
};