import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL, SYSTEM_ENDPOINTS } from '../config/api';

const ConnectivityContext = createContext(null);
const READINESS_CHECK_INTERVAL_MS = 60000;
const READINESS_CHECK_TIMEOUT_MS = 8000;
const READINESS_RETRY_DELAY_MS = 3000;
const FAILURE_THRESHOLD = 2;
const RECOVERY_SUCCESS_THRESHOLD = 2;
const RECOVERY_NOTICE_MS = 6000;

const isSustainRepoRequest = (url) => typeof url === 'string' && url.startsWith(API_BASE_URL);

export const ConnectivityProvider = ({ children }) => {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [apiReachability, setApiReachability] = useState('unknown');
  const [showRecovery, setShowRecovery] = useState(false);
  const apiUnavailableRef = useRef(false);
  const recoveryPendingRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const consecutiveSuccessesRef = useRef(0);
  const recoveryTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const readinessCheckRef = useRef(null);

  const clearRecoveryNotice = useCallback(() => {
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }, []);

  const clearReadinessRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const showRecoveryNotice = useCallback(() => {
    clearRecoveryNotice();
    setShowRecovery(true);
    recoveryTimerRef.current = window.setTimeout(() => setShowRecovery(false), RECOVERY_NOTICE_MS);
  }, [clearRecoveryNotice]);

  const scheduleReadinessRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void readinessCheckRef.current?.();
    }, READINESS_RETRY_DELAY_MS);
  }, []);

  const recordApiReady = useCallback(() => {
    consecutiveFailuresRef.current = 0;
    clearReadinessRetry();
    if (apiUnavailableRef.current) {
      consecutiveSuccessesRef.current += 1;
      if (consecutiveSuccessesRef.current < RECOVERY_SUCCESS_THRESHOLD) {
        scheduleReadinessRetry();
        return;
      }
      apiUnavailableRef.current = false;
      setApiReachability('reachable');
      console.info('[Connectivity] SustainRepo readiness recovered after repeated unavailable signals.');
      return;
    }

    consecutiveSuccessesRef.current = 0;
    setApiReachability('reachable');
    if (!recoveryPendingRef.current) return;
    recoveryPendingRef.current = false;
    showRecoveryNotice();
  }, [clearReadinessRetry, scheduleReadinessRetry, showRecoveryNotice]);

  const recordApiFailure = useCallback(() => {
    if (!navigator.onLine) return;
    consecutiveSuccessesRef.current = 0;
    consecutiveFailuresRef.current += 1;
    if (consecutiveFailuresRef.current < FAILURE_THRESHOLD) {
      scheduleReadinessRetry();
      return;
    }

    apiUnavailableRef.current = true;
    clearReadinessRetry();
    clearRecoveryNotice();
    setShowRecovery(false);
    setApiReachability('unreachable');
    console.warn('[Connectivity] SustainRepo readiness could not be confirmed after repeated failed signals.', {
      consecutiveFailures: consecutiveFailuresRef.current,
      browserOnline: navigator.onLine,
    });
  }, [clearReadinessRetry, clearRecoveryNotice, scheduleReadinessRetry]);

  const checkApiReachability = useCallback(async () => {
    if (!navigator.onLine) return false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), READINESS_CHECK_TIMEOUT_MS);
    try {
      const response = await fetch(SYSTEM_ENDPOINTS.READINESS, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Readiness check returned ${response.status}`);
      recordApiReady();
      return true;
    } catch {
      recordApiFailure();
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }, [recordApiFailure, recordApiReady]);

  readinessCheckRef.current = checkApiReachability;

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      void checkApiReachability();
    };
    const handleOffline = () => {
      apiUnavailableRef.current = false;
      recoveryPendingRef.current = true;
      consecutiveFailuresRef.current = 0;
      consecutiveSuccessesRef.current = 0;
      clearReadinessRetry();
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
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkApiReachability();
    }, READINESS_CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
      clearReadinessRetry();
      clearRecoveryNotice();
    };
  }, [checkApiReachability, clearReadinessRetry, clearRecoveryNotice]);

  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (isSustainRepoRequest(error.config?.url)) {
          if (!error.response) recordApiFailure();
        }
        return Promise.reject(error);
      },
    );
    return () => axios.interceptors.response.eject(responseInterceptor);
  }, [recordApiFailure]);

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