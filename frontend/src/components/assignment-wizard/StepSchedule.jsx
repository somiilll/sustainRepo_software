/**
 * Step 3: Configure Schedule
 * - Timeline visualization
 * - Due schedule configuration
 * - Reminder toggle
 */

import React, { useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  Bell, 
  AlertCircle,
} from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../ui/select';
import { cn } from '@/lib/utils';
import { TIMEZONES, ALL_FREQUENCIES, DAYS_OF_WEEK } from './useAssignmentWizard';

export function StepSchedule({
  form,
  updateForm,
  reportingPeriod,
  frequencyConfig = {},
}) {
  // Get allowed frequencies from config, with fallback to all
  const allowedFrequencies = useMemo(() => {
    const allowed = frequencyConfig.allowed_frequencies || ALL_FREQUENCIES.map(f => f.value);
    return ALL_FREQUENCIES.filter(f => allowed.includes(f.value));
  }, [frequencyConfig.allowed_frequencies]);

  // Parse dates for timeline
  const timeline = useMemo(() => {
    if (!form.start_date) return null;
    
    const start = new Date(form.start_date);
    const end = form.end_date ? new Date(form.end_date) : null;
    
    const months = [];
    const current = new Date(start);
    current.setDate(1);
    
    const endDate = end || new Date(start.getFullYear(), start.getMonth() + 6, 0);
    
    while (current <= endDate && months.length < 12) {
      months.push({
        label: current.toLocaleDateString('en-US', { month: 'short' }),
        year: current.getFullYear(),
        isInRange: (!end || current <= end) && current >= start,
      });
      current.setMonth(current.getMonth() + 1);
    }
    
    return {
      months,
      startLabel: start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      endLabel: end ? end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : null,
    };
  }, [form.start_date, form.end_date]);

  return (
    <div className="space-y-5">
      {/* Reporting Period Info */}
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-700">Reporting Period</span>
        </div>
        <div className="text-sm font-semibold text-blue-800 mt-1">{reportingPeriod}</div>
      </div>

      {/* Date Range */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Assignment Timeline</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-text-muted">Start Date</Label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => updateForm({ start_date: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-text-muted">End Date</Label>
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => updateForm({ end_date: e.target.value })}
              min={form.start_date}
              className="h-9"
            />
          </div>
        </div>

        {/* Visual Timeline */}
        {timeline && timeline.months.length > 0 && (
          <div className="p-3 bg-stone-50 rounded-lg border">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {timeline.months.map((month, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    "flex-shrink-0 px-2 py-1 text-xs rounded transition-colors",
                    month.isInRange 
                      ? "bg-emerald-500 text-white font-medium" 
                      : "bg-stone-200 text-stone-500"
                  )}
                >
                  {month.label}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
              <span>Start: {timeline.startLabel}</span>
              {timeline.endLabel && <span>End: {timeline.endLabel}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Frequency */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Reporting Frequency</Label>
        <Select 
          value={form.filling_frequency} 
          onValueChange={(v) => updateForm({ filling_frequency: v })}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            {allowedFrequencies.map(f => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {frequencyConfig.loading && (
          <p className="text-xs text-text-muted">Loading frequency options...</p>
        )}
      </div>

      {/* Due Schedule Card */}
      {form.filling_frequency && (
        <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Due Schedule</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Day of Month (for monthly+) */}
            {['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(form.filling_frequency) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-text-muted">Day of Month</Label>
                <Select 
                  value={String(form.due_day_of_month)} 
                  onValueChange={(v) => updateForm({ due_day_of_month: parseInt(v) })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(31)].map((_, i) => (
                      <SelectItem key={i+1} value={String(i+1)}>{i+1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Day of Week (for weekly) */}
            {form.filling_frequency === 'weekly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-text-muted">Day of Week</Label>
                <Select 
                  value={form.due_day_of_week} 
                  onValueChange={(v) => updateForm({ due_day_of_week: v })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Time */}
            <div className="space-y-1.5">
              <Label className="text-xs text-text-muted">Due Time</Label>
              <Input
                type="time"
                value={form.due_time}
                onChange={(e) => updateForm({ due_time: e.target.value })}
                className="h-8"
              />
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <Label className="text-xs text-text-muted">Timezone</Label>
              <Select 
                value={form.timezone} 
                onValueChange={(v) => updateForm({ timezone: v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(form.filling_frequency) && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Auto-adjusts for shorter months (e.g., 31 → 28 for Feb)
            </p>
          )}
        </div>
      )}

      {/* Toggle Cards */}
      <div className="space-y-3">
        {/* Reminders Toggle Card */}
        <ToggleCard
          icon={Bell}
          iconColor="text-blue-600"
          bgColor="bg-blue-50"
          borderColor="border-blue-200"
          title="Reminders"
          description="Notify assignees before due date"
          checked={form.reminder_enabled}
          onCheckedChange={(checked) => updateForm({ 
            reminder_enabled: checked,
            reminder_frequency: checked ? 'weekly' : '',
          })}
        >
          {form.reminder_enabled && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <Label className="text-xs text-text-muted">Reminder Frequency</Label>
              <Select 
                value={form.reminder_frequency} 
                onValueChange={(v) => updateForm({ reminder_frequency: v })}
              >
                <SelectTrigger className="h-8 mt-1">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </ToggleCard>
      </div>
    </div>
  );
}

// Toggle Card Component
function ToggleCard({ 
  icon: Icon, 
  iconColor, 
  bgColor, 
  borderColor, 
  title, 
  description, 
  checked, 
  onCheckedChange,
  children,
}) {
  return (
    <div className={cn(
      "p-4 rounded-lg border transition-all",
      checked ? `${bgColor} ${borderColor}` : "bg-stone-50 border-stone-200"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            checked ? "bg-white" : "bg-stone-100"
          )}>
            <Icon className={cn("w-4 h-4", checked ? iconColor : "text-stone-400")} />
          </div>
          <div>
            <div className="font-medium text-sm">{title}</div>
            <div className="text-xs text-text-muted">{description}</div>
          </div>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
      {children}
    </div>
  );
}
