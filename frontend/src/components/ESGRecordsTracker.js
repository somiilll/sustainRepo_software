/**
 * ESG Records Tracker Component
 * 
 * Operational workflow management for ESG records.
 * Shows all users their task status (approved, pending, rejected, due dates, frequency).
 * 
 * Features:
 * - Category/Subcategory/Sub-subcategory hierarchy
 * - Organization-level and Facility-level assignments
 * - Staleness detection based on last record entry
 * - Filling frequency & reminder configuration
 * - Multi-user assignment support
 * - All users can view their task status
 * 
 * @param {string} section - 'environment' | 'social' | 'governance'
 * @param {string} framework - 'BRSR' | 'GRI' etc.
 * @param {string} reportingPeriodOverride - If provided, use this instead of internal state
 * @param {boolean} hideReportingPeriodSelector - Hide the period selector (when managed by parent)
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
  ChevronDown,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Bell,
  UserPlus,
  Filter,
  RefreshCw,
  Building2,
  Layers,
  Calendar,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { 
  generateReportingYears, 
  getCurrentReportingYear 
} from '../utils/reportingYearUtils';
import DataCoverageGrid from './DataCoverageGrid';
import TaskCalendarGrid from './TaskCalendarGrid';

const API = process.env.REACT_APP_BACKEND_URL;

// Status colors - now uses operational status
const STATUS_COLORS = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  pending: 'bg-stone-100 text-stone-600 border-stone-200',
  reopened: 'bg-amber-100 text-amber-700 border-amber-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
  skipped: 'bg-stone-200 text-stone-600 border-stone-300',
};

// Approval status colors
const APPROVAL_STATUS_COLORS = {
  not_required: '',
  pending_approval: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

// Staleness colors
const STALENESS_COLORS = {
  fresh: 'bg-emerald-100 text-emerald-700',
  aging: 'bg-yellow-100 text-yellow-700',
  stale: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

// Filling frequencies
const FILLING_FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'event_based', label: 'Event Based' },
];

// Reminder frequencies
const REMINDER_FREQUENCIES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

// Common timezones for ESG reporting
const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST (India)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'EST (US Eastern)' },
  { value: 'America/Los_Angeles', label: 'PST (US Pacific)' },
  { value: 'Europe/London', label: 'GMT (UK)' },
  { value: 'Europe/Berlin', label: 'CET (Central Europe)' },
  { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
  { value: 'Asia/Tokyo', label: 'JST (Japan)' },
  { value: 'Australia/Sydney', label: 'AEST (Sydney)' },
  { value: 'Asia/Dubai', label: 'GST (Dubai)' },
];

export default function ESGRecordsTracker({ 
  section, 
  framework,
  reportingPeriodOverride = null,
  hideReportingPeriodSelector = false
}) {
  const { token, user } = useAuth();
  // Role check - only admins can assign and see org-wide data
  const isUserAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [completionStats, setCompletionStats] = useState({}); // Task completion by category
  
  // Filters
  const [internalReportingPeriod, setInternalReportingPeriod] = useState(null);
  const [reportingYears, setReportingYears] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stalenessFilter, setStalenessFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  
  // Use override if provided, otherwise use internal state
  const reportingPeriod = reportingPeriodOverride || internalReportingPeriod;
  const setReportingPeriod = reportingPeriodOverride ? () => {} : setInternalReportingPeriod;
  
  // Expanded categories
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Feature flags (fetch from org)
  const [multiLevelApprovalEnabled, setMultiLevelApprovalEnabled] = useState(false);
  const [approvalWorkflowEnabled, setApprovalWorkflowEnabled] = useState(false);
  
  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningItem, setAssigningItem] = useState(null);
  const [assignForm, setAssignForm] = useState({
    assigned_user_ids: [],
    assignment_level: 'organization',
    facility_id: '',
    facility_assignments: {}, // Per-facility assignments: { [facilityId]: { user_id, facility_name } }
    // New scheduling fields
    start_date: '',
    end_date: '',
    timezone: 'Asia/Kolkata',
    filling_frequency: '',
    due_time: '17:00', // Default 5 PM
    due_day_of_month: 1,
    due_day_of_week: 'monday',
    // Legacy/reminder fields
    reminder_enabled: false,
    reminder_frequency: '',
    requires_approval: false,
    approver_id: '',
    approval_chain: [],
  });
  const [assigning, setAssigning] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };
  
  // Reset assignment form
  const resetAssignForm = () => {
    setAssignForm({
      assigned_user_ids: [],
      assignment_level: 'organization',
      facility_id: '',
      facility_assignments: {},
      start_date: '',
      end_date: '',
      timezone: 'Asia/Kolkata',
      filling_frequency: '',
      due_time: '17:00',
      due_day_of_month: 1,
      due_day_of_week: 'monday',
      reminder_enabled: false,
      reminder_frequency: '',
      requires_approval: false,
      approver_id: '',
      approval_chain: [],
    });
    setAssigningItem(null);
  };

  // Fetch organization and set reporting period (only if not overridden)
  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, { headers });
        setOrganization(res.data);
        const yearType = res.data.reporting_year_type || 'financial_year';
        const years = generateReportingYears(yearType, 5);
        setReportingYears(years);
        if (!reportingPeriodOverride) {
          setInternalReportingPeriod(getCurrentReportingYear(yearType));
        }
        
        // Set feature flags
        setMultiLevelApprovalEnabled(res.data.multi_level_approval_enabled || false);
        setApprovalWorkflowEnabled(res.data.approval_workflow_enabled || false);
      } catch (error) {
        console.error('Failed to fetch organization:', error);
        const years = generateReportingYears('financial_year', 5);
        setReportingYears(years);
        if (!reportingPeriodOverride) {
          setInternalReportingPeriod(getCurrentReportingYear('financial_year'));
        }
      }
    };
    fetchOrg();
  }, [token, reportingPeriodOverride]);

  // Fetch categories, facilities, users
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        // Fetch categories (required)
        const catRes = await axios.get(`${API}/api/esg-records/categories/${section}`, { 
          headers, 
          params: { framework } 
        });
        setCategories(catRes.data.categories || []);
        
        // Fetch facilities (optional - don't fail if not available)
        try {
          const facRes = await axios.get(`${API}/api/facilities`, { headers });
          setFacilities(facRes.data.facilities || facRes.data || []);
        } catch (e) {
          console.warn('Failed to fetch facilities:', e);
          setFacilities([]);
        }
        
        // Fetch users - use tracking/users endpoint which is available to all authenticated users
        try {
          const usersRes = await axios.get(`${API}/api/tracking/users`, { headers });
          setUsers(usersRes.data.users || usersRes.data || []);
        } catch (e) {
          // Fallback to admin endpoint if user is admin
          try {
            const usersRes = await axios.get(`${API}/api/admin/users`, { headers });
            setUsers(usersRes.data || []);
          } catch (e2) {
            console.warn('Failed to fetch users:', e2);
            setUsers([]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        setCategories([]);
      }
    };
    fetchBaseData();
  }, [token, section, framework]);

  // Fetch tracker data
  const fetchTrackerData = useCallback(async (showRefresh = false) => {
    if (!reportingPeriod) return;
    
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const params = {
        reporting_period: reportingPeriod,
        section,
        framework,
      };
      
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (facilityFilter !== 'all') params.facility_id = facilityFilter;
      if (userFilter !== 'all') params.assigned_to = userFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (stalenessFilter !== 'all') params.staleness = stalenessFilter;

      const [assignRes, statsRes, completionRes] = await Promise.all([
        axios.get(`${API}/api/esg-records/tracker/${section}`, { headers, params }),
        axios.get(`${API}/api/esg-records/tracker/${section}/stats`, { headers, params }),
        axios.get(`${API}/api/esg-records/tasks/completion-by-category`, { headers, params: { reporting_period: reportingPeriod } }).catch(() => ({ data: { completion_stats: [] } })),
      ]);

      setAssignments(assignRes.data.assignments || []);
      setStats(statsRes.data);
      
      // Build completion stats lookup by category key
      const completionMap = {};
      for (const stat of (completionRes.data.completion_stats || [])) {
        const key = [stat.category, stat.subcategory, stat.sub_subcategory].filter(Boolean).join('|');
        completionMap[key] = stat;
      }
      setCompletionStats(completionMap);
    } catch (error) {
      console.error('Failed to fetch tracker data:', error);
      // Use mock data if endpoint doesn't exist yet
      setAssignments([]);
      setStats({
        total_categories: categories.length,
        assigned: 0,
        unassigned: categories.length,
        completed: 0,
        in_progress: 0,
        overdue: 0,
        stale: 0,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportingPeriod, section, framework, categoryFilter, facilityFilter, userFilter, statusFilter, stalenessFilter, categories.length]);

  useEffect(() => {
    fetchTrackerData();
  }, [fetchTrackerData]);

  // Toggle category expansion
  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Open assignment modal
  const openAssignModal = (item) => {
    setAssigningItem(item);
    
    // Format dates for input fields (needs YYYY-MM-DD format)
    const formatDateForInput = (dateVal) => {
      if (!dateVal) return '';
      try {
        const date = new Date(dateVal);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {
        // Invalid date format
      }
      return '';
    };
    
    // Find ALL assignments for this category/subcategory/sub_subcategory (across all facilities)
    const categoryAssignments = assignments.filter(a => 
      a.category === item.category &&
      a.subcategory === (item.subcategory || null) &&
      a.sub_subcategory === (item.sub_subcategory || null)
    );
    
    // Check if any are facility-level
    const hasFacilityAssignments = categoryAssignments.some(a => a.facility_id);
    
    // Build facility_assignments from existing data
    const facilityAssignmentsData = {};
    if (hasFacilityAssignments) {
      categoryAssignments.forEach(a => {
        if (a.facility_id) {
          if (!facilityAssignmentsData[a.facility_id]) {
            facilityAssignmentsData[a.facility_id] = {
              user_ids: [],
              approver_id: a.approver_id || '',
              requires_approval: a.requires_approval || false,
              facility_name: facilities.find(f => f.id === a.facility_id)?.name || ''
            };
          }
          if (a.assigned_to_user_id && !facilityAssignmentsData[a.facility_id].user_ids.includes(a.assigned_to_user_id)) {
            facilityAssignmentsData[a.facility_id].user_ids.push(a.assigned_to_user_id);
          }
        }
      });
    }
    
    // For organization-level, get existing user IDs
    const orgLevelAssignments = categoryAssignments.filter(a => !a.facility_id);
    const existingUserIds = orgLevelAssignments
      .map(a => a.assigned_to_user_id)
      .filter(Boolean);
    
    // Get first assignment for other field defaults
    const firstAssignment = categoryAssignments[0] || item;
    
    // Parse due_config if exists
    const dueConfig = firstAssignment.due_config || {};
    
    // Pre-fill form with existing assignment data
    setAssignForm({
      assigned_user_ids: existingUserIds.length > 0 ? existingUserIds : (item.assigned_to_user_id ? [item.assigned_to_user_id] : []),
      assignment_level: hasFacilityAssignments ? 'facility' : (firstAssignment.assignment_level || 'organization'),
      facility_id: firstAssignment.facility_id || '',
      facility_assignments: facilityAssignmentsData,
      // New scheduling fields
      start_date: formatDateForInput(firstAssignment.start_date),
      end_date: formatDateForInput(firstAssignment.end_date),
      timezone: firstAssignment.timezone || 'Asia/Kolkata',
      filling_frequency: firstAssignment.filling_frequency || '',
      due_time: dueConfig.time || '17:00',
      due_day_of_month: dueConfig.day_of_month || 1,
      due_day_of_week: dueConfig.day_of_week || 'monday',
      // Legacy fields
      reminder_enabled: !!(firstAssignment.reminder_enabled || firstAssignment.reminder_config?.frequency),
      reminder_frequency: firstAssignment.reminder_config?.frequency || firstAssignment.reminder_frequency || '',
      requires_approval: firstAssignment.requires_approval || false,
      approver_id: firstAssignment.approver_id || '',
      approval_chain: firstAssignment.approval_chain || [],
    });
    setShowAssignModal(true);
  };

  // Handle assignment - supports multi-user and per-facility assignments
  const handleAssign = async () => {
    // Validation for facility-level assignments
    if (assignForm.assignment_level === 'facility') {
      const facilityAssignments = Object.entries(assignForm.facility_assignments || {})
        .filter(([_, fa]) => fa?.user_ids?.length > 0);
      
      if (facilityAssignments.length === 0) {
        toast.error('Please assign at least one facility to a user');
        return;
      }
    } else {
      // Organization level - need assigned_user_ids
      if (assignForm.assigned_user_ids.length === 0) {
        toast.error('Please select at least one user');
        return;
      }
    }

    if (assignForm.requires_approval && assignForm.assignment_level !== 'facility') {
      if (multiLevelApprovalEnabled && assignForm.approval_chain.length === 0) {
        toast.error('Please add at least one approver to the approval chain');
        return;
      }
      if (!multiLevelApprovalEnabled && approvalWorkflowEnabled && !assignForm.approver_id) {
        toast.error('Please select an approver');
        return;
      }
    }

    setAssigning(true);
    try {
      // Build entity_id from category hierarchy (not from existing assignment id)
      const entityId = [
        assigningItem.category,
        assigningItem.subcategory,
        assigningItem.sub_subcategory
      ].filter(Boolean).join('_') || assigningItem.category;

      // Build due_config based on frequency
      const buildDueConfig = () => {
        const freq = assignForm.filling_frequency;
        if (!freq) return null;
        
        const config = {
          type: freq,
          time: assignForm.due_time || '17:00',
          timezone: assignForm.timezone || 'Asia/Kolkata',
        };
        
        if (freq === 'monthly' || freq === 'quarterly' || freq === 'half_yearly' || freq === 'yearly') {
          config.day_of_month = parseInt(assignForm.due_day_of_month) || 1;
        }
        if (freq === 'weekly') {
          config.day_of_week = assignForm.due_day_of_week || 'monday';
        }
        
        return config;
      };

      // For facility-level, create one assignment per user per facility
      if (assignForm.assignment_level === 'facility') {
        const facilityAssignments = Object.entries(assignForm.facility_assignments || {})
          .filter(([_, fa]) => fa?.user_ids?.length > 0);
        
        if (facilityAssignments.length === 0) {
          toast.error('Please assign at least one facility to a user');
          setAssigning(false);
          return;
        }
        
        let isFirst = true;
        for (const [facilityId, fa] of facilityAssignments) {
          // Create assignment for each user in this facility
          for (const userId of fa.user_ids) {
            await axios.post(
              `${API}/api/esg-records/assignments`,
              {
                entity_type: 'record_category',
                entity_id: `${entityId}_${facilityId}`,
                category: assigningItem.category,
                subcategory: assigningItem.subcategory || null,
                sub_subcategory: assigningItem.sub_subcategory || null,
                assign_children: !assigningItem.subcategory,
                assignment_level: 'facility',
                facility_id: facilityId,
                assigned_to_user_id: userId,
                reporting_period: reportingPeriod,
                start_date: assignForm.start_date || null,
                end_date: assignForm.end_date || null,
                timezone: assignForm.timezone || 'Asia/Kolkata',
                filling_frequency: assignForm.filling_frequency || null,
                due_config: buildDueConfig(),
                reminder_enabled: assignForm.reminder_enabled,
                reminder_config: assignForm.reminder_enabled ? {
                  frequency: assignForm.reminder_frequency,
                  days_before_due: [7, 3, 1],
                  repeat_overdue: true,
                } : null,
                requires_approval: fa.requires_approval && !!fa.approver_id,
                approver_id: fa.requires_approval ? fa.approver_id : null,
                approval_chain: [],
                replace_existing: isFirst,
              },
              { headers }
            );
            isFirst = false;
          }
        }
        const totalAssignments = facilityAssignments.reduce((sum, [_, fa]) => sum + (fa.user_ids?.length || 0), 0);
        toast.success(`Created ${totalAssignments} assignment(s) across ${facilityAssignments.length} facility(ies)`);
      } else {
        // Organization level - create assignment for each selected user
        const isParentCategory = !assigningItem.subcategory;
        const promises = assignForm.assigned_user_ids.map((userId, index) => 
          axios.post(
            `${API}/api/esg-records/assignments`,
            {
              entity_type: 'record_category',
              entity_id: entityId,
              category: assigningItem.category,
              subcategory: assigningItem.subcategory || null,
              sub_subcategory: assigningItem.sub_subcategory || null,
              assign_children: isParentCategory,
              assignment_level: assignForm.assignment_level,
              facility_id: null,
              assigned_to_user_id: userId,
              reporting_period: reportingPeriod,
              start_date: assignForm.start_date || null,
              end_date: assignForm.end_date || null,
              timezone: assignForm.timezone || 'Asia/Kolkata',
              filling_frequency: assignForm.filling_frequency || null,
              due_config: buildDueConfig(),
              reminder_enabled: assignForm.reminder_enabled,
              reminder_config: assignForm.reminder_enabled ? {
                frequency: assignForm.reminder_frequency,
                days_before_due: [7, 3, 1],
                repeat_overdue: true,
              } : null,
              requires_approval: assignForm.requires_approval,
              approver_id: assignForm.requires_approval && !multiLevelApprovalEnabled ? assignForm.approver_id : null,
              approval_chain: assignForm.requires_approval && multiLevelApprovalEnabled ? assignForm.approval_chain : [],
              replace_existing: index === 0,
            },
            { headers }
          )
        );

        for (const promise of promises) {
          await promise;
        }
        toast.success(`Assignment saved for ${assignForm.assigned_user_ids.length} user(s)`);
      }
      
      setShowAssignModal(false);
      resetAssignForm();
      setAssignments([]);
      setTimeout(() => fetchTrackerData(true), 100);
    } catch (error) {
      console.error('Failed to save assignment:', error);
      toast.error(error.response?.data?.detail || 'Failed to save assignment');
    } finally {
      setAssigning(false);
    }
  };

  // Send reminder
  const sendReminder = async (assignmentId) => {
    try {
      await axios.post(
        `${API}/api/esg-records/assignments/${assignmentId}/remind`,
        {},
        { headers }
      );
      toast.success('Reminder sent');
    } catch (error) {
      toast.error('Failed to send reminder');
    }
  };

  // Get staleness badge
  const getStalenessLabel = (staleness) => {
    const labels = {
      fresh: { label: 'Fresh', icon: CheckCircle2 },
      aging: { label: 'Aging', icon: Clock },
      stale: { label: 'Stale', icon: AlertTriangle },
      critical: { label: 'Critical', icon: AlertTriangle },
    };
    const config = labels[staleness] || labels.fresh;
    const Icon = config.icon;
    return (
      <Badge className={`${STALENESS_COLORS[staleness] || STALENESS_COLORS.fresh} gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  // Get status badge - now uses operational status
  const getStatusBadge = (status, approvalStatus = null) => {
    const labels = {
      pending: 'Pending',
      in_progress: 'In Progress',
      completed: 'Completed',
      reopened: 'Reopened',
      overdue: 'Overdue',
      skipped: 'Skipped',
    };
    
    const approvalLabels = {
      pending_approval: 'Awaiting Approval',
      approved: 'Approved',
      rejected: 'Rejected',
    };
    
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={STATUS_COLORS[status] || STATUS_COLORS.pending}>
          {labels[status] || status}
        </Badge>
        {approvalStatus && approvalStatus !== 'not_required' && (
          <Badge className={APPROVAL_STATUS_COLORS[approvalStatus] || ''}>
            {approvalLabels[approvalStatus] || approvalStatus}
          </Badge>
        )}
      </div>
    );
  };

  // Get assignment info for a category (checks if partially assigned and gets all assignees)
  const getAssignmentInfo = (category, subcategory = null) => {
    // Get all subcategories for this category
    const subcats = categories.filter(c => c.category === category && c.subcategory);
    const hasSubcategories = subcats.length > 0;
    
    // Helper to extract unique assignees from assignments (supports new multi-assignee format)
    const extractUniqueAssignees = (assignmentsList) => {
      const uniqueAssignees = [];
      const seenIds = new Set();
      
      assignmentsList.forEach(a => {
        // Handle new multi-assignee format (assignees array from backend)
        if (a.assignees && Array.isArray(a.assignees)) {
          a.assignees.forEach(assignee => {
            if (assignee.user_id && !seenIds.has(assignee.user_id)) {
              seenIds.add(assignee.user_id);
              uniqueAssignees.push({
                id: assignee.user_id,
                name: assignee.user_name || assignee.name,
                email: assignee.user_email || assignee.email,
                role: assignee.role || 'editor',
              });
            }
          });
        }
        // Fallback to legacy single-user format
        else if (a.assigned_to_user_id && !seenIds.has(a.assigned_to_user_id)) {
          seenIds.add(a.assigned_to_user_id);
          uniqueAssignees.push({
            id: a.assigned_to_user_id,
            name: a.assigned_to_name,
            email: a.assigned_to_email,
            role: 'editor',
          });
        }
      });
      
      return uniqueAssignees;
    };
    
    if (!subcategory && hasSubcategories) {
      // This is a parent category - check if all subcategories are assigned
      const assignedSubcats = subcats.filter(sc => 
        assignments.some(a => a.category === category && a.subcategory === sc.subcategory)
      );
      
      const isPartiallyAssigned = assignedSubcats.length > 0 && assignedSubcats.length < subcats.length;
      const isFullyAssigned = assignedSubcats.length === subcats.length;
      
      // Get all unique assignees across all subcategories
      const allAssignees = assignments.filter(a => 
        a.category === category && a.subcategory
      );
      const uniqueAssignees = extractUniqueAssignees(allAssignees);
      
      return { 
        isPartiallyAssigned, 
        isFullyAssigned,
        assignees: uniqueAssignees, 
        hasSubcategories,
        totalSubcats: subcats.length,
        assignedSubcatsCount: assignedSubcats.length
      };
    } else {
      // This is a subcategory or category without subcategories
      const categoryAssignments = assignments.filter(a => 
        a.category === category && 
        (subcategory ? a.subcategory === subcategory : !a.subcategory)
      );
      
      const uniqueAssignees = extractUniqueAssignees(categoryAssignments);
      
      return { 
        isPartiallyAssigned: false, 
        isFullyAssigned: uniqueAssignees.length > 0,
        assignees: uniqueAssignees, 
        hasSubcategories: false 
      };
    }
  };

  // Get category status based on assignment and completion
  const getCategoryStatus = (category, completionStats) => {
    const info = getAssignmentInfo(category);
    const { completed, total } = completionStats || { completed: 0, total: 0 };
    
    if (!info.hasSubcategories) {
      // Category without subcategories - use regular status logic
      if (info.assignees.length === 0) return 'unassigned';
      if (total > 0 && completed === total) return 'completed';
      if (completed > 0) return 'in_progress';
      return 'assigned';
    }
    
    // Category with subcategories
    if (info.isPartiallyAssigned) {
      return 'partially_assigned';
    }
    
    if (!info.isFullyAssigned) {
      return 'unassigned';
    }
    
    // All subcategories are assigned - check completion
    if (total > 0 && completed === total) {
      return 'completed';
    }
    
    if (completed > 0) {
      return 'in_progress';
    }
    
    return 'assigned';
  };

  // Render status badge for categories
  const renderCategoryStatusBadge = (category, completionStats) => {
    const status = getCategoryStatus(category, completionStats);
    
    const config = {
      unassigned: { class: 'bg-stone-100 text-stone-500', label: 'Unassigned' },
      partially_assigned: { class: 'bg-amber-100 text-amber-700', label: 'Partially Assigned' },
      assigned: { class: 'bg-blue-100 text-blue-700', label: 'Assigned' },
      in_progress: { class: 'bg-purple-100 text-purple-700', label: 'In Progress' },
      completed: { class: 'bg-green-100 text-green-700', label: 'Completed' },
    };
    
    const cfg = config[status] || config.unassigned;
    return <Badge className={cfg.class}>{cfg.label}</Badge>;
  };

  // Role badge config
  const ROLE_CONFIG = {
    owner: { label: 'Owner', class: 'bg-purple-100 text-purple-700' },
    editor: { label: 'Editor', class: 'bg-blue-100 text-blue-700' },
    reviewer: { label: 'Reviewer', class: 'bg-amber-100 text-amber-700' },
    approver: { label: 'Approver', class: 'bg-green-100 text-green-700' },
    viewer: { label: 'Viewer', class: 'bg-stone-100 text-stone-600' },
  };

  // Render assignee display with role badges
  const renderAssigneeDisplay = (category, subcategory = null) => {
    const info = getAssignmentInfo(category, subcategory);
    
    // For parent category with partial assignment, show "Partially Assigned"
    if (info.isPartiallyAssigned && !subcategory) {
      return (
        <span className="text-amber-600 italic">Partially Assigned</span>
      );
    }
    
    if (info.assignees.length === 0) {
      return (
        <span className="text-text-muted italic">Unassigned</span>
      );
    }
    
    if (info.assignees.length === 1) {
      const assignee = info.assignees[0];
      const roleConfig = ROLE_CONFIG[assignee.role] || ROLE_CONFIG.editor;
      return (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span>{assignee.name || assignee.email || 'Unknown'}</span>
            {assignee.role && assignee.role !== 'editor' && (
              <Badge className={`${roleConfig.class} text-xs px-1.5 py-0`}>
                {roleConfig.label}
              </Badge>
            )}
          </div>
          {assignee.email && (
            <span className="text-xs text-text-muted">{assignee.email}</span>
          )}
        </div>
      );
    }
    
    // Multiple assignees - show first with role, then count
    const firstAssignee = info.assignees[0];
    const othersCount = info.assignees.length - 1;
    const roleConfig = ROLE_CONFIG[firstAssignee.role] || ROLE_CONFIG.editor;
    
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-text-muted" />
          <span>
            {firstAssignee.name || firstAssignee.email} 
            <span className="text-text-muted ml-1">+ {othersCount} other{othersCount > 1 ? 's' : ''}</span>
          </span>
        </div>
        {/* Show role badges for all assignees on hover/tooltip would be nice, but keep it simple for now */}
      </div>
    );
  };

  // Build hierarchical category view
  const buildCategoryHierarchy = () => {
    const hierarchy = {};
    
    categories.forEach(cat => {
      const catKey = cat.category;
      if (!hierarchy[catKey]) {
        hierarchy[catKey] = {
          category: catKey,
          subcategories: {},
          assignment: assignments.find(a => 
            a.category === catKey && !a.subcategory && !a.sub_subcategory
          ),
        };
      }
      
      if (cat.subcategory) {
        const subKey = cat.subcategory;
        if (!hierarchy[catKey].subcategories[subKey]) {
          hierarchy[catKey].subcategories[subKey] = {
            subcategory: subKey,
            sub_subcategories: [],
            assignment: assignments.find(a => 
              a.category === catKey && a.subcategory === subKey && !a.sub_subcategory
            ),
          };
        }
        
        if (cat.sub_subcategory) {
          hierarchy[catKey].subcategories[subKey].sub_subcategories.push({
            sub_subcategory: cat.sub_subcategory,
            assignment: assignments.find(a => 
              a.category === catKey && a.subcategory === subKey && a.sub_subcategory === cat.sub_subcategory
            ),
          });
        }
      }
    });
    
    return Object.values(hierarchy);
  };

  if (loading || !reportingPeriod) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="ml-2 text-text-muted">Loading tracker...</span>
      </div>
    );
  }

  const categoryHierarchy = buildCategoryHierarchy();

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-text-primary">{stats?.total_categories || 0}</div>
          <div className="text-sm text-text-muted">Total Categories</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-emerald-600">{stats?.assigned || 0}</div>
          <div className="text-sm text-text-muted">Assigned</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-stone-500">{stats?.unassigned || 0}</div>
          <div className="text-sm text-text-muted">Unassigned</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">{stats?.completed || 0}</div>
          <div className="text-sm text-text-muted">Completed</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-600">{stats?.overdue || 0}</div>
          <div className="text-sm text-text-muted">Overdue</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-orange-600">{stats?.stale || 0}</div>
          <div className="text-sm text-text-muted">Stale</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          {/* Reporting Period - only show if not managed by parent */}
          {!hideReportingPeriodSelector && (
            <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                {reportingYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Category */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {[...new Set(categories.map(c => c.category))].map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Facility */}
          <Select value={facilityFilter} onValueChange={setFacilityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Facility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Facilities</SelectItem>
              {facilities.map(fac => (
                <SelectItem key={fac.id} value={fac.id}>{fac.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTrackerData(true)}
            disabled={refreshing}
            className="ml-auto"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Category Hierarchy Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Category / Subcategory</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryHierarchy.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                  No categories found for this section
                </TableCell>
              </TableRow>
            ) : (
              categoryHierarchy.map(cat => {
                // Get completion stats for this category
                const catCompletionKey = cat.category;
                const catCompletion = completionStats[catCompletionKey] || {};
                const completionPct = Math.round(catCompletion.completion_pct || 0);
                const totalTasks = catCompletion.total || 0;
                const completedTasks = catCompletion.completed || 0;
                
                return (
                <React.Fragment key={cat.category}>
                  {/* Category Row */}
                  <TableRow className="bg-stone-50 hover:bg-stone-100">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCategory(cat.category)}
                          className="p-1 h-6 w-6"
                        >
                          {expandedCategories[cat.category] ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <span className="font-medium">{cat.category}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {cat.assignment?.assignment_level === 'facility' ? 'Facility' : 'Org'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cat.assignment?.facility_name || '-'}
                    </TableCell>
                    <TableCell>
                      {renderAssigneeDisplay(cat.category)}
                    </TableCell>
                    <TableCell>
                      {cat.assignment?.filling_frequency || '-'}
                    </TableCell>
                    <TableCell>
                      {/* Completion Progress */}
                      {totalTasks > 0 ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress value={completionPct} className="h-2 flex-1" />
                          <span className="text-xs text-text-muted whitespace-nowrap">
                            {completedTasks}/{totalTasks}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {renderCategoryStatusBadge(cat.category, { completed: completedTasks, total: totalTasks })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Assign button - Admin only */}
                        {isUserAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAssignModal({ 
                              category: cat.category, 
                              assignChildren: true,
                              // Pass existing assignment for pre-fill
                              ...cat.assignment
                            })}
                            title={cat.assignment ? "Edit Assignment" : "Assign (includes all subcategories)"}
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        )}
                        {cat.assignment && isUserAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => sendReminder(cat.assignment.id)}
                            title="Send Reminder"
                          >
                            <Bell className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Task Calendar Grid or Data Coverage Grid for this category */}
                  {expandedCategories[cat.category] && cat.assignment?.filling_frequency && (
                    <TableRow className="bg-stone-25">
                      <TableCell colSpan={8} className="py-2">
                        {/* Show Task Calendar if assignment has start_date (tasks generated) */}
                        {cat.assignment?.start_date ? (
                          <TaskCalendarGrid
                            assignmentId={cat.assignment?.id}
                            category={cat.category}
                            subcategory={null}
                            onTaskUpdate={() => fetchTrackerData(true)}
                            expanded={true}
                          />
                        ) : (
                          <DataCoverageGrid
                            category={cat.category}
                            fillingFrequency={cat.assignment.filling_frequency}
                            reportingYear={reportingPeriod}
                            facilityId={cat.assignment?.facility_id}
                            startDate={cat.assignment?.start_date}
                            endDate={cat.assignment?.end_date}
                            expanded={true}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Subcategories */}
                  {expandedCategories[cat.category] && Object.values(cat.subcategories).map(subcat => {
                    // Get completion for subcategory
                    const subCompletionKey = [cat.category, subcat.subcategory].filter(Boolean).join('|');
                    const subCompletion = completionStats[subCompletionKey] || {};
                    const subCompletionPct = Math.round(subCompletion.completion_pct || 0);
                    const subTotalTasks = subCompletion.total || 0;
                    const subCompletedTasks = subCompletion.completed || 0;
                    
                    // Use parent category assignment if subcategory doesn't have its own
                    const effectiveAssignment = subcat.assignment || cat.assignment;
                    const isInherited = !subcat.assignment && cat.assignment;
                    
                    return (
                    <React.Fragment key={`${cat.category}-${subcat.subcategory}`}>
                      <TableRow className="bg-white hover:bg-stone-50">
                        <TableCell className="pl-12">
                          <div className="flex items-center gap-2">
                            {subcat.sub_subcategories.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleCategory(`${cat.category}-${subcat.subcategory}`)}
                                className="p-1 h-6 w-6"
                              >
                                {expandedCategories[`${cat.category}-${subcat.subcategory}`] ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            <span className="text-text-secondary">{subcat.subcategory}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {effectiveAssignment?.assignment_level === 'facility' ? 'Facility' : 'Org'}
                          </Badge>
                        </TableCell>
                        <TableCell>{effectiveAssignment?.facility_name || '-'}</TableCell>
                        <TableCell>
                          {renderAssigneeDisplay(cat.category, subcat.subcategory)}
                        </TableCell>
                        <TableCell>{effectiveAssignment?.filling_frequency || '-'}</TableCell>
                        <TableCell>
                          {/* Subcategory Completion Progress */}
                          {subTotalTasks > 0 ? (
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={subCompletionPct} className="h-2 flex-1" />
                              <span className="text-xs text-text-muted whitespace-nowrap">
                                {subCompletedTasks}/{subTotalTasks}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {effectiveAssignment?.status ? getStatusBadge(effectiveAssignment.status) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Assign button - Admin only */}
                          {isUserAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAssignModal({ 
                                category: cat.category, 
                                subcategory: subcat.subcategory,
                                assignChildren: true,
                                // Pass existing assignment for pre-fill (use own or inherited)
                                ...(subcat.assignment || {})
                              })}
                              title={subcat.assignment ? "Edit Assignment" : "Assign (includes all sub-subcategories)"}
                            >
                              <UserPlus className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Sub-subcategories */}
                      {expandedCategories[`${cat.category}-${subcat.subcategory}`] && 
                        subcat.sub_subcategories.map(subsub => {
                          // Use parent assignment chain: sub_sub -> subcategory -> category
                          const subsubEffectiveAssignment = subsub.assignment || subcat.assignment || cat.assignment;
                          const subsubIsInherited = !subsub.assignment && (subcat.assignment || cat.assignment);
                          
                          // Get completion for sub-subcategory
                          const subsubCompletionKey = [cat.category, subcat.subcategory, subsub.sub_subcategory].filter(Boolean).join('|');
                          const subsubCompletion = completionStats[subsubCompletionKey] || {};
                          const subsubCompletionPct = Math.round(subsubCompletion.completion_pct || 0);
                          const subsubTotalTasks = subsubCompletion.total || 0;
                          const subsubCompletedTasks = subsubCompletion.completed || 0;
                          
                          return (
                          <TableRow key={`${cat.category}-${subcat.subcategory}-${subsub.sub_subcategory}`} className="bg-stone-25">
                            <TableCell className="pl-20">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-text-muted">{subsub.sub_subcategory}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {subsubEffectiveAssignment?.assignment_level === 'facility' ? 'Facility' : 'Org'}
                              </Badge>
                            </TableCell>
                            <TableCell>{subsubEffectiveAssignment?.facility_name || '-'}</TableCell>
                            <TableCell>
                              {subsubEffectiveAssignment?.assigned_to_name ? (
                                <div className="flex flex-col">
                                  <span className="text-xs">{subsubEffectiveAssignment.assigned_to_name}</span>
                                  {subsubEffectiveAssignment.assigned_to_email && (
                                    <span className="text-xs text-text-muted">{subsubEffectiveAssignment.assigned_to_email}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-text-muted italic text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell>{subsubEffectiveAssignment?.filling_frequency || '-'}</TableCell>
                            <TableCell>
                              {/* Sub-subcategory Completion Progress */}
                              {subsubTotalTasks > 0 ? (
                                <div className="flex items-center gap-2 min-w-[100px]">
                                  <Progress value={subsubCompletionPct} className="h-2 flex-1" />
                                  <span className="text-xs text-text-muted whitespace-nowrap">
                                    {subsubCompletedTasks}/{subsubTotalTasks}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-text-muted">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {subsubEffectiveAssignment?.status ? getStatusBadge(subsubEffectiveAssignment.status) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {/* Assign button - Admin only */}
                              {isUserAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openAssignModal({ 
                                    category: cat.category, 
                                    subcategory: subcat.subcategory,
                                    sub_subcategory: subsub.sub_subcategory,
                                    // Pass existing assignment for pre-fill
                                    ...(subsub.assignment || {})
                                  })}
                                  title={subsub.assignment ? "Edit Assignment" : "Assign"}
                                >
                                  <UserPlus className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )})
                      }
                    </React.Fragment>
                  )})}
                </React.Fragment>
              )})
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Assignment Modal */}
      <Dialog open={showAssignModal} onOpenChange={(open) => {
        setShowAssignModal(open);
        if (!open) resetAssignForm();
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              Assign Metric Category
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-text-muted">
                <div className="p-3 bg-stone-50 rounded-lg border text-text-primary mt-2">
                  <span className="font-medium">{assigningItem?.category}</span>
                  {assigningItem?.subcategory && <span> → {assigningItem.subcategory}</span>}
                  {assigningItem?.sub_subcategory && <span> → {assigningItem.sub_subcategory}</span>}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Assignment Level */}
            <div className="space-y-2">
              <Label>Assignment Level *</Label>
              <Select 
                value={assignForm.assignment_level} 
                onValueChange={(v) => setAssignForm(prev => ({ ...prev, assignment_level: v, facility_id: '' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Organization Level</SelectItem>
                  <SelectItem value="facility">Facility Level</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Facility (if facility level) - Show all facilities with per-facility assignment */}
            {assignForm.assignment_level === 'facility' && (
              <div className="space-y-3">
                <Label>Assign Per Facility *</Label>
                <p className="text-xs text-text-muted">Select users, approval settings for each facility. Leave empty to skip.</p>
                <div className="border rounded-lg max-h-80 overflow-y-auto divide-y">
                  {facilities.map(fac => {
                    const facAssign = assignForm.facility_assignments?.[fac.id] || { user_ids: [], approver_id: '', requires_approval: false };
                    return (
                      <div key={fac.id} className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{fac.name}</span>
                          <Badge variant="outline" className="text-xs">{fac.type || 'Facility'}</Badge>
                        </div>
                        
                        {/* Multi-user selection for this facility */}
                        <div className="space-y-1">
                          <Label className="text-xs text-text-muted">Assignees</Label>
                          <div className="flex flex-wrap gap-1 min-h-[32px] p-2 border rounded bg-stone-50">
                            {(facAssign.user_ids || []).map(uid => {
                              const u = users.find(user => user.id === uid);
                              return u ? (
                                <Badge key={uid} variant="secondary" className="text-xs flex items-center gap-1">
                                  {u.full_name || u.name || u.email}
                                  <X 
                                    className="w-3 h-3 cursor-pointer hover:text-red-500" 
                                    onClick={() => setAssignForm(prev => ({
                                      ...prev,
                                      facility_assignments: {
                                        ...prev.facility_assignments,
                                        [fac.id]: {
                                          ...prev.facility_assignments?.[fac.id],
                                          user_ids: (prev.facility_assignments?.[fac.id]?.user_ids || []).filter(id => id !== uid),
                                          facility_name: fac.name
                                        }
                                      }
                                    }))}
                                  />
                                </Badge>
                              ) : null;
                            })}
                            {(facAssign.user_ids || []).length === 0 && (
                              <span className="text-xs text-text-muted">No assignees</span>
                            )}
                          </div>
                          <Select 
                            value="__select__"
                            onValueChange={(v) => {
                              if (v && v !== '__select__') {
                                setAssignForm(prev => {
                                  const current = prev.facility_assignments?.[fac.id]?.user_ids || [];
                                  if (!current.includes(v)) {
                                    return {
                                      ...prev,
                                      facility_assignments: {
                                        ...prev.facility_assignments,
                                        [fac.id]: {
                                          ...prev.facility_assignments?.[fac.id],
                                          user_ids: [...current, v],
                                          facility_name: fac.name
                                        }
                                      }
                                    };
                                  }
                                  return prev;
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="+ Add assignee" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__select__" disabled>Select user...</SelectItem>
                              {users.filter(u => !(facAssign.user_ids || []).includes(u.id)).map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.full_name || u.name || u.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Per-facility approval toggle and approver */}
                        <div className="flex items-center gap-3 pt-2 border-t">
                          <Checkbox 
                            id={`approval-${fac.id}`}
                            checked={facAssign.requires_approval || false}
                            onCheckedChange={(checked) => setAssignForm(prev => ({
                              ...prev,
                              facility_assignments: {
                                ...prev.facility_assignments,
                                [fac.id]: { 
                                  ...prev.facility_assignments?.[fac.id], 
                                  requires_approval: checked,
                                  approver_id: checked ? prev.facility_assignments?.[fac.id]?.approver_id : '',
                                  facility_name: fac.name 
                                }
                              }
                            }))}
                          />
                          <Label htmlFor={`approval-${fac.id}`} className="text-xs cursor-pointer">Requires approval</Label>
                          
                          {facAssign.requires_approval && (
                            <Select 
                              value={facAssign.approver_id || '__none__'} 
                              onValueChange={(v) => setAssignForm(prev => ({
                                ...prev,
                                facility_assignments: {
                                  ...prev.facility_assignments,
                                  [fac.id]: { 
                                    ...prev.facility_assignments?.[fac.id], 
                                    approver_id: v === '__none__' ? '' : v,
                                    facility_name: fac.name 
                                  }
                                }
                              }))}
                            >
                              <SelectTrigger className="h-7 text-xs flex-1">
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
                      </div>
                    );
                  })}
                </div>
                {Object.values(assignForm.facility_assignments || {}).filter(fa => fa?.user_ids?.length > 0).length > 0 && (
                  <div className="text-xs text-emerald-600">
                    {Object.values(assignForm.facility_assignments || {}).filter(fa => fa?.user_ids?.length > 0).length} facility(ies) with assignments
                  </div>
                )}
              </div>
            )}

            {/* Multi-user selection - only for organization level */}
            {assignForm.assignment_level !== 'facility' && (
            <div className="space-y-2">
              <Label>Assign To *</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {users.map(u => (
                  <div 
                    key={u.id}
                    className="flex items-center gap-3 p-2 hover:bg-stone-50 cursor-pointer border-b last:border-b-0"
                    onClick={() => {
                      const ids = assignForm.assigned_user_ids;
                      if (ids.includes(u.id)) {
                        setAssignForm(prev => ({ ...prev, assigned_user_ids: ids.filter(id => id !== u.id) }));
                      } else {
                        setAssignForm(prev => ({ ...prev, assigned_user_ids: [...ids, u.id] }));
                      }
                    }}
                  >
                    <Checkbox 
                      checked={assignForm.assigned_user_ids.includes(u.id)}
                      onCheckedChange={() => {
                        const ids = assignForm.assigned_user_ids;
                        if (ids.includes(u.id)) {
                          setAssignForm(prev => ({ ...prev, assigned_user_ids: ids.filter(id => id !== u.id) }));
                        } else {
                          setAssignForm(prev => ({ ...prev, assigned_user_ids: [...ids, u.id] }));
                        }
                      }}
                    />
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-700">
                      {(u.full_name || u.name || u.email)?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{u.full_name || u.name || 'No Name'}</div>
                      <div className="text-xs text-text-muted">{u.email}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">{u.role}</Badge>
                  </div>
                ))}
              </div>
              {assignForm.assigned_user_ids.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {assignForm.assigned_user_ids.map(id => {
                    const u = users.find(user => user.id === id);
                    return u ? (
                      <Badge key={id} variant="secondary" className="text-xs flex items-center gap-1">
                        {u.full_name || u.name || u.email}
                        <X 
                          className="w-3 h-3 cursor-pointer hover:text-red-500" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignForm(prev => ({ ...prev, assigned_user_ids: prev.assigned_user_ids.filter(uid => uid !== id) }));
                          }}
                        />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            )}

            {/* Reporting Period Info */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-600 font-medium mb-1">Reporting Period</div>
              <div className="text-sm font-medium text-blue-800">{reportingPeriod}</div>
            </div>

            {/* Start Date & End Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={assignForm.start_date}
                  onChange={(e) => setAssignForm(prev => ({ ...prev, start_date: e.target.value }))}
                />
                <p className="text-xs text-text-muted">First day data is expected</p>
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={assignForm.end_date}
                  onChange={(e) => setAssignForm(prev => ({ ...prev, end_date: e.target.value }))}
                />
                <p className="text-xs text-text-muted">Cannot exceed reporting year</p>
              </div>
            </div>

            {/* Filling Frequency */}
            <div className="space-y-2">
              <Label>Filling Frequency *</Label>
              <Select 
                value={assignForm.filling_frequency} 
                onValueChange={(v) => setAssignForm(prev => ({ ...prev, filling_frequency: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="half_yearly">Half Yearly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Due Time & Timezone (show when frequency selected) */}
            {assignForm.filling_frequency && (
              <div className="space-y-3 p-3 border rounded-lg bg-amber-50">
                <Label className="text-sm font-medium text-amber-800">Due Schedule Configuration</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Due Time</Label>
                    <Input
                      type="time"
                      value={assignForm.due_time}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, due_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Timezone</Label>
                    <Select 
                      value={assignForm.timezone} 
                      onValueChange={(v) => setAssignForm(prev => ({ ...prev, timezone: v }))}
                    >
                      <SelectTrigger>
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

                {/* Weekly: Day of Week */}
                {assignForm.filling_frequency === 'weekly' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Due Day of Week</Label>
                    <Select 
                      value={assignForm.due_day_of_week} 
                      onValueChange={(v) => setAssignForm(prev => ({ ...prev, due_day_of_week: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Monday</SelectItem>
                        <SelectItem value="tuesday">Tuesday</SelectItem>
                        <SelectItem value="wednesday">Wednesday</SelectItem>
                        <SelectItem value="thursday">Thursday</SelectItem>
                        <SelectItem value="friday">Friday</SelectItem>
                        <SelectItem value="saturday">Saturday</SelectItem>
                        <SelectItem value="sunday">Sunday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Monthly/Quarterly/Half-Yearly/Yearly: Day of Month */}
                {['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(assignForm.filling_frequency) && (
                  <div className="space-y-2">
                    <Label className="text-xs">Due Day of Month</Label>
                    <Select 
                      value={String(assignForm.due_day_of_month)} 
                      onValueChange={(v) => setAssignForm(prev => ({ ...prev, due_day_of_month: parseInt(v) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...Array(31)].map((_, i) => (
                          <SelectItem key={i+1} value={String(i+1)}>{i+1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-amber-700">Auto-adjusts for shorter months (e.g., 31 → 28 for Feb)</p>
                  </div>
                )}
              </div>
            )}

            {/* Reminder Settings */}
            <div className="space-y-3 p-3 border rounded-lg bg-stone-50">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="reminder_enabled"
                  checked={assignForm.reminder_enabled}
                  onCheckedChange={(checked) => setAssignForm(prev => ({
                    ...prev, 
                    reminder_enabled: checked,
                    reminder_frequency: checked ? prev.reminder_frequency : ''
                  }))}
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
                    onValueChange={(v) => setAssignForm(prev => ({ ...prev, reminder_frequency: v }))}
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

            {/* Approval Settings */}
            {(approvalWorkflowEnabled || multiLevelApprovalEnabled) && (
              <div className="space-y-3 p-3 border rounded-lg bg-violet-50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="requires_approval"
                    checked={assignForm.requires_approval}
                    onCheckedChange={(checked) => setAssignForm(prev => ({
                      ...prev, 
                      requires_approval: checked,
                      approver_id: checked ? prev.approver_id : '',
                      approval_chain: checked ? prev.approval_chain : []
                    }))}
                  />
                  <Label htmlFor="requires_approval" className="text-sm cursor-pointer">
                    {multiLevelApprovalEnabled 
                      ? 'Requires multi-level approval before finalization'
                      : 'Requires approval before finalization'
                    }
                  </Label>
                </div>
                
                {/* Single-level approval - only show for organization level */}
                {assignForm.requires_approval && !multiLevelApprovalEnabled && approvalWorkflowEnabled && assignForm.assignment_level !== 'facility' && (
                  <div className="space-y-2 mt-3">
                    <Label className="text-sm">Select Approver *</Label>
                    <Select 
                      value={assignForm.approver_id} 
                      onValueChange={(v) => setAssignForm(prev => ({ ...prev, approver_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select approver" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-xs font-medium text-violet-700">
                                {(u.full_name || u.name || u.email)?.charAt(0) || '?'}
                              </div>
                              <div>
                                <span className="font-medium">{u.full_name || u.name || u.email}</span>
                                <span className="text-xs text-text-muted ml-2">({u.role})</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Info for facility-level approval */}
                {assignForm.requires_approval && assignForm.assignment_level === 'facility' && (
                  <p className="text-xs text-text-muted mt-2">Approvers are configured per-facility above</p>
                )}
                
                {/* Multi-level approval chain builder - only for organization level */}
                {assignForm.requires_approval && multiLevelApprovalEnabled && assignForm.assignment_level !== 'facility' && (
                  <div className="space-y-3 mt-3">
                    <Label className="text-sm">Approval Chain * <span className="text-xs text-text-muted">(in order)</span></Label>
                    
                    {/* Current approval chain */}
                    {assignForm.approval_chain.length > 0 && (
                      <div className="space-y-2">
                        {assignForm.approval_chain.map((approverId, index) => {
                          const approver = users.find(u => u.id === approverId);
                          return (
                            <div key={approverId} className="flex items-center gap-2 p-2 bg-white rounded border">
                              <Badge variant="outline" className="bg-violet-100 text-violet-700">
                                Level {index + 1}
                              </Badge>
                              <div className="flex-1 flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-violet-200 flex items-center justify-center text-xs font-medium text-violet-700">
                                  {(approver?.full_name || approver?.name)?.charAt(0) || '?'}
                                </div>
                                <span className="text-sm font-medium">{approver?.full_name || approver?.name || approver?.email || 'Unknown'}</span>
                                <span className="text-xs text-text-muted">({approver?.role})</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newChain = assignForm.approval_chain.filter((_, i) => i !== index);
                                  setAssignForm(prev => ({ ...prev, approval_chain: newChain }));
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
                          setAssignForm(prev => ({
                            ...prev, 
                            approval_chain: [...prev.approval_chain, userId]
                          }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Add Level ${assignForm.approval_chain.length + 1} Approver`} />
                      </SelectTrigger>
                      <SelectContent>
                        {users
                          .filter(u => !assignForm.approval_chain.includes(u.id))
                          .map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-xs font-medium">
                                  {(u.full_name || u.name || u.email)?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <span className="font-medium">{u.full_name || u.name || u.email}</span>
                                  <span className="text-xs text-text-muted ml-2">({u.role})</span>
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
              setShowAssignModal(false);
              resetAssignForm();
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssign}
              disabled={
                assigning || 
                assignForm.assigned_user_ids.length === 0 || 
                (assignForm.assignment_level === 'facility' && !assignForm.facility_id) ||
                (assignForm.requires_approval && multiLevelApprovalEnabled && assignForm.assignment_level !== 'facility' && assignForm.approval_chain.length === 0) ||
                (assignForm.requires_approval && !multiLevelApprovalEnabled && approvalWorkflowEnabled && assignForm.assignment_level !== 'facility' && !assignForm.approver_id) ||
                (assignForm.reminder_enabled && !assignForm.reminder_frequency)
              }
            >
              {assigning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assigning...</>
              ) : assignForm.assignment_level === 'facility' ? (
                <><UserPlus className="w-4 h-4 mr-2" /> Save Facility Assignments</>
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
