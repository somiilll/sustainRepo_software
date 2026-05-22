/**
 * DashboardHeader — title + filter toggle button.
 * Shared between DashboardScope12 and DashboardScope123.
 */
import React from 'react';
import { Filter } from 'lucide-react';
import { Button } from '../../../components/ui/button';

export default function DashboardHeader({ showFilters, onToggleFilters }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Dashboard</h1>
        <p className="text-text-secondary">Overview of your GHG emissions data</p>
      </div>
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
  );
}
