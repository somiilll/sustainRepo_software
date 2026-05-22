/**
 * AccessDenied — shown when org has no scope module available.
 */
import React from 'react';
import { Card } from '../../../components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function AccessDenied() {
  return (
    <div className="space-y-6" data-testid="bulk-upload-access-denied">
      <div>
        <h1 className="text-2xl font-heading font-bold text-text-primary">Bulk Upload</h1>
        <p className="text-text-muted mt-1">Upload GHG emissions data in bulk using Excel</p>
      </div>
      <Card className="p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-stone-100 rounded-full">
            <AlertTriangle className="w-8 h-8 text-stone-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">No Bulk Upload Access</h3>
            <p className="text-text-muted mt-2 max-w-md">
              Your organization does not have any bulk-upload-enabled scopes. Please contact your administrator to enable Scope 3 (or upcoming Scope 1 / Scope 2) access.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
