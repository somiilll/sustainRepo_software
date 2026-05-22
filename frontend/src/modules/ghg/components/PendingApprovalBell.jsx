/**
 * PendingApprovalBell — small bell icon with red badge for the dashboard.
 *
 * Behaviour:
 *  - Visible only to admins / super-admins on orgs that have approval ON
 *  - Shows red badge with pending count when > 0
 *  - On click → tiny popover with message and a CTA linking to /ghg/approvals
 *  - No polling: refreshes when the dashboard reloads or when refetch is
 *    triggered externally.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../components/ui/popover';
import useGHGPermissions from '../hooks/useGHGPermissions';
import usePendingApprovals from '../hooks/usePendingApprovals';

export default function PendingApprovalBell() {
  const perms = useGHGPermissions();
  const { count } = usePendingApprovals({ enabled: perms.canViewApprovals });
  const [open, setOpen] = useState(false);

  if (!perms.canViewApprovals) return null;

  const hasPending = count > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pending approvals"
          data-testid="pending-approval-bell"
          className="relative p-2 rounded-full hover:bg-stone-100 transition-colors"
        >
          <Bell className={`w-5 h-5 ${hasPending ? 'text-emerald-700' : 'text-stone-500'}`} />
          {hasPending && (
            <span
              data-testid="pending-approval-badge"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center border border-white"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <p className="text-sm font-medium text-text-primary mb-1">
          {hasPending
            ? 'You have GHG emission requests pending for your approval'
            : 'No pending approvals'}
        </p>
        {hasPending && (
          <p className="text-xs text-text-secondary mb-3">
            {count} request{count === 1 ? '' : 's'} awaiting review.
          </p>
        )}
        <Link
          to="/ghg/approvals"
          onClick={() => setOpen(false)}
          className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          data-testid="bell-open-approvals-link"
        >
          {hasPending ? 'Open approvals →' : 'Go to approvals'}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
