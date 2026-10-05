import React from 'react';
import { CloudOff, Wifi, WifiOff } from 'lucide-react';
import { useConnectivity } from '../contexts/ConnectivityContext';

const STATUS_CONTENT = {
  offline: {
    title: 'No internet connection',
    message: 'Your internet connection appears to be unavailable. Some changes may not be saved.',
    icon: WifiOff,
    className: 'border-red-200 bg-red-50 text-red-950',
  },
  unavailable: {
    title: 'SustainRepo is temporarily unavailable',
    message: 'Your internet connection is active, but SustainRepo cannot be reached. Some changes may not be saved.',
    icon: CloudOff,
    className: 'border-amber-200 bg-amber-50 text-amber-950',
  },
  recovered: {
    title: 'Back online',
    message: 'Your internet connection and SustainRepo access have been restored.',
    icon: Wifi,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  },
};

export const ConnectivityStatusBanner = () => {
  const { browserOnline, apiReachability, showRecovery } = useConnectivity();
  const state = !browserOnline ? 'offline' : apiReachability === 'unreachable' ? 'unavailable' : showRecovery ? 'recovered' : null;
  if (!state) return null;

  const { title, message, icon: Icon, className } = STATUS_CONTENT[state];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] px-3 pt-3 sm:px-6" role="status" aria-live="polite" data-testid="connectivity-status-banner">
      <div className={`mx-auto flex max-w-3xl items-start gap-3 border px-4 py-3 shadow-lg transition-opacity duration-200 ${className}`} data-testid={`connectivity-${state}-notice`}>
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold" data-testid="connectivity-status-title">{title}</p>
          <p className="mt-0.5 text-sm leading-5" data-testid="connectivity-status-message">{message}</p>
        </div>
      </div>
    </div>
  );
};