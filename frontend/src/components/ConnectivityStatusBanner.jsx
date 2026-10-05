import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useConnectivity } from '../contexts/ConnectivityContext';

const STATUS_CONTENT = {
  offline: {
    title: 'No internet connection',
    icon: WifiOff,
    className: 'border-red-200 bg-red-50 text-red-950',
  },
  recovered: {
    title: 'Back online',
    icon: Wifi,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  },
};

export const ConnectivityStatusBanner = () => {
  const { browserOnline, showRecovery } = useConnectivity();
  const state = !browserOnline ? 'offline' : showRecovery ? 'recovered' : null;
  if (!state) return null;

  const { title, icon: Icon, className } = STATUS_CONTENT[state];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] px-3 pt-3 sm:px-6" role="status" aria-live="polite" data-testid="connectivity-status-banner">
      <div className={`mx-auto flex w-fit max-w-full items-center gap-2 border px-4 py-2.5 shadow-lg transition-opacity duration-200 ${className}`} data-testid={`connectivity-${state}-notice`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold" data-testid="connectivity-status-title">{title}</p>
        </div>
      </div>
    </div>
  );
};