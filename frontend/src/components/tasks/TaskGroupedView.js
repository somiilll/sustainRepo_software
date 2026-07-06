/**
 * Task Grouped View Component
 * Displays tasks grouped by category with collapsible sections
 */

import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import TaskRow from './TaskRow';
import { TASK_TYPE } from './constants';

export default function TaskGroupedView({ 
  groups, 
  filters, 
  onFillTask, 
  onViewTask,
  emptyMessage = 'No metric tasks found'
}) {
  const [expandedCategories, setExpandedCategories] = useState({});

  const toggleCategory = (key) => {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter tasks based on current filters
  const getFilteredTasks = (group) => {
    let tasks = [];
    
    if (filters.taskType === 'all') {
      tasks = [...group.backfill, ...group.current, ...group.future];
    } else if (filters.taskType === TASK_TYPE.BACKFILL) {
      tasks = group.backfill;
    } else if (filters.taskType === TASK_TYPE.CURRENT) {
      tasks = group.current;
    } else if (filters.taskType === TASK_TYPE.FUTURE) {
      tasks = group.future;
    }
    
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const categoryMatches = 
        group.category?.toLowerCase().includes(searchLower) || 
        group.subcategory?.toLowerCase().includes(searchLower);
      
      if (!categoryMatches) {
        tasks = tasks.filter(t => 
          t.period_label?.toLowerCase().includes(searchLower)
        );
      }
    }
    
    return tasks;
  };

  if (groups.length === 0) {
    return (
      <Card className="p-8 text-center">
        <ClipboardList className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-text-primary">{emptyMessage}</h3>
        <p className="text-text-muted">You do not have any tasks assigned.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const key = group.key;
        const isExpanded = expandedCategories[key];
        const progress = group.total > 0 
          ? Math.round((group.completed / group.total) * 100) 
          : 0;
        
        const tasksToShow = getFilteredTasks(group);
        
        if (tasksToShow.length === 0) return null;
        
        return (
          <Card key={key} className="overflow-hidden" data-testid={`task-group-${key}`}>
            {/* Category Header */}
            <div 
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition-colors"
              onClick={() => toggleCategory(key)}
              data-testid={`task-group-header-${key}`}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-stone-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-stone-400" />
                )}
                <div>
                  <h3 className="font-medium text-text-primary">{key}</h3>
                  <div className="flex items-center gap-3 text-sm text-text-muted mt-1">
                    <span>{tasksToShow.length} tasks</span>
                    {group.backfill.length > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 text-xs">
                        {group.backfill.length} backfill
                      </Badge>
                    )}
                    {group.overdue > 0 && (
                      <Badge className="bg-red-100 text-red-700 text-xs">
                        {group.overdue} overdue
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="flex items-center gap-4">
                <div className="w-32">
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </div>
            </div>
            
            {/* Expanded Tasks */}
            {isExpanded && (
              <div className="border-t border-stone-100">
                {/* Backfill Tasks */}
                {group.backfill.length > 0 && 
                 (filters.taskType === 'all' || filters.taskType === TASK_TYPE.BACKFILL) && (
                  <TaskSection
                    title="Backfill Tasks"
                    tasks={group.backfill}
                    bgClass="bg-amber-50/50"
                    headerClass="text-amber-700 border-amber-100"
                    onFill={onFillTask}
                    onView={onViewTask}
                  />
                )}
                
                {/* Current Tasks */}
                {group.current.length > 0 && 
                 (filters.taskType === 'all' || filters.taskType === TASK_TYPE.CURRENT) && (
                  <TaskSection
                    title="Current Tasks"
                    tasks={group.current}
                    bgClass="bg-emerald-50/50"
                    headerClass="text-emerald-700 border-stone-100"
                    onFill={onFillTask}
                    onView={onViewTask}
                  />
                )}
                
                {/* Future Tasks */}
                {group.future.length > 0 && 
                 (filters.taskType === 'all' || filters.taskType === TASK_TYPE.FUTURE) && (
                  <TaskSection
                    title="Future Tasks"
                    tasks={group.future}
                    bgClass="bg-blue-50/30"
                    headerClass="text-blue-700 border-blue-100"
                    onFill={onFillTask}
                    onView={onViewTask}
                  />
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Internal component for task section within a group
function TaskSection({ title, tasks, bgClass, headerClass, onFill, onView }) {
  return (
    <div className={bgClass}>
      <div className={`px-4 py-2 text-xs font-medium ${headerClass} border-b`}>
        {title} ({tasks.length})
      </div>
      <div className="divide-y divide-stone-100">
        {tasks.map(task => (
          <TaskRow 
            key={task.id} 
            task={task} 
            onFill={onFill} 
            onView={onView}
          />
        ))}
      </div>
    </div>
  );
}
