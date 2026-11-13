/**
 * Task Filters Component
 * Provides search and filter controls for tasks
 */

import React, { useMemo } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Search, RefreshCw, X } from 'lucide-react';

const ALL = 'all';
const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const facilityOf = (t) => t.facility_name || t.facility_id;

export default function TaskFilters({ filters, onChange, onRefresh, tasks = [], showCategoryFilters = false }) {
  const updateFilter = (key, value) => {
    onChange({ ...filters, [key]: value, ...(key === 'category' ? { subcategory: ALL } : {}) });
  };

  const records = useMemo(() => tasks.filter((t) => t.entity_type !== 'question'), [tasks]);
  const categories = useMemo(() => unique(records.map((t) => t.category)), [records]);
  const subcategories = useMemo(
    () => unique(records.filter((t) => filters.category === ALL || t.category === filters.category).map((t) => t.subcategory)),
    [records, filters.category],
  );
  const facilities = useMemo(() => unique(records.map(facilityOf)), [records]);
  const hasActiveFilters = ['category', 'subcategory', 'facility'].some((k) => filters[k] !== ALL) || filters.startDate || filters.endDate;
  const clearFilters = () => onChange({ ...filters, category: ALL, subcategory: ALL, facility: ALL, startDate: '', endDate: '' });

  const renderSelect = (key, label, options, width = 'w-[170px]') => (
    <Select value={filters[key]} onValueChange={(v) => updateFilter(key, v)}>
      <SelectTrigger className={width} data-testid={`task-${key}-filter`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{`All ${label}`}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input
              placeholder="Search tasks..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="pl-10"
              data-testid="task-search-input"
            />
          </div>
        </div>
        
        {/* Status Filter */}
        <Select 
          value={filters.status} 
          onValueChange={(v) => updateFilter('status', v)}
        >
          <SelectTrigger className="w-[140px]" data-testid="task-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Task Type Filter */}
        <Select 
          value={filters.taskType} 
          onValueChange={(v) => updateFilter('taskType', v)}
        >
          <SelectTrigger className="w-[140px]" data-testid="task-type-filter">
            <SelectValue placeholder="Task Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tasks</SelectItem>
            <SelectItem value="current">Current</SelectItem>
            <SelectItem value="backfill">Backfill</SelectItem>
            <SelectItem value="future">Future</SelectItem>
          </SelectContent>
        </Select>
        
        {showCategoryFilters && (
          <>
            {renderSelect('category', 'Categories', categories)}
            {renderSelect('subcategory', 'Subcategories', subcategories, 'w-[200px]')}
            {renderSelect('facility', 'Facilities', facilities)}
          </>
        )}

        {/* Reporting period range */}
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <label htmlFor="task-start-date">Period from</label>
          <Input id="task-start-date" type="date" value={filters.startDate} max={filters.endDate || undefined}
                 onChange={(e) => updateFilter('startDate', e.target.value)} className="w-[150px]" data-testid="task-start-date-filter" />
          <label htmlFor="task-end-date">to</label>
          <Input id="task-end-date" type="date" value={filters.endDate} min={filters.startDate || undefined}
                 onChange={(e) => updateFilter('endDate', e.target.value)} className="w-[150px]" data-testid="task-end-date-filter" />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="task-clear-filters-btn">
            <X className="w-4 h-4 mr-1" />Clear
          </Button>
        )}

        {/* Refresh Button */}
        <Button 
          variant="outline" 
          size="icon"
          onClick={onRefresh}
          data-testid="task-refresh-btn"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
