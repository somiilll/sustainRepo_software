/**
 * useDashboardLiveStream — WebSocket subscription for real-time dashboard refresh.
 *
 * Subscribes to /api/ws/dashboard and invokes `onRefresh` whenever the backend
 * emits a `dashboard.refresh` event (triggered by emission.saved/updated/deleted
 * + audit.persisted from any process).
 *
 * - Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s).
 * - Heartbeat ping every 25s to keep proxies happy.
 * - Coalesces bursty events (e.g., bulk uploads) into a single refresh
 *   call via a 250ms debounce.
 *
 * Usage:
 *   useDashboardLiveStream({ token, onRefresh: () => refetch() });
 */
import { useEffect, useRef } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const HEARTBEAT_MS = 25_000;
const REFRESH_DEBOUNCE_MS = 250;

function buildWsUrl(token) {
  if (!BACKEND_URL || !token) return null;
  const wsBase = BACKEND_URL.replace(/^http/i, 'ws');
  return `${wsBase}/api/ws/dashboard?token=${encodeURIComponent(token)}`;
}

export function useDashboardLiveStream({ token, onRefresh, enabled = true }) {
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const closedByUsRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  // Keep latest callback without causing reconnects.
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!enabled || !token) return undefined;
    closedByUsRef.current = false;

    // StrictMode-safe: if a previous connection from this hook is still open
    // (mount-cleanup-mount cycle), close it before opening a new one.
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      try { wsRef.current.close(1000, 'remount'); } catch (e) { /* ignore */ }
      wsRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const connect = () => {
      const url = buildWsUrl(token);
      if (!url) return;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* ignore */ }
          }
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch (e) { return; }
        if (!data || data.type !== 'dashboard.refresh') return;
        // Debounce bursty refreshes
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          try { onRefreshRef.current?.(data); } catch (e) { /* swallow */ }
        }, REFRESH_DEBOUNCE_MS);
      };

      ws.onerror = () => { /* error → close handler will trigger reconnect */ };

      ws.onclose = () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        if (!closedByUsRef.current) scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (closedByUsRef.current) return;
      const attempt = Math.min(reconnectAttemptRef.current, 5);
      const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try { wsRef.current.close(1000, 'unmount'); } catch (e) { /* ignore */ }
      }
      wsRef.current = null;
    };
  }, [token, enabled]);
}
