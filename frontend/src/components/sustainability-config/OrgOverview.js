import React from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Building2, Edit2, Trash2 } from 'lucide-react';

export function OrgOverview({ organizations, onSelectOrg, onDeleteConfig }) {
  const configuredOrgs = organizations.filter(o => o.has_config);
  const unconfiguredOrgs = organizations.filter(o => !o.has_config);

  return (
    <Card className="p-6" data-testid="org-overview">
      <h2 className="text-lg font-semibold mb-4">Configured Organizations</h2>

      {configuredOrgs.length === 0 ? (
        <p className="text-sm text-stone-400 py-4 text-center">No organizations configured yet.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {configuredOrgs.map(org => (
            <div key={org.id} className="flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:bg-stone-50">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <span className="font-medium text-sm">{org.name}</span>
                <Badge className="text-xs bg-emerald-100 text-emerald-700">Configured</Badge>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => onSelectOrg(org.id)} data-testid={`edit-org-${org.id}`}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDeleteConfig(org.id)} data-testid={`delete-org-${org.id}`}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="text-sm font-semibold text-stone-600 mb-2">Add Configuration</h3>
      <div className="flex items-center gap-3">
        <Select value="" onValueChange={onSelectOrg}>
          <SelectTrigger className="max-w-sm" data-testid="org-selector">
            <SelectValue placeholder="Select organization to configure" />
          </SelectTrigger>
          <SelectContent>
            {unconfiguredOrgs.map(org => (
              <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
            ))}
            {configuredOrgs.map(org => (
              <SelectItem key={org.id} value={org.id}>{org.name} (edit existing)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
