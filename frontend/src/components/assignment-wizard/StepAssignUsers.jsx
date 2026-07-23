/**
 * Step 2: Assign Users
 * - For Organization Level: Multi-select users + Approval Workflow
 * - For Facility Level: Collapsible facility cards with per-facility assignment
 */

import React, { useState, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  X, 
  Search, 
  Users, 
  Factory,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  CheckSquare,
} from 'lucide-react';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
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

export function StepAssignUsers({
  form,
  facilities,
  users,
  expandedFacilities,
  toggleFacility,
  addUser,
  removeUser,
  addUserToFacility,
  removeUserFromFacility,
  updateFacilityAssignment,
  bulkAssignToFacilities,
  bulkEnableApproval,
  approvalWorkflowEnabled,
  multiLevelApprovalEnabled,
  updateForm,
  addApprover,
  removeApprover,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkUserId, setBulkUserId] = useState('');

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u => 
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Organization Level UI
  if (form.assignment_level !== 'facility') {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-text-primary">Select Assignees</h3>
          <p className="text-xs text-text-muted">
            Choose users who will be responsible for this category
          </p>
        </div>

        {/* Selected Users */}
        <div className="min-h-[44px] p-2 bg-stone-50 rounded-lg border">
          {form.assigned_user_ids.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {form.assigned_user_ids.map(id => {
                const user = users.find(u => u.id === id);
                if (!user) return null;
                return (
                  <Badge 
                    key={id} 
                    variant="secondary" 
                    className="flex items-center gap-1 pr-1"
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">
                      {(user.full_name || user.name || user.email)?.charAt(0)?.toUpperCase()}
                    </span>
                    <span className="text-xs">{user.full_name || user.name || user.email}</span>
                    <button
                      type="button"
                      onClick={() => removeUser(id)}
                      className="ml-1 p-0.5 hover:bg-stone-200 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-text-muted">No assignees selected</span>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* User List */}
        <div className="border rounded-lg max-h-48 overflow-y-auto">
          {filteredUsers
            .filter(u => !form.assigned_user_ids.includes(u.id))
            .map(user => (
              <UserRow 
                key={user.id} 
                user={user} 
                onClick={() => addUser(user.id)} 
              />
            ))}
          {filteredUsers.filter(u => !form.assigned_user_ids.includes(u.id)).length === 0 && (
            <div className="p-4 text-center text-text-muted text-sm">
              {searchQuery ? 'No users match your search' : 'All users have been assigned'}
            </div>
          )}
        </div>

        {/* Approval Workflow Section for Org Level */}
        {approvalWorkflowEnabled && (
          <ApprovalSection
            form={form}
            updateForm={updateForm}
            users={users}
            multiLevelApprovalEnabled={multiLevelApprovalEnabled}
            addApprover={addApprover}
            removeApprover={removeApprover}
          />
        )}
      </div>
    );
  }

  // Facility Level UI
  const assignedCount = Object.values(form.facility_assignments).filter(fa => fa?.user_ids?.length > 0).length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-text-primary">Assign Per Facility</h3>
        <p className="text-xs text-text-muted">
          Configure assignees for each facility. Expand a card to add users.
        </p>
      </div>

      {/* Bulk Actions Toolbar */}
      <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg border">
        <span className="text-xs text-text-muted whitespace-nowrap">Bulk actions:</span>
        <Select value={bulkUserId} onValueChange={setBulkUserId}>
          <SelectTrigger className="h-8 text-xs flex-1 max-w-[180px]">
            <SelectValue placeholder="Select user..." />
          </SelectTrigger>
          <SelectContent>
            {users.map(u => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name || u.name || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button 
          size="sm" 
          variant="outline" 
          className="h-8 text-xs"
          onClick={() => {
            bulkAssignToFacilities(bulkUserId);
            setBulkUserId('');
          }}
          disabled={!bulkUserId}
        >
          Assign to All
        </Button>
        {approvalWorkflowEnabled && (
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 text-xs"
            onClick={() => bulkEnableApproval(true)}
          >
            Enable All Approval
          </Button>
        )}
      </div>

      {/* Facility Cards */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {facilities.map(facility => (
          <FacilityCard
            key={facility.id}
            facility={facility}
            assignment={form.facility_assignments[facility.id]}
            isExpanded={expandedFacilities[facility.id]}
            onToggle={() => toggleFacility(facility.id)}
            users={users}
            onAddUser={(userId) => addUserToFacility(facility.id, facility.name, userId)}
            onRemoveUser={(userId) => removeUserFromFacility(facility.id, userId)}
            onUpdateAssignment={(updates) => updateFacilityAssignment(facility.id, facility.name, updates)}
            approvalWorkflowEnabled={approvalWorkflowEnabled}
          />
        ))}
      </div>

      {/* Assignment Summary */}
      <div className="flex items-center justify-between p-2 bg-emerald-50 rounded-lg border border-emerald-200">
        <span className="text-xs text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
          {assignedCount} of {facilities.length} facilities have assignees
        </span>
        {facilities.length - assignedCount > 0 && (
          <span className="text-xs text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            {facilities.length - assignedCount} unassigned
          </span>
        )}
      </div>
    </div>
  );
}

// User Row Component
function UserRow({ user, onClick }) {
  return (
    <div
      className="flex items-center gap-3 p-2.5 hover:bg-stone-50 cursor-pointer border-b last:border-b-0 transition-colors"
      onClick={onClick}
    >
      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-700">
        {(user.full_name || user.name || user.email)?.charAt(0)?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{user.full_name || user.name || 'No Name'}</div>
        <div className="text-xs text-text-muted truncate">{user.email}</div>
      </div>
      <Badge variant="outline" className="text-xs flex-shrink-0">{user.role}</Badge>
      <UserPlus className="w-4 h-4 text-stone-400" />
    </div>
  );
}

// Facility Card Component
function FacilityCard({
  facility,
  assignment,
  isExpanded,
  onToggle,
  users,
  onAddUser,
  onRemoveUser,
  onUpdateAssignment,
  approvalWorkflowEnabled,
}) {
  const assignedUsers = assignment?.user_ids || [];
  const hasAssignees = assignedUsers.length > 0;
  const requiresApproval = assignment?.requires_approval || false;

  return (
    <div className={cn(
      "border rounded-lg transition-all",
      hasAssignees ? "border-emerald-200 bg-white" : "border-stone-200 bg-stone-50/50"
    )}>
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
          hasAssignees ? "bg-emerald-100 text-emerald-600" : "bg-stone-100 text-stone-400"
        )}>
          <Factory className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{facility.name}</div>
          {facility.address && (
            <div className="text-xs text-text-muted truncate">{facility.address}</div>
          )}
        </div>

        {/* Quick Status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasAssignees ? (
            <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
              <Users className="w-3 h-3 mr-1" />
              {assignedUsers.length}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              No assignee
            </Badge>
          )}
          {requiresApproval && (
            <Badge variant="outline" className="text-xs text-violet-600 border-violet-300">
              Approval
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-stone-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-stone-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t">
          {/* Assigned Users */}
          <div className="pt-3">
            <Label className="text-xs text-text-muted">Assignees</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5 min-h-[32px] p-2 bg-stone-50 rounded border">
              {assignedUsers.length > 0 ? (
                assignedUsers.map(uid => {
                  const user = users.find(u => u.id === uid);
                  if (!user) return null;
                  return (
                    <Badge key={uid} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
                      {user.full_name || user.name || user.email}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveUser(uid);
                        }}
                        className="ml-1 p-0.5 hover:bg-stone-200 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })
              ) : (
                <span className="text-xs text-text-muted">No assignees yet</span>
              )}
            </div>
          </div>

          {/* Add User Select */}
          <Select
            value="__select__"
            onValueChange={(v) => {
              if (v && v !== '__select__') onAddUser(v);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="+ Add assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__select__" disabled>Select user...</SelectItem>
              {users
                .filter(u => !assignedUsers.includes(u.id))
                .map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.name || u.email}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Approval Toggle */}
          {approvalWorkflowEnabled && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`approval-${facility.id}`}
                  checked={requiresApproval}
                  onCheckedChange={(checked) => onUpdateAssignment({ requires_approval: checked })}
                />
                <Label htmlFor={`approval-${facility.id}`} className="text-xs cursor-pointer">
                  Requires approval
                </Label>
              </div>
              
              {requiresApproval && (
                <Select
                  value={assignment?.approver_id || '__none__'}
                  onValueChange={(v) => onUpdateAssignment({ approver_id: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger className="h-7 text-xs w-40">
                    <SelectValue placeholder="Select approver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select approver...</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// Approval Section Component for Org-Level
function ApprovalSection({ 
  form, 
  updateForm, 
  users, 
  multiLevelApprovalEnabled,
  addApprover,
  removeApprover,
}) {
  return (
    <div className={cn(
      "p-4 rounded-lg border transition-all",
      form.requires_approval ? "bg-violet-50 border-violet-200" : "bg-stone-50 border-stone-200"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            form.requires_approval ? "bg-white" : "bg-stone-100"
          )}>
            <CheckSquare className={cn(
              "w-4 h-4", 
              form.requires_approval ? "text-violet-600" : "text-stone-400"
            )} />
          </div>
          <div>
            <div className="font-medium text-sm">Approval Workflow</div>
            <div className="text-xs text-text-muted">
              {multiLevelApprovalEnabled 
                ? "Multi-level manager approval before completion" 
                : "Manager approval before completion"}
            </div>
          </div>
        </div>
        <Switch
          checked={form.requires_approval}
          onCheckedChange={(checked) => updateForm({ 
            requires_approval: checked,
            approver_id: '',
            approval_chain: [],
          })}
        />
      </div>

      {/* Single-level approval */}
      {form.requires_approval && !multiLevelApprovalEnabled && (
        <div className="mt-3 pt-3 border-t border-violet-200">
          <Label className="text-xs text-text-muted">Select Approver *</Label>
          <Select 
            value={form.approver_id} 
            onValueChange={(v) => updateForm({ approver_id: v })}
          >
            <SelectTrigger className="h-8 mt-1">
              <SelectValue placeholder="Choose approver..." />
            </SelectTrigger>
            <SelectContent>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Multi-level approval chain */}
      {form.requires_approval && multiLevelApprovalEnabled && (
        <div className="mt-3 pt-3 border-t border-violet-200 space-y-2">
          <Label className="text-xs text-text-muted">Approval Chain (in order) *</Label>
          {form.approval_chain.length > 0 && (
            <div className="space-y-1">
              {form.approval_chain.map((approverId, index) => {
                const approver = users.find(u => u.id === approverId);
                return (
                  <div key={approverId} className="flex items-center gap-2 p-2 bg-white rounded border">
                    <Badge variant="outline" className="text-xs bg-violet-100 text-violet-700">
                      L{index + 1}
                    </Badge>
                    <span className="text-xs flex-1">{approver?.full_name || approver?.email}</span>
                    <button
                      type="button"
                      onClick={() => removeApprover(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <Select 
            value="" 
            onValueChange={(v) => v && addApprover(v)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder={`+ Add Level ${form.approval_chain.length + 1} Approver`} />
            </SelectTrigger>
            <SelectContent>
              {users
                .filter(u => !form.approval_chain.includes(u.id))
                .map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.name || u.email}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
