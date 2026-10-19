/**
 * Step 4: Review & Confirm
 * Shows a comprehensive summary of the assignment before submission
 */

import React from 'react';
import { 
  Building2, 
  Factory, 
  Users, 
  Calendar, 
  Clock, 
  Bell, 
  CheckSquare,
  AlertTriangle,
  FileText,
  Layers,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { FREQUENCIES, TIMEZONES } from './useAssignmentWizard';

export function StepReview({ form, summary, facilities, users }) {
  const frequencyLabel = FREQUENCIES.find(f => f.value === form.filling_frequency)?.label || form.filling_frequency;
  const timezoneLabel = TIMEZONES.find(tz => tz.value === form.timezone)?.label || form.timezone;

  return (
    <div className="space-y-4">
      {/* Header Summary Card */}
      <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-emerald-800">{summary.category}</div>
            {summary.subcategory && (
              <div className="text-sm text-emerald-600">{summary.subcategory}</div>
            )}
            {summary.subSubcategory && (
              <div className="text-xs text-emerald-500">{summary.subSubcategory}</div>
            )}
          </div>
          <Badge className={cn(
            "text-xs",
            summary.isFacilityLevel 
              ? "bg-orange-100 text-orange-700" 
              : "bg-blue-100 text-blue-700"
          )}>
            {summary.isFacilityLevel ? 'Facility Level' : 'Organization Level'}
          </Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={summary.isFacilityLevel ? Factory : Building2}
          label={summary.isFacilityLevel ? "Facilities" : "Scope"}
          value={summary.isFacilityLevel ? `${summary.assignedFacilities}/${summary.totalFacilities}` : "Organization"}
          color="blue"
        />
        <StatCard
          icon={Users}
          label="Users"
          value={summary.totalUsers}
          color="emerald"
        />
        <StatCard
          icon={FileText}
          label="Expected Tasks"
          value={summary.expectedTasks}
          color="violet"
        />
      </div>

      {/* Warnings */}
      {summary.facilitiesWithoutAssignee.length > 0 && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-800">
                {summary.facilitiesWithoutAssignee.length} facilities without assignees
              </div>
              <div className="text-xs text-amber-600 mt-1">
                {summary.facilitiesWithoutAssignee.slice(0, 3).join(', ')}
                {summary.facilitiesWithoutAssignee.length > 3 && ` +${summary.facilitiesWithoutAssignee.length - 3} more`}
              </div>
              <div className="text-xs text-amber-700 mt-1">
                These facilities will not receive tasks.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Sections */}
      <div className="space-y-3">
        {/* Schedule Section */}
        <DetailSection title="Schedule" icon={Calendar}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <DetailRow label="Start Date" value={formatDate(form.start_date)} />
            <DetailRow label="End Date" value={formatDate(form.end_date) || 'Not set'} />
            <DetailRow label="Frequency" value={frequencyLabel} />
            <DetailRow label="Periods" value={`${summary.periodsCount} ${form.filling_frequency || 'periods'}`} />
          </div>
        </DetailSection>

        {/* Due Schedule Section */}
        <DetailSection title="Due Schedule" icon={Clock}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(form.filling_frequency) && (
              <DetailRow label="Day of Month" value={`${form.due_day_of_month}${getOrdinalSuffix(form.due_day_of_month)}`} />
            )}
            {form.filling_frequency === 'weekly' && (
              <DetailRow label="Day of Week" value={capitalizeFirst(form.due_day_of_week)} />
            )}
            <DetailRow label="Due Time" value={formatTime(form.due_time)} />
            <DetailRow label="Timezone" value={timezoneLabel} />
          </div>
        </DetailSection>

        {/* Options Section */}
        <DetailSection title="Options" icon={Bell}>
          <div className="flex flex-wrap gap-2">
            <OptionBadge 
              enabled={summary.hasReminders} 
              label="Reminders" 
              detail={form.reminder_enabled ? form.reminder_frequency : null}
            />
            <OptionBadge 
              enabled={summary.hasApproval} 
              label="Approval" 
              detail={form.requires_approval && form.approval_chain.length > 0 
                ? `${form.approval_chain.length} levels` 
                : null}
            />
          </div>
        </DetailSection>

        {/* Assignees Section (for facility level) */}
        {summary.isFacilityLevel && (
          <DetailSection title="Facility Assignments" icon={Factory}>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {facilities.map(fac => {
                const assignment = form.facility_assignments[fac.id];
                const userIds = assignment?.user_ids || [];
                
                return (
                  <div key={fac.id} className="flex items-center justify-between text-sm">
                    <span className={cn(
                      userIds.length > 0 ? "text-text-primary" : "text-text-muted"
                    )}>
                      {fac.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {userIds.length > 0 ? (
                        <>
                          <Badge variant="secondary" className="text-xs">
                            {userIds.length} user{userIds.length !== 1 ? 's' : ''}
                          </Badge>
                          {assignment?.requires_approval && (
                            <Badge variant="outline" className="text-xs text-violet-600">
                              Approval
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-amber-600">No assignee</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </DetailSection>
        )}

        {/* Assignees Section (for org level) */}
        {!summary.isFacilityLevel && form.assigned_user_ids.length > 0 && (
          <DetailSection title="Assignees" icon={Users}>
            <div className="flex flex-wrap gap-1.5">
              {form.assigned_user_ids.map(id => {
                const user = users.find(u => u.id === id);
                if (!user) return null;
                return (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {user.full_name || user.name || user.email}
                  </Badge>
                );
              })}
            </div>
          </DetailSection>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
  };

  return (
    <div className={cn("p-3 rounded-lg border text-center", colors[color])}>
      <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

// Detail Section Component
function DetailSection({ title, icon: Icon, children }) {
  return (
    <div className="p-3 bg-stone-50 rounded-lg border">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-stone-500" />
        <span className="text-xs font-medium text-stone-600 uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

// Detail Row Component
function DetailRow({ label, value }) {
  return (
    <>
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </>
  );
}

// Option Badge Component
function OptionBadge({ enabled, label, detail }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
      enabled 
        ? "bg-emerald-100 text-emerald-700" 
        : "bg-stone-100 text-stone-500"
    )}>
      <div className={cn(
        "w-2 h-2 rounded-full",
        enabled ? "bg-emerald-500" : "bg-stone-300"
      )} />
      <span>{label}</span>
      {detail && <span className="opacity-70">({detail})</span>}
    </div>
  );
}

// Helpers
function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
