/**
 * DashboardHeader — title + filter toggle + live-cockpit status.
 * Shared between DashboardScope12 and DashboardScope123.
 */
import React, { useEffect, useState } from 'react';
import { Filter, Radio } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import PendingApprovalBell from '../../../modules/ghg/components/PendingApprovalBell';

function formatRelative(date) {
  if (!date) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function DashboardHeader({ showFilters, onToggleFilters, isLive, lastLiveUpdateAt }) {
  // Force a re-render every 15s so "X s ago" stays fresh.
  const [, force] = useState(0);
  useEffect(() => {
    if (!lastLiveUpdateAt) return undefined;
    const t = setInterval(() => force(n => n + 1), 15000);
    return () => clearInterval(t);
  }, [lastLiveUpdateAt]);

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Dashboard</h1>
          {isLive && (
            <span
              data-testid="dashboard-live-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/30"
              title={lastLiveUpdateAt ? `Last update: ${formatRelative(lastLiveUpdateAt)}` : 'Live channel connected'}
            >
              <Radio className="w-3 h-3 animate-pulse" />
              LIVE{lastLiveUpdateAt ? ` · ${formatRelative(lastLiveUpdateAt)}` : ''}
            </span>
          )}
        </div>
        <p className="text-text-secondary">Overview of your GHG emissions data</p>
      </div>
      <div className="flex items-center gap-2">
        <PendingApprovalBell />
        <Button
          onClick={onToggleFilters}
          variant="outline"
          className="rounded-full"
          data-testid="toggle-filters-btn"
        >
          <Filter className="w-4 h-4 mr-2" />
          {showFilters ? 'Hide' : 'Show'} Filters
        </Button>
      </div>
    </div>
  );
}
