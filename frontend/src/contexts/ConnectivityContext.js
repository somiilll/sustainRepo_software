import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL, API } from '../config/api';

const ConnectivityContext = createContext(null);
const HEALTH_CHECK_INTERVAL_MS = 30000;
const HEALTH_CHECK_TIMEOUT_MS = 8000;
const RECOVERY_NOTICE_MS = 6000;

const isSustainRepoRequest = (url) => typeof url === 'string' && url.startsWith(API_BASE_URL);

export const ConnectivityProvider = ({ children }) => {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [apiReachability, setApiReachability] = useState('unknown');
  const [showRecovery, setShowRecovery] = useState(false);
  const unavailableRef = useRef(false);
  const recoveryTimerRef = useRef(null);

  const clearRecoveryNotice = useCallback(() => {
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }, []);

  const markApiReachable = useCallback(() => {
    setApiReachability('reachable');
    if (!unavailableRef.current) return;
    unavailableRef.current = false;
    clearRecoveryNotice();
    setShowRecovery(true);
    recoveryTimerRef.current = window.setTimeout(() => setShowRecovery(false), RECOVERY_NOTICE_MS);
  }, [clearRecoveryNotice]);

  const markApiUnavailable = useCallback(() => {
    if (!navigator.onLine) return;
    unavailableRef.current = true;
    clearRecoveryNotice();
    setShowRecovery(false);
    setApiReachability('unreachable');
  }, [clearRecoveryNotice]);

  const checkApiReachability = useCallback(async () => {
    if (!navigator.onLine) return false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    try {
      const response = await fetch(`${API}/health`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Health check returned ${response.status}`);
      markApiReachable();
      return true;
    } catch {
      markApiUnavailable();
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }, [markApiReachable, markApiUnavailable]);

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      void checkApiReachability();
    };
    const handleOffline = () => {
      unavailableRef.current = true;
      clearRecoveryNotice();
      setShowRecovery(false);
      setBrowserOnline(false);
      setApiReachability('unknown');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkApiReachability();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void checkApiReachability();
    const intervalId = window.setInterval(() => void checkApiReachability(), HEALTH_CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
      clearRecoveryNotice();
    };
  }, [checkApiReachability, clearRecoveryNotice]);

  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        if (isSustainRepoRequest(response.config?.url)) markApiReachable();
        return response;
      },
      (error) => {
        if (isSustainRepoRequest(error.config?.url)) {
          if (error.response) markApiReachable();
          else markApiUnavailable();
        }
        return Promise.reject(error);
      },
    );
    return () => axios.interceptors.response.eject(responseInterceptor);
  }, [markApiReachable, markApiUnavailable]);

  return (
    <ConnectivityContext.Provider value={{ browserOnline, apiReachability, showRecovery, checkApiReachability }}>
      {children}
    </ConnectivityContext.Provider>
  );
};

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) throw new Error('useConnectivity must be used within a ConnectivityProvider');
  return context;
};