/**
 * Tracker Filters Component
 */

import React from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Filter, RefreshCw } from 'lucide-react';

export default function TrackerFilters({
  reportingPeriod,
  reportingYears,
  onReportingPeriodChange,
  hideReportingPeriodSelector,
  categoryFilter,
  onCategoryFilterChange,
  categories,
  facilityFilter,
  onFacilityFilterChange,
  facilities,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  refreshing,
}) {
  // Get unique category names
  const uniqueCategories = [...new Set(categories.map(c => c.category))];

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        
        {/* Reporting Period */}
        {!hideReportingPeriodSelector && (
          <Select value={reportingPeriod || ''} onValueChange={onReportingPeriodChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {reportingYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Category */}
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {uniqueCategories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Facility */}
        <Select value={facilityFilter} onValueChange={onFacilityFilterChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Facility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Facilities</SelectItem>
            {facilities.map(fac => (
              <SelectItem key={fac.id} value={fac.id}>{fac.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="ml-auto"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </Card>
  );
}
