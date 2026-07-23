/**
 * Detailed Progress View Component
 * 
 * Shows a detailed matrix of reporting periods vs facility status.
 * Enables admins to see exactly which month/quarter data is filled,
 * pending, or overdue - and for facility-level assignments, which
 * specific facilities are lagging.
 * 
 * Features:
 * - Period rows showing each reporting period (monthly, quarterly, etc.)
 * - Facility columns for facility-level assignments
 * - Color-coded status cells (completed, pending, overdue, partial)
 * - Summary statistics
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Skeleton } from './ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  XCircle,
  BarChart3,
  MinusCircle,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Status configuration with colors and icons
const STATUS_CONFIG = {
  completed: {
    bg: 'bg-emerald-100',
    border: 'border-emerald-300',
    text: 'text-emerald-700',
    icon: CheckCircle2,
    label: 'Completed',
    cellClass: 'bg-emerald-50 hover:bg-emerald-100',
  },
  partial: {
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    text: 'text-amber-700',
    icon: BarChart3,
    label: 'Partial',
    cellClass: 'bg-amber-50 hover:bg-amber-100',
  },
  pending: {
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    text: 'text-stone-500',
    icon: Clock,
    label: 'Pending',
    cellClass: 'bg-stone-50 hover:bg-stone-100',
  },
  overdue: {
    bg: 'bg-red-100',
    border: 'border-red-300',
    text: 'text-red-700',
    icon: AlertTriangle,
    label: 'Overdue',
    cellClass: 'bg-red-50 hover:bg-red-100',
  },
  unassigned: {
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    text: 'text-slate-400',
    icon: MinusCircle,
    label: 'Unassigned',
    cellClass: 'bg-slate-50 hover:bg-slate-100 opacity-60',
  },
};

// Compact status cell for the matrix
const StatusCell = ({ status, hasData, facilityName, periodLabel, isAssigned = true, showTooltip = true }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  
  const cell = (
    <div
      className={`
        w-full h-10 flex items-center justify-center rounded border
        ${config.cellClass} ${config.border}
        transition-colors cursor-default
      `}
    >
      <Icon className={`w-4 h-4 ${config.text}`} />
    </div>
  );

  if (!showTooltip) return cell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {cell}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="space-y-1">
          {facilityName && <div className="font-medium">{facilityName}</div>}
          <div>{periodLabel}</div>
          <div className={`${config.text} font-medium`}>{config.label}</div>
          {!isAssigned && (
            <div className="text-slate-500 italic">Not assigned for this subcategory</div>
          )}
          {isAssigned && hasData !== undefined && (
            <div className="text-text-muted">
              {hasData ? 'Data submitted' : 'No data yet'}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default function DetailedProgressView({
  category,
  subcategory,
  onClose,
  className = '',
}) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('matrix'); // 'matrix' or 'list'

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch detailed progress data
  const fetchData = useCallback(async () => {
    if (!category) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const url = subcategory
        ? `${API}/api/esg-records/detailed-progress/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`
        : `${API}/api/esg-records/detailed-progress/${encodeURIComponent(category)}`;
      
      const res = await axios.get(url, { headers });
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch detailed progress:', err);
      setError(err.response?.data?.detail || 'Failed to load detailed progress');
    } finally {
      setLoading(false);
    }
  }, [category, subcategory, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate overall progress percentage
  const getProgressPercentage = () => {
    if (!data?.summary) return 0;
    const total = data.summary.total_periods || 0;
    if (total === 0) return 0;
    return Math.round(((data.summary.completed + (data.summary.partial || 0) * 0.5) / total) * 100);
  };

  if (loading) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-text-muted">Loading detailed progress...</span>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center gap-3 text-red-600">
          <XCircle className="w-5 h-5" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!data || !data.has_assignment) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="text-center text-text-muted py-8">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-stone-300" />
          <div className="font-medium">No Assignment Found</div>
          <div className="text-sm mt-1">
            This {subcategory ? 'subcategory' : 'category'} does not have an active assignment yet.
          </div>
        </div>
      </Card>
    );
  }

  const isFacilityLevel = data.assignment_level === 'facility';
  const progressPct = getProgressPercentage();

  return (
    <Card className={`p-4 ${className}`} data-testid="detailed-progress-view">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary">
              {category}
              {subcategory && <span className="text-text-muted font-normal"> / {subcategory}</span>}
            </h3>
            <Badge variant="outline" className="text-xs">
              {isFacilityLevel ? 'Facility Level' : 'Organization Level'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <span className="capitalize">{data.frequency || 'Monthly'}</span>
            <span>•</span>
            <span>{data.periods?.length || 0} periods</span>
            {isFacilityLevel && (
              <>
                <span>•</span>
                <span>{data.facilities?.length || 0} facilities</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ChevronUp className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <div className="p-3 bg-stone-50 rounded-lg">
          <div className="text-lg font-bold text-text-primary">{data.summary?.total_periods || 0}</div>
          <div className="text-xs text-text-muted">Total Periods</div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-lg">
          <div className="text-lg font-bold text-emerald-700">{data.summary?.completed || 0}</div>
          <div className="text-xs text-text-muted">Completed</div>
        </div>
        {isFacilityLevel && (
          <div className="p-3 bg-amber-50 rounded-lg">
            <div className="text-lg font-bold text-amber-700">{data.summary?.partial || 0}</div>
            <div className="text-xs text-text-muted">Partial</div>
          </div>
        )}
        <div className="p-3 bg-red-50 rounded-lg">
          <div className="text-lg font-bold text-red-700">{data.summary?.overdue || 0}</div>
          <div className="text-xs text-text-muted">Overdue</div>
        </div>
        <div className="p-3 bg-stone-100 rounded-lg">
          <div className="text-lg font-bold text-stone-600">{data.summary?.pending || 0}</div>
          <div className="text-xs text-text-muted">Pending</div>
        </div>
        {isFacilityLevel && (
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-emerald-600">{data.summary?.assigned_facilities || 0}</span>
              <span className="text-slate-400">/</span>
              <span className="text-sm text-slate-500">{(data.summary?.assigned_facilities || 0) + (data.summary?.unassigned_facilities || 0)}</span>
            </div>
            <div className="text-xs text-text-muted">Facilities Assigned</div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-text-muted">Overall Progress</span>
          <span className="text-sm font-medium">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* Matrix View */}
      {isFacilityLevel && (data.facilities?.length > 0 || data.unassigned_facilities?.length > 0) ? (
        <TooltipProvider>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10 min-w-[120px]">
                    Period
                  </TableHead>
                  {/* Assigned facilities first */}
                  {data.facilities?.map((facility) => (
                    <TableHead key={facility.id} className="text-center min-w-[100px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <Building2 className="w-3 h-3 text-emerald-600" />
                        <span className="text-xs truncate max-w-[90px] font-medium">{facility.name}</span>
                        <span className="text-[10px] text-emerald-600">Assigned</span>
                      </div>
                    </TableHead>
                  ))}
                  {/* Unassigned facilities */}
                  {data.unassigned_facilities?.map((facility) => (
                    <TableHead key={facility.id} className="text-center min-w-[100px] opacity-60">
                      <div className="flex flex-col items-center gap-0.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span className="text-xs truncate max-w-[90px] text-slate-500">{facility.name}</span>
                        <span className="text-[10px] text-slate-400">Not Assigned</span>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[80px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.periods?.map((period) => (
                  <TableRow key={period.label}>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">
                      <span>{period.label}</span>
                    </TableCell>
                    {period.facility_statuses?.map((fs) => (
                      <TableCell key={fs.facility_id} className="p-1">
                        <StatusCell
                          status={fs.status}
                          hasData={fs.has_data}
                          facilityName={fs.facility_name}
                          periodLabel={period.label}
                          isAssigned={fs.is_assigned}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge 
                          className={`text-xs ${STATUS_CONFIG[period.status]?.bg || ''} ${STATUS_CONFIG[period.status]?.text || ''}`}
                        >
                          {period.completed_count}/{period.total_count}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      ) : (
        // Organization-level: Simple period list
        <TooltipProvider>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {data.periods?.map((period) => {
              const config = STATUS_CONFIG[period.status] || STATUS_CONFIG.pending;
              const Icon = config.icon;
              
              return (
                <Tooltip key={period.label}>
                  <TooltipTrigger asChild>
                    <div
                      className={`
                        p-3 rounded-lg border flex flex-col items-center justify-center
                        ${config.cellClass} ${config.border}
                        transition-colors cursor-default
                      `}
                    >
                      <Icon className={`w-5 h-5 mb-1 ${config.text}`} />
                      <span className={`text-xs font-medium ${config.text}`}>
                        {period.label}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="space-y-1">
                      <div className="font-medium">{period.label}</div>
                      <div className={`${config.text}`}>{config.label}</div>
                      {period.is_overdue && (
                        <div className="text-red-600 font-medium">Past due date</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t text-xs">
        {Object.entries(STATUS_CONFIG).map(([key, config]) => {
          // Skip 'partial' for org-level view
          if (key === 'partial' && !isFacilityLevel) return null;
          
          const Icon = config.icon;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded flex items-center justify-center ${config.bg} ${config.border}`}>
                <Icon className={`w-3 h-3 ${config.text}`} />
              </div>
              <span className="text-text-muted">{config.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
