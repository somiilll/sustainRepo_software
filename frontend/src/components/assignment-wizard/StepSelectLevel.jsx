/**
 * Step 1: Select Level
 * Choose between Organization or Facility level assignment
 */

import React from 'react';
import { Building2, Factory, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StepSelectLevel({ form, updateForm, facilities }) {
  const options = [
    {
      value: 'organization',
      title: 'Organization Level',
      description: 'Single assignment for the entire organization. Data is reported at org level.',
      icon: Building2,
      stats: '1 assignment',
    },
    {
      value: 'facility',
      title: 'Facility Level',
      description: 'Separate assignments per facility. Each facility reports independently.',
      icon: Factory,
      stats: `${facilities.length} facilities`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-text-primary">Assignment Scope</h3>
        <p className="text-xs text-text-muted">
          Choose how this category should be assigned and reported
        </p>
      </div>

      <div className="grid gap-3">
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = form.assignment_level === option.value;
          
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateForm({ 
                assignment_level: option.value,
                // Reset user assignments when switching levels
                assigned_user_ids: [],
                facility_assignments: {},
              })}
              className={cn(
                "relative flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all",
                "hover:border-emerald-300 hover:bg-emerald-50/50",
                isSelected 
                  ? "border-emerald-500 bg-emerald-50" 
                  : "border-stone-200 bg-white"
              )}
            >
              {/* Icon */}
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                isSelected ? "bg-emerald-500 text-white" : "bg-stone-100 text-stone-500"
              )}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "font-medium",
                    isSelected ? "text-emerald-700" : "text-text-primary"
                  )}>
                    {option.title}
                  </span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    isSelected 
                      ? "bg-emerald-100 text-emerald-700" 
                      : "bg-stone-100 text-stone-500"
                  )}>
                    {option.stats}
                  </span>
                </div>
                <p className="text-sm text-text-muted mt-1">
                  {option.description}
                </p>
              </div>

              {/* Selection indicator */}
              <div className={cn(
                "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center",
                isSelected 
                  ? "border-emerald-500 bg-emerald-500" 
                  : "border-stone-300"
              )}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Facility Preview (when facility level selected) */}
      {form.assignment_level === 'facility' && facilities.length > 0 && (
        <div className="mt-4 p-3 bg-stone-50 rounded-lg border">
          <div className="text-xs font-medium text-text-muted mb-2">
            Facilities to assign ({facilities.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {facilities.slice(0, 8).map(fac => (
              <span 
                key={fac.id} 
                className="inline-flex items-center px-2 py-1 text-xs bg-white border rounded"
              >
                <Factory className="w-3 h-3 mr-1 text-stone-400" />
                {fac.name}
              </span>
            ))}
            {facilities.length > 8 && (
              <span className="inline-flex items-center px-2 py-1 text-xs text-text-muted">
                +{facilities.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
