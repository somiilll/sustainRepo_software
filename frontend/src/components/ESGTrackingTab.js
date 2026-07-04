/**
 * ESG Tracking Tab Component
 * 
 * Provides a comprehensive "ESG Control Center" for admins to:
 * - Monitor disclosure completion
 * - Assign/reassign questions to multiple users
 * - Track pending items
 * - Send reminders
 * - Monitor framework readiness
 * 
 * Admin-only component.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { Checkbox } from './ui/checkbox';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { toast } from 'sonner';
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Bell,
  UserPlus,
  Filter,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  XCircle,
  X,
  ClipboardList,
  BarChart3,
} from 'lucide-react';
import { 
  generateReportingYears, 
  getCurrentReportingYear 
} from '../utils/reportingYearUtils';
import MyTasks from './MyTasks';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Status colors
const STATUS_COLORS = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  not_started: 'bg-stone-100 text-stone-600 border-stone-200',
  stale: 'bg-amber-100 text-amber-700 border-amber-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
};

// Get status badge
const StatusBadge = ({ status, isOverdue, isStale, isDueSoon }) => {
  if (isOverdue) {
    return (
      <Badge className={`${STATUS_COLORS.overdue} text-xs`}>
        <XCircle className="w-3 h-3 mr-1" /> Overdue
      </Badge>
    );
  }
  if (isStale) {
    return (
      <Badge className={`${STATUS_COLORS.stale} text-xs`}>
        <AlertCircle className="w-3 h-3 mr-1" /> Stale
      </Badge>
    );
  }
  if (isDueSoon) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
        <Clock className="w-3 h-3 mr-1" /> Due Soon
      </Badge>
    );
  }
  
  const statusMap = {
    completed: { icon: CheckCircle2, label: 'Completed' },
    in_progress: { icon: Clock, label: 'In Progress' },
    not_started: { icon: Circle, label: 'Not Started' },
  };
  
  const config = statusMap[status] || statusMap.not_started;
  const Icon = config.icon;
  
  return (
    <Badge className={`${STATUS_COLORS[status] || STATUS_COLORS.not_started} text-xs`}>
      <Icon className="w-3 h-3 mr-1" /> {config.label}
    </Badge>
  );
};

// Multi-select user component
const MultiUserSelect = ({ users, selectedUserIds, onChange, label }) => {
  const toggleUser = (userId) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter(id => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="border rounded-lg max-h-48 overflow-y-auto">
        {users.map(user => (
          <div 
            key={user.id}
            className="flex items-center gap-3 p-2 hover:bg-stone-50 cursor-pointer border-b last:border-b-0"
            onClick={() => toggleUser(user.id)}
          >
            <Checkbox 
              checked={selectedUserIds.includes(user.id)}
              onCheckedChange={() => toggleUser(user.id)}
            />
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-700">
              {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">{user.name || 'No Name'}</div>
              <div className="text-xs text-text-muted">{user.email}</div>
            </div>
            <Badge variant="outline" className="text-xs">{user.role}</Badge>
          </div>
        ))}
      </div>
      {selectedUserIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedUserIds.map(id => {
            const user = users.find(u => u.id === id);
            return user ? (
              <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                {user.name || user.email}
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-red-500" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(selectedUserIds.filter(uid => uid !== id));
                  }}
                />
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
};

// Expandable text component for long questions
const ExpandableText = ({ text, maxLength = 150 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!text || text.length <= maxLength) {
    return <span>{text}</span>;
  }
  
  return (
    <div className="space-y-1">
      <span>
        {isExpanded ? text : `${text.substring(0, maxLength)}...`}
      </span>
      <button 
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-emerald-600 hover:text-emerald-700 text-xs font-medium flex items-center gap-1 mt-1"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-3 h-3" /> Read less
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" /> Read more
          </>
        )}
      </button>
    </div>
  );
};

/**
 * Main ESG Tracking Tab Component
 * 
 * @param {string} domain - 'environment' | 'social' | 'governance'
 * @param {string} reportingPeriodOverride - If provided, use this instead of internal state
 * @param {boolean} hideReportingPeriodSelector - Hide the period selector (when used in TrackingModule)
 * @param {string} frameworkFilter - Optional framework to filter by (e.g., 'BRSR', 'GRI')
 */
export default function ESGTrackingTab({ 
  domain = 'environment',
  reportingPeriodOverride = null,
  hideReportingPeriodSelector = false,
  frameworkFilter = null
}) {
  const { getAuthHeader, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  // State
  const [loading, setLoading] = useState(true);
  const [internalReportingPeriod, setInternalReportingPeriod] = useState(() => getCurrentReportingYear('financial_year'));
  const [frameworkSummary, setFrameworkSummary] = useState(null);
  const [selectedFramework, setSelectedFramework] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [disclosures, setDisclosures] = useState([]);
  const [sectionSummary, setSectionSummary] = useState(null);
  
  // Use override if provided, otherwise use internal state
  const reportingPeriod = reportingPeriodOverride || internalReportingPeriod;
  const setReportingPeriod = reportingPeriodOverride ? () => {} : setInternalReportingPeriod;
  
  // Feature flags
  const [multiLevelApprovalEnabled, setMultiLevelApprovalEnabled] = useState(false);
  const [approvalWorkflowEnabled, setApprovalWorkflowEnabled] = useState(false);
  
  // Filter state
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAssigned, setFilterAssigned] = useState('all');
  
  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningItem, setAssigningItem] = useState(null); // Can be disclosure, section, or { bulk: true }
  const [orgUsers, setOrgUsers] = useState([]);
  const [assignForm, setAssignForm] = useState({
    assigned_user_ids: [],
    due_date: '',
    filling_frequency: '',
    reminder_enabled: false,
    reminder_frequency: '',
    requires_approval: false,
    approver_id: '',  // Single-level approval
    approval_chain: [], // Multi-level approval: ordered list of approver user IDs
  });
  const [assigning, setAssigning] = useState(false);
  
  // Reminder state
  const [sendingReminder, setSendingReminder] = useState(null);
  
  // Year options
  const yearOptions = generateReportingYears('financial_year', 5);
  
  // Get admins from org users for approver dropdown
  const adminUsers = orgUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
  
  // Fetch framework summary
  const fetchFrameworkSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${API}/tracking/${domain}/frameworks?reporting_period=${encodeURIComponent(reportingPeriod)}`,
        { headers: getAuthHeader() }
      );
      
      let frameworks = res.data.frameworks || [];
      
      // If frameworkFilter is provided, filter to only that framework
      if (frameworkFilter) {
        frameworks = frameworks.filter(
          fw => fw.framework_id?.toLowerCase() === frameworkFilter.toLowerCase()
        );
      }
      
      setFrameworkSummary({ ...res.data, frameworks });
      
      // Auto-select first (or only) matching framework
      if (frameworks.length >= 1) {
        setSelectedFramework(frameworks[0]);
      }
    } catch (error) {
      console.error('Failed to fetch framework summary:', error);
      toast.error('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }, [domain, reportingPeriod, getAuthHeader, frameworkFilter]);
  
  // Fetch sections for selected framework
  const fetchSections = useCallback(async (framework) => {
    if (!framework) return;
    
    try {
      const res = await axios.get(
        `${API}/tracking/${domain}/frameworks/${framework.framework_id}/sections?reporting_period=${encodeURIComponent(reportingPeriod)}`,
        { headers: getAuthHeader() }
      );
      setSections(res.data.sections || []);
    } catch (error) {
      console.error('Failed to fetch sections:', error);
    }
  }, [domain, reportingPeriod, getAuthHeader]);
  
  // Fetch disclosures for selected section
  const fetchDisclosures = useCallback(async (framework, section) => {
    if (!framework || !section) return;
    
    try {
      let url = `${API}/tracking/${domain}/frameworks/${framework.framework_id}/sections/${section.section_id}?reporting_period=${encodeURIComponent(reportingPeriod)}`;
      
      // Apply filters
      if (filterStatus !== 'all') {
        if (filterStatus === 'overdue') url += '&is_overdue=true';
        else if (filterStatus === 'stale') url += '&is_stale=true';
        else if (filterStatus === 'due_soon') url += '&is_due_soon=true';
        else url += `&status=${filterStatus}`;
      }
      if (filterAssigned === 'unassigned') url += '&is_unassigned=true';
      
      const res = await axios.get(url, { headers: getAuthHeader() });
      setDisclosures(res.data.disclosures || []);
      setSectionSummary(res.data.section);
    } catch (error) {
      console.error('Failed to fetch disclosures:', error);
    }
  }, [domain, reportingPeriod, filterStatus, filterAssigned, getAuthHeader]);
  
  // Fetch org users for assignment
  const fetchOrgUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/tracking/users`, { headers: getAuthHeader() });
      setOrgUsers(res.data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, [getAuthHeader]);
  
  // Fetch org module config (feature flags)
  const fetchModuleConfig = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/organization/module-config`, { headers: getAuthHeader() });
      setMultiLevelApprovalEnabled(res.data.multi_level_approval_enabled || false);
      setApprovalWorkflowEnabled(res.data.approval_workflow_enabled || false);
    } catch (error) {
      console.error('Failed to fetch module config:', error);
    }
  }, [getAuthHeader]);
  
  // Effects
  useEffect(() => {
    fetchFrameworkSummary();
  }, [fetchFrameworkSummary]);
  
  useEffect(() => {
    if (selectedFramework) {
      fetchSections(selectedFramework);
    }
  }, [selectedFramework, fetchSections]);
  
  useEffect(() => {
    if (selectedFramework && selectedSection) {
      fetchDisclosures(selectedFramework, selectedSection);
    }
  }, [selectedFramework, selectedSection, fetchDisclosures, filterStatus, filterAssigned]);
  
  useEffect(() => {
    if (isAdmin) {
      fetchOrgUsers();
      fetchModuleConfig();
    }
  }, [isAdmin, fetchOrgUsers, fetchModuleConfig]);
  
  // Reset form when modal closes
  const resetAssignForm = () => {
    setAssignForm({
      assigned_user_ids: [],
      due_date: '',
      filling_frequency: '',
      reminder_enabled: false,
      reminder_frequency: '',
      requires_approval: false,
      approver_id: '',
      approval_chain: [],
    });
    setAssigningItem(null);
  };
  
  // Handle assignment (supports multiple users)
  const handleAssign = async () => {
    if (assignForm.assigned_user_ids.length === 0) {
      toast.error('Please select at least one user');
      return;
    }
    
    if (assignForm.requires_approval) {
      if (multiLevelApprovalEnabled && assignForm.approval_chain.length === 0) {
        toast.error('Please add at least one approver to the approval chain');
        return;
      }
      if (!multiLevelApprovalEnabled && approvalWorkflowEnabled && !assignForm.approver_id) {
        toast.error('Please select an approver');
        return;
      }
    }
    
    if (assignForm.reminder_enabled && !assignForm.reminder_frequency) {
      toast.error('Please select a reminder frequency');
      return;
    }
    
    setAssigning(true);
    try {
      // Create assignment for each selected user
      let totalCreated = 0;
      let totalSkipped = 0;
      let totalUpdated = 0;
      
      for (const userId of assignForm.assigned_user_ids) {
        // Build approval chain based on enabled feature
        let approvalChain = null;
        if (assignForm.requires_approval) {
          if (multiLevelApprovalEnabled && assignForm.approval_chain.length > 0) {
            approvalChain = assignForm.approval_chain;
          } else if (approvalWorkflowEnabled && assignForm.approver_id) {
            // Single-level approval: convert to chain with one approver
            approvalChain = [assignForm.approver_id];
          }
        }
        
        const payload = {
          framework_id: selectedFramework.framework_id,
          assigned_to_user_id: userId,
          due_date: assignForm.due_date || null,
          filling_frequency: assignForm.filling_frequency || null,
          reminder_enabled: assignForm.reminder_enabled,
          reminder_frequency: assignForm.reminder_frequency || null,
          requires_approval: assignForm.requires_approval,
          // Multi-level approval chain (ordered list of approver user IDs)
          approval_chain: approvalChain,
          skip_already_assigned: true,
        };
        
        // If assigning a specific question
        if (assigningItem?.disclosure_id) {
          payload.disclosure_ids = [assigningItem.disclosure_id];
          payload.skip_already_assigned = false;
        }
        // If assigning a whole section
        else if (assigningItem?.section_id) {
          payload.section_id = assigningItem.section_id;
        }
        // If bulk assigning remaining
        else if (assigningItem?.bulk) {
          payload.section_id = selectedSection?.section_id;
        }
        
        const res = await axios.post(
          `${API}/tracking/${domain}/assign?reporting_period=${encodeURIComponent(reportingPeriod)}`,
          payload,
          { headers: getAuthHeader() }
        );
        
        totalCreated += res.data.created_count || 0;
        totalSkipped += res.data.skipped_count || 0;
        totalUpdated += res.data.updated_count || 0;
      }
      
      const messages = [];
      if (totalCreated > 0) messages.push(`${totalCreated} assigned`);
      if (totalUpdated > 0) messages.push(`${totalUpdated} reassigned`);
      if (totalSkipped > 0) messages.push(`${totalSkipped} skipped`);
      
      toast.success(`Questions: ${messages.join(', ')} to ${assignForm.assigned_user_ids.length} user(s)`);
      setAssignModalOpen(false);
      resetAssignForm();
      
      // Refresh data
      if (selectedSection) {
        fetchDisclosures(selectedFramework, selectedSection);
      }
      fetchSections(selectedFramework);
      fetchFrameworkSummary();
    } catch (error) {
      console.error('Failed to assign:', error);
      toast.error(error.response?.data?.detail || 'Failed to assign questions');
    } finally {
      setAssigning(false);
    }
  };
  
  // Handle send reminder
  const handleSendReminder = async (disclosure) => {
    if (!disclosure.is_assigned) {
      toast.error('Question is not assigned');
      return;
    }
    
    setSendingReminder(disclosure.disclosure_id);
    try {
      await axios.post(
        `${API}/tracking/${domain}/send-reminder`,
        {
          disclosure_id: disclosure.disclosure_id,
        },
        { headers: getAuthHeader() }
      );
      
      toast.success(`Reminder sent to ${disclosure.assigned_to_user_name || disclosure.assigned_to_user_email}`);
    } catch (error) {
      console.error('Failed to send reminder:', error);
      toast.error(error.response?.data?.detail || 'Failed to send reminder');
    } finally {
      setSendingReminder(null);
    }
  };
  
  // Open assign modal for section
  const openAssignSectionModal = (section) => {
    setAssigningItem({ ...section, isSection: true });
    prefillAssignForm(section);
    setAssignModalOpen(true);
  };
  
  // Pre-fill form with existing assignment data
  const prefillAssignForm = (item) => {
    if (!item) return;
    
    // Format due date for input field (needs YYYY-MM-DD format)
    let formattedDueDate = '';
    if (item.due_date) {
      try {
        const date = new Date(item.due_date);
        if (!isNaN(date.getTime())) {
          formattedDueDate = date.toISOString().split('T')[0];
        }
      } catch (e) {
        formattedDueDate = '';
      }
    }
    
    setAssignForm({
      assigned_user_ids: item.assigned_to_user_id ? [item.assigned_to_user_id] : [],
      due_date: formattedDueDate,
      filling_frequency: item.filling_frequency || '',
      reminder_enabled: !!(item.reminder_enabled || item.last_reminder_sent_at),
      reminder_frequency: item.reminder_frequency || '',
      requires_approval: item.requires_approval || false,
      approver_id: item.approver_id || '',
      approval_chain: item.approval_chain || [],
    });
  };
  
  // Open assign modal for disclosure with pre-fill
  const openAssignDisclosureModal = (disc) => {
    setAssigningItem(disc);
    prefillAssignForm(disc);
    setAssignModalOpen(true);
  };
  
  if (!isAdmin) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">Admin Access Required</h3>
        <p className="text-text-muted">The Tracking module is only available to administrators.</p>
      </Card>
    );
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header Controls - Hide period selector if managed by parent */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {!hideReportingPeriodSelector && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Reporting Period:</Label>
              <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
                <SelectTrigger className="w-40 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            fetchFrameworkSummary();
            if (selectedFramework) fetchSections(selectedFramework);
            if (selectedSection) fetchDisclosures(selectedFramework, selectedSection);
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>
      
      {/* Framework Summary Cards */}
      {frameworkSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {frameworkSummary.frameworks.map(fw => (
            <Card 
              key={fw.framework_id}
              data-testid={`framework-card-${fw.framework_id}`}
              className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                selectedFramework?.framework_id === fw.framework_id 
                  ? 'ring-2 ring-emerald-500 border-emerald-200' 
                  : 'hover:border-emerald-200'
              }`}
              onClick={() => {
                setSelectedFramework(fw);
                setSelectedSection(null);
                setDisclosures([]);
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">{fw.framework_name}</h3>
                <Badge variant="outline" className="text-xs">
                  {fw.completion_percentage}% Complete
                </Badge>
              </div>
              
              <Progress value={fw.completion_percentage} className="h-2 mb-4" />
              
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-stone-50 rounded p-2">
                  <div className="font-semibold text-text-primary">{fw.total_disclosures}</div>
                  <div className="text-text-muted">Total</div>
                </div>
                <div className="bg-emerald-50 rounded p-2">
                  <div className="font-semibold text-emerald-700">{fw.completed_disclosures}</div>
                  <div className="text-emerald-600">Done</div>
                </div>
                <div className="bg-amber-50 rounded p-2">
                  <div className="font-semibold text-amber-700">{fw.pending_disclosures}</div>
                  <div className="text-amber-600">Pending</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs text-text-muted">
                <div className="flex items-center gap-4">
                  {fw.overdue_count > 0 && (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {fw.overdue_count} overdue
                    </span>
                  )}
                  {fw.unassigned_disclosures > 0 && (
                    <span className="text-stone-500 flex items-center gap-1">
                      <Users className="w-3 h-3" /> {fw.unassigned_disclosures} unassigned
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4" />
              </div>
            </Card>
          ))}
        </div>
      )}
      
      {/* Sections View - One section per row */}
      {selectedFramework && sections.length > 0 && !selectedSection && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedFramework(null)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {selectedFramework.framework_name} Sections
            </h3>
            <Badge variant="outline">
              {sections.length} sections
            </Badge>
          </div>
          
          {/* Changed to single column layout */}
          <div className="flex flex-col gap-3">
            {sections.map(section => (
              <Card 
                key={section.section_id}
                data-testid={`section-card-${section.section_id}`}
                className="p-4 hover:shadow-md hover:border-emerald-200 transition-all"
              >
                <div className="flex items-center gap-4">
                  {/* Section info - clickable */}
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => setSelectedSection(section)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-base">{section.section_name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {section.completion_percentage}%
                      </Badge>
                    </div>
                    
                    <Progress value={section.completion_percentage} className="h-1.5 mb-3" />
                    
                    <div className="flex items-center gap-4 text-xs text-text-muted">
                      <span>{section.total_disclosures} questions</span>
                      <span className="text-emerald-600">{section.completed_disclosures} done</span>
                      {section.overdue_count > 0 && (
                        <span className="text-red-600">{section.overdue_count} overdue</span>
                      )}
                      {section.assigned_users?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> 
                          {section.assigned_users.map(u => u.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAssignSectionModal(section);
                      }}
                    >
                      <UserPlus className="w-4 h-4 mr-1" /> Assign Section
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedSection(section)}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}
      
      {/* Questions View (renamed from Disclosures) */}
      {selectedSection && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedSection(null)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {selectedSection.section_name} Questions
            </h3>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setAssigningItem({ bulk: true });
                  setAssignModalOpen(true);
                }}
              >
                <UserPlus className="w-4 h-4 mr-2" /> Assign Remaining
              </Button>
            </div>
          </div>
          
          {/* Section Summary */}
          {sectionSummary && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4 p-3 bg-stone-50 rounded-lg">
              <div className="text-center">
                <div className="font-semibold text-lg">{sectionSummary.total_disclosures}</div>
                <div className="text-xs text-text-muted">Total</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-emerald-600">{sectionSummary.completed_disclosures}</div>
                <div className="text-xs text-text-muted">Completed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-blue-600">{sectionSummary.assigned_count}</div>
                <div className="text-xs text-text-muted">Assigned</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-stone-500">{sectionSummary.unassigned_count}</div>
                <div className="text-xs text-text-muted">Unassigned</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-red-600">{sectionSummary.overdue_count}</div>
                <div className="text-xs text-text-muted">Overdue</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-amber-600">{sectionSummary.stale_count}</div>
                <div className="text-xs text-text-muted">Stale</div>
              </div>
            </div>
          )}
          
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-text-muted" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="stale">Stale</SelectItem>
                  <SelectItem value="due_soon">Due Soon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={filterAssigned} onValueChange={setFilterAssigned}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue placeholder="Assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Questions Table (renamed from Disclosures) */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="w-[45%]">Question</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disclosures.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-text-muted">
                      No questions found matching filters
                    </TableCell>
                  </TableRow>
                ) : (
                  disclosures.map(disc => (
                    <TableRow key={disc.disclosure_id} className="hover:bg-stone-50">
                      <TableCell>
                        {/* Show question text with tooltip for full text */}
                        <div 
                          className="font-medium text-sm line-clamp-2 cursor-help"
                          title={disc.disclosure_name}
                        >
                          {disc.disclosure_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge 
                          status={disc.completion_status}
                          isOverdue={disc.is_overdue}
                          isStale={disc.is_stale}
                          isDueSoon={disc.is_due_soon}
                        />
                      </TableCell>
                      <TableCell>
                        {disc.is_assigned ? (
                          <div className="text-sm">
                            <div className="font-medium">{disc.assigned_to_user_name || 'Unknown'}</div>
                            {disc.assigned_to_user_email && (
                              <div className="text-xs text-text-muted">{disc.assigned_to_user_email}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {disc.due_date ? (
                          <div className="text-sm">
                            <div>{new Date(disc.due_date).toLocaleDateString()}</div>
                            {disc.days_until_due !== null && (
                              <div className={`text-xs ${disc.days_until_due < 0 ? 'text-red-600' : disc.days_until_due <= 7 ? 'text-amber-600' : 'text-text-muted'}`}>
                                {disc.days_until_due < 0 
                                  ? `${Math.abs(disc.days_until_due)} days overdue`
                                  : disc.days_until_due === 0 
                                    ? 'Due today'
                                    : `${disc.days_until_due} days left`
                                }
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">No deadline</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {disc.is_assigned ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSendReminder(disc)}
                                disabled={sendingReminder === disc.disclosure_id}
                                title="Send Reminder"
                              >
                                {sendingReminder === disc.disclosure_id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Bell className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openAssignDisclosureModal(disc)}
                                title="Reassign"
                              >
                                <Users className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAssignDisclosureModal(disc)}
                            >
                              <UserPlus className="w-4 h-4 mr-1" /> Assign
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      
      {/* Assignment Modal */}
      <Dialog open={assignModalOpen} onOpenChange={(open) => {
        setAssignModalOpen(open);
        if (!open) resetAssignForm();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {assigningItem?.bulk 
                ? 'Assign Remaining Questions' 
                : assigningItem?.isSection
                  ? `Assign Section: ${assigningItem.section_name}`
                  : assigningItem?.is_assigned 
                    ? 'Reassign Question' 
                    : 'Assign Question'
              }
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-text-muted">
                {assigningItem?.bulk 
                  ? `Assign all unassigned questions in ${selectedSection?.section_name}`
                  : assigningItem?.isSection
                    ? `Assign all questions in ${assigningItem.section_name} to selected users`
                    : (
                      <div className="space-y-2">
                        <span>Assign the following question to users:</span>
                        <div className="p-3 bg-stone-50 rounded-lg border text-text-primary mt-2">
                          <ExpandableText text={assigningItem?.disclosure_name} maxLength={120} />
                        </div>
                      </div>
                    )
                }
              </div>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Multi-user selection */}
            <MultiUserSelect
              users={orgUsers}
              selectedUserIds={assignForm.assigned_user_ids}
              onChange={(ids) => setAssignForm({...assignForm, assigned_user_ids: ids})}
              label="Assign To *"
            />
            
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={assignForm.due_date}
                onChange={(e) => setAssignForm({...assignForm, due_date: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Filling Frequency</Label>
              <Select 
                value={assignForm.filling_frequency} 
                onValueChange={(v) => setAssignForm({...assignForm, filling_frequency: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One Time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="half_yearly">Half Yearly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Reminder Settings */}
            <div className="space-y-3 p-3 border rounded-lg bg-stone-50">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="reminder_enabled"
                  checked={assignForm.reminder_enabled}
                  onCheckedChange={(checked) => setAssignForm({
                    ...assignForm, 
                    reminder_enabled: checked,
                    reminder_frequency: checked ? assignForm.reminder_frequency : ''
                  })}
                />
                <Label htmlFor="reminder_enabled" className="text-sm cursor-pointer">
                  Enable reminders
                </Label>
              </div>
              
              {assignForm.reminder_enabled && (
                <div className="space-y-2 mt-2">
                  <Label className="text-sm">Reminder Frequency *</Label>
                  <Select 
                    value={assignForm.reminder_frequency} 
                    onValueChange={(v) => setAssignForm({...assignForm, reminder_frequency: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reminder frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            {/* Approval Settings - Show if either approval workflow or multi-level is enabled */}
            {(approvalWorkflowEnabled || multiLevelApprovalEnabled) && (
              <div className="space-y-3 p-3 border rounded-lg bg-violet-50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="requires_approval"
                    checked={assignForm.requires_approval}
                    onCheckedChange={(checked) => setAssignForm({
                      ...assignForm, 
                      requires_approval: checked,
                      approver_id: checked ? assignForm.approver_id : '',
                      approval_chain: checked ? assignForm.approval_chain : []
                    })}
                  />
                  <Label htmlFor="requires_approval" className="text-sm cursor-pointer">
                    {multiLevelApprovalEnabled 
                      ? 'Requires multi-level approval before finalization'
                      : 'Requires approval before finalization'
                    }
                  </Label>
                </div>
                
                {/* Single-level approval - show when only approval_workflow_enabled */}
                {assignForm.requires_approval && !multiLevelApprovalEnabled && approvalWorkflowEnabled && (
                  <div className="space-y-2 mt-3">
                    <Label className="text-sm">Select Approver *</Label>
                    <Select 
                      value={assignForm.approver_id} 
                      onValueChange={(v) => setAssignForm({...assignForm, approver_id: v})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select approver" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgUsers.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-xs font-medium text-violet-700">
                                {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
                              </div>
                              <div>
                                <span className="font-medium">{user.name || user.email}</span>
                                <span className="text-xs text-text-muted ml-2">({user.role})</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Multi-level approval chain builder - show when multi_level_approval_enabled */}
                {assignForm.requires_approval && multiLevelApprovalEnabled && (
                  <div className="space-y-3 mt-3">
                    <Label className="text-sm">Approval Chain * <span className="text-xs text-text-muted">(in order)</span></Label>
                    
                    {/* Current approval chain */}
                    {assignForm.approval_chain.length > 0 && (
                      <div className="space-y-2">
                        {assignForm.approval_chain.map((approverId, index) => {
                          const approver = orgUsers.find(u => u.id === approverId);
                          return (
                            <div key={approverId} className="flex items-center gap-2 p-2 bg-white rounded border">
                              <Badge variant="outline" className="bg-violet-100 text-violet-700">
                                Level {index + 1}
                              </Badge>
                              <div className="flex-1 flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-violet-200 flex items-center justify-center text-xs font-medium text-violet-700">
                                  {approver?.name?.charAt(0) || '?'}
                                </div>
                                <span className="text-sm font-medium">{approver?.name || approver?.email || 'Unknown'}</span>
                                <span className="text-xs text-text-muted">({approver?.role})</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newChain = assignForm.approval_chain.filter((_, i) => i !== index);
                                  setAssignForm({...assignForm, approval_chain: newChain});
                                }}
                              >
                                <X className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Add approver dropdown */}
                    <Select 
                      value="" 
                      onValueChange={(userId) => {
                        if (userId && !assignForm.approval_chain.includes(userId)) {
                        setAssignForm({
                          ...assignForm, 
                          approval_chain: [...assignForm.approval_chain, userId]
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Add Level ${assignForm.approval_chain.length + 1} Approver`} />
                    </SelectTrigger>
                    <SelectContent>
                      {orgUsers
                        .filter(u => !assignForm.approval_chain.includes(u.id))
                        .map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-xs font-medium">
                                {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
                              </div>
                              <div>
                                <span className="font-medium">{user.name || user.email}</span>
                                <span className="text-xs text-text-muted ml-2">({user.role})</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  
                  {assignForm.approval_chain.length === 0 && (
                    <p className="text-xs text-text-muted">Add approvers in the order they should review (e.g., Manager → Director → VP)</p>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAssignModalOpen(false);
              resetAssignForm();
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssign}
              disabled={
                assigning || 
                assignForm.assigned_user_ids.length === 0 || 
                (assignForm.requires_approval && multiLevelApprovalEnabled && assignForm.approval_chain.length === 0) ||
                (assignForm.requires_approval && !multiLevelApprovalEnabled && approvalWorkflowEnabled && !assignForm.approver_id) ||
                (assignForm.reminder_enabled && !assignForm.reminder_frequency)
              }
            >
              {assigning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assigning...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" /> Assign to {assignForm.assigned_user_ids.length} User{assignForm.assigned_user_ids.length !== 1 ? 's' : ''}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
