import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useDateFormatter } from '../hooks/useDateFormatter';
import { Bell, Check } from 'lucide-react';
import { Badge } from './ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { Button } from './ui/button';

const API = process.env.REACT_APP_BACKEND_URL;

export default function NotificationBell() {
  const { token } = useAuth();
  const { formatDateTime } = useDateFormatter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/notifications/unread`, { headers });
      setCount(res.data?.count || 0);
    } catch (e) { /* silent */ }
  }, [token]);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/api/notifications?unread_only=false`, { headers });
      setNotifications(res.data?.notifications || []);
    } catch (e) { /* silent */ }
  }, [token]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const markRead = async (id) => {
    await axios.put(`${API}/api/notifications/${id}/read`, {}, { headers });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await axios.put(`${API}/api/notifications/read-all`, {}, { headers });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setCount(0);
  };

  const typeColors = {
    assignment: 'bg-blue-100 text-blue-700',
    approval: 'bg-amber-100 text-amber-700',
    reminder: 'bg-orange-100 text-orange-700',
    info: 'bg-stone-100 text-stone-600',
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          data-testid="notification-bell"
          className="relative p-2 rounded-full hover:bg-stone-100 transition-colors"
        >
          <Bell className={`w-5 h-5 ${count > 0 ? 'text-emerald-700' : 'text-stone-500'}`} />
          {count > 0 && (
            <span
              data-testid="notification-count"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center border border-white"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 bg-white border border-stone-200 shadow-xl max-h-[400px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="text-sm font-semibold text-text-primary">Notifications</span>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              <Check className="w-3 h-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="overflow-y-auto max-h-[340px]">
          {notifications.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No notifications</p>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-stone-50 cursor-pointer hover:bg-stone-50 ${!n.read ? 'bg-blue-50/30' : ''}`}
                onClick={() => { if (!n.read) markRead(n.id); if (n.link) window.location.href = n.link; }}
              >
                <div className="flex items-start gap-2">
                  <Badge className={`${typeColors[n.type] || typeColors.info} text-[10px] mt-0.5 shrink-0`}>
                    {n.type}
                  </Badge>
                  <div className="min-w-0">
                    <p className={`text-sm ${!n.read ? 'font-semibold' : ''} text-text-primary truncate`}>{n.title}</p>
                    <p className="text-xs text-text-muted truncate">{n.message}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {formatDateTime(n.created_at)}
                    </p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
