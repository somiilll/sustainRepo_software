import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import TargetSettingsPage from '../modules/targets/pages/TargetSettingsPage';
import { Target } from 'lucide-react';

/**
 * GHG Voluntary Targets — target setting only (Base Year is under GHG Module).
 */
export default function GHGTargetsPage() {
  const { user, organization } = useAuth();

  return (
    <div className="space-y-6" data-testid="ghg-targets-page">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
          <Target className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">GHG Targets</h1>
          <p className="text-sm text-stone-500">Set and track GHG emission reduction targets.</p>
        </div>
      </div>
      <TargetSettingsPage organization={organization} currentUser={user} />
    </div>
  );
}
