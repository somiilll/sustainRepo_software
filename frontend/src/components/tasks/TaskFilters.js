/**
 * Task Filters Component
 * Provides search and filter controls for tasks
 */

import React from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Search, RefreshCw } from 'lucide-react';

export default function TaskFilters({ filters, onChange, onRefresh }) {
  const updateFilter = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

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
