/**
 * Data Coverage Grid Component
 * 
 * Shows period-wise data completion status for a category assignment.
 * Visual grid showing which periods have data vs missing.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Status colors
const STATUS_CONFIG = {
  complete: {
    bg: 'bg-emerald-100',
    border: 'border-emerald-300',
    text: 'text-emerald-700',
    icon: CheckCircle2,
    label: 'Complete'
  },
  missing: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    icon: XCircle,
    label: 'Missing'
  },
  overdue: {
    bg: 'bg-red-100',
    border: 'border-red-400',
    text: 'text-red-700',
    icon: AlertTriangle,
    label: 'Overdue'
  },
  due_soon: {
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    text: 'text-amber-700',
    icon: Clock,
    label: 'Due Soon'
  },
  upcoming: {
    bg: 'bg-stone-50',
    border: 'border-stone-200',
    text: 'text-stone-400',
    icon: Calendar,
    label: 'Upcoming'
  },
  not_started: {
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    text: 'text-stone-500',
    icon: Clock,
    label: 'Not Started'
  }
};

export default function DataCoverageGrid({ 
  category, 
  subcategory, 
  sub_subcategory,
  fillingFrequency,
  reportingYear,
  facilityId,
  expanded = false,
  onToggle
}) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [isExpanded, setIsExpanded] = useState(expanded);

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch coverage data
  useEffect(() => {
    const fetchCoverage = async () => {
      if (!fillingFrequency || !reportingYear || !category) return;
      if (!isExpanded) return; // Only fetch when expanded
      
      setLoading(true);
      try {
        const params = new URLSearchParams({
          category,
          filling_frequency: fillingFrequency,
          reporting_year: reportingYear,
        });
        if (subcategory) params.append('subcategory', subcategory);
        if (sub_subcategory) params.append('sub_subcategory', sub_subcategory);
        if (facilityId) params.append('facility_id', facilityId);

        const res = await axios.get(`${API}/api/esg-records/coverage?${params}`, { headers });
        setCoverage(res.data);
      } catch (error) {
        console.error('Failed to fetch coverage:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCoverage();
  }, [category, subcategory, sub_subcategory, fillingFrequency, reportingYear, facilityId, isExpanded, token]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (onToggle) onToggle(!isExpanded);
  };

  if (!fillingFrequency || fillingFrequency === 'one_time') {
    return null;
  }

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className="text-xs text-text-muted hover:text-text-primary gap-1 p-1 h-auto"
      >
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {isExpanded ? 'Hide' : 'Show'} Data Coverage
      </Button>

      {isExpanded && (
        <div className="mt-2 p-3 bg-stone-50 rounded-lg border">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span className="ml-2 text-sm text-text-muted">Loading coverage...</span>
            </div>
          ) : coverage ? (
            <div className="space-y-3">
              {/* Summary */}
              <div className="flex items-center gap-4 text-xs">
                <span className="font-medium">Coverage: {coverage.summary?.complete || 0}/{coverage.summary?.total || 0}</span>
                {coverage.summary?.overdue > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {coverage.summary.overdue} Overdue
                  </Badge>
                )}
                {coverage.summary?.due_soon > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 text-xs">
                    {coverage.summary.due_soon} Due Soon
                  </Badge>
                )}
              </div>

              {/* Period Grid */}
              <TooltipProvider>
                <div className="flex flex-wrap gap-1">
                  {coverage.periods?.map((period) => {
                    const config = STATUS_CONFIG[period.status] || STATUS_CONFIG.not_started;
                    const Icon = config.icon;
                    
                    return (
                      <Tooltip key={period.period_key}>
                        <TooltipTrigger asChild>
                          <div 
                            className={`
                              w-16 h-12 rounded border flex flex-col items-center justify-center cursor-default
                              ${config.bg} ${config.border}
                            `}
                          >
                            <Icon className={`w-4 h-4 ${config.text}`} />
                            <span className={`text-[10px] font-medium mt-0.5 ${config.text} truncate max-w-full px-1`}>
                              {period.period_label?.split(' ')[0] || period.period_key}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="space-y-1">
                            <div className="font-medium">{period.period_label}</div>
                            <div>Status: {config.label}</div>
                            <div>Due: {new Date(period.due_date).toLocaleDateString()}</div>
                            {period.days_until_due !== undefined && (
                              <div>
                                {period.days_until_due >= 0 
                                  ? `${period.days_until_due} days until due`
                                  : `${Math.abs(period.days_until_due)} days overdue`
                                }
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs border-t pt-2 mt-2">
                {Object.entries(STATUS_CONFIG).slice(0, 4).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <div className={`w-3 h-3 rounded ${config.bg} ${config.border}`} />
                      <span className="text-text-muted">{config.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-text-muted text-center py-2">
              No coverage data available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
