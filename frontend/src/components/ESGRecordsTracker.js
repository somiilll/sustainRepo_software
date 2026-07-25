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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
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
  Search,
} from 'lucide-react';
import { 
  generateReportingYears, 
  getCurrentReportingYear 
} from '../utils/reportingYearUtils';
import DataCoverageGrid from './DataCoverageGrid';
import TaskCalendarGrid from './TaskCalendarGrid';
import DetailedProgressView from './DetailedProgressView';
import { AssignmentWizard } from './assignment-wizard';

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
  
  // Expanded detailed progress view (for period/facility breakdown)
  const [expandedDetailedView, setExpandedDetailedView] = useState(null); // { category, subcategory }
  
  // Feature flags (fetch from org)
  const [multiLevelApprovalEnabled, setMultiLevelApprovalEnabled] = useState(false);
  const [approvalWorkflowEnabled, setApprovalWorkflowEnabled] = useState(false);
  
  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningItem, setAssigningItem] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState(''); // Search filter for users
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
    setUserSearchQuery('');
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

      const [assignRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/esg-records/tracker/${section}`, { headers, params }),
        axios.get(`${API}/api/esg-records/tracker/${section}/stats`, { headers, params }),
      ]);

      setAssignments(assignRes.data.assignments || []);
      setStats(statsRes.data);
      
      // Fetch progress stats using new progress engine
      try {
        // Build category list for bulk progress fetch from categories state
        // categories is a flat list like: [{category: "Water", subcategory: "Withdrawal"}, ...]
        const categorySet = new Set();
        const categoryList = [];
        
        for (const cat of categories) {
          // Add category level
          const catKey = cat.category;
          if (catKey && !categorySet.has(catKey)) {
            categorySet.add(catKey);
            categoryList.push({ category: catKey });
          }
          
          // Add subcategory level
          if (cat.subcategory) {
            const subKey = `${catKey}|${cat.subcategory}`;
            if (!categorySet.has(subKey)) {
              categorySet.add(subKey);
              categoryList.push({ category: catKey, subcategory: cat.subcategory });
            }
          }
          
          // Add sub-subcategory level
          if (cat.sub_subcategory) {
            const subsubKey = `${catKey}|${cat.subcategory}|${cat.sub_subcategory}`;
            if (!categorySet.has(subsubKey)) {
              categorySet.add(subsubKey);
              categoryList.push({ 
                category: catKey, 
                subcategory: cat.subcategory, 
                sub_subcategory: cat.sub_subcategory 
              });
            }
          }
        }
        
        if (categoryList.length > 0) {
          const progressRes = await axios.post(
            `${API}/api/esg-assignments/progress/bulk`,
            categoryList,
            { headers }
          );
          setCompletionStats(progressRes.data || {});
        }
      } catch (progressError) {
        console.warn('Progress API not available, using fallback:', progressError);
        // Fallback to old completion stats endpoint
        try {
          const completionRes = await axios.get(
            `${API}/api/esg-records/tasks/completion-by-category`, 
            { headers, params: { reporting_period: reportingPeriod } }
          );
          const completionMap = {};
          for (const stat of (completionRes.data.completion_stats || [])) {
            const key = [stat.category, stat.subcategory, stat.sub_subcategory].filter(Boolean).join('|');
            completionMap[key] = {
              progress_percentage: stat.completion_pct || 0,
              completed_tasks: stat.completed || 0,
              total_tasks: stat.total || 0,
              pending_tasks: (stat.total || 0) - (stat.completed || 0),
              overdue_tasks: 0,
              last_updated: null,
            };
          }
          setCompletionStats(completionMap);
        } catch {
          setCompletionStats({});
        }
      }
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
  }, [reportingPeriod, section, framework, categoryFilter, facilityFilter, userFilter, statusFilter, stalenessFilter, categories]);

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
          // Read from assignees array (new model) or fallback to assigned_to_user_id (legacy)
          const assigneeUserIds = a.assignees?.map(assignee => assignee.user_id) || [];
          if (assigneeUserIds.length > 0) {
            assigneeUserIds.forEach(userId => {
              if (userId && !facilityAssignmentsData[a.facility_id].user_ids.includes(userId)) {
                facilityAssignmentsData[a.facility_id].user_ids.push(userId);
              }
            });
          } else if (a.assigned_to_user_id && !facilityAssignmentsData[a.facility_id].user_ids.includes(a.assigned_to_user_id)) {
            // Fallback for legacy assignments
            facilityAssignmentsData[a.facility_id].user_ids.push(a.assigned_to_user_id);
          }
        }
      });
    }
    
    // For organization-level, get existing user IDs from assignees array
    const orgLevelAssignments = categoryAssignments.filter(a => !a.facility_id);
    const existingUserIds = orgLevelAssignments
      .flatMap(a => a.assignees?.map(assignee => assignee.user_id) || [a.assigned_to_user_id])
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

      // For facility-level, send all facility assignments in one request
      if (assignForm.assignment_level === 'facility') {
        const facilityAssignments = Object.entries(assignForm.facility_assignments || {})
          .filter(([_, fa]) => fa?.user_ids?.length > 0);
        
        if (facilityAssignments.length === 0) {
          toast.error('Please assign at least one facility to a user');
          setAssigning(false);
          return;
        }
        
        // Build facility_assignments object: { facility_id: [user_ids], ... }
        const facilityAssignmentsMap = {};
        for (const [facilityId, fa] of facilityAssignments) {
          facilityAssignmentsMap[facilityId] = fa.user_ids;
        }
        
        await axios.post(
          `${API}/api/esg-records/assignments`,
          {
            entity_type: 'record_category',
            entity_id: entityId,
            category: assigningItem.category,
            subcategory: assigningItem.subcategory || null,
            sub_subcategory: assigningItem.sub_subcategory || null,
            assign_children: !assigningItem.subcategory,
            assignment_level: 'facility',
            facility_assignments: facilityAssignmentsMap,
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
          },
          { headers }
        );
        
        const totalAssignments = facilityAssignments.reduce((sum, [_, fa]) => sum + (fa.user_ids?.length || 0), 0);
        toast.success(`Created ${totalAssignments} assignment(s) across ${facilityAssignments.length} facility(ies)`);
      } else {
        // Organization level - send all users in one request (new V2 API)
        const isParentCategory = !assigningItem.subcategory;
        
        await axios.post(
          `${API}/api/esg-records/assignments`,
          {
            entity_type: 'record_category',
            entity_id: entityId,
            category: assigningItem.category,
            subcategory: assigningItem.subcategory || null,
            sub_subcategory: assigningItem.sub_subcategory || null,
            assign_children: isParentCategory,
            assignment_level: 'organization',
            facility_id: null,
            user_ids: assignForm.assigned_user_ids,  // V2: array of user IDs
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
          },
          { headers }
        );
        
        toast.success(`Assignment saved for ${assignForm.assigned_user_ids.length} user(s)`);
      }
      
      setShowAssignModal(false);
      resetAssignForm();
      setAssignments([]);
      setTimeout(() => fetchTrackerData(true), 100);
    } catch (error) {
      console.error('Failed to save assignment:', error);
      // Handle Pydantic validation errors which come as array of {type, loc, msg, input, ctx}
      const detail = error.response?.data?.detail;
      const errorMsg = Array.isArray(detail) 
        ? detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ') 
        : (typeof detail === 'string' ? detail : 'Failed to save assignment');
      toast.error(errorMsg);
    } finally {
      setAssigning(false);
    }
  };

  // Handle wizard submit - adapts wizard form to existing API
  const handleWizardSubmit = async (wizardForm) => {
    setAssigning(true);
    try {
      // Build entity_id from category hierarchy
      const entityId = [
        assigningItem.category,
        assigningItem.subcategory,
        assigningItem.sub_subcategory
      ].filter(Boolean).join('_') || assigningItem.category;

      // Build due_config based on frequency
      const buildDueConfig = () => {
        const freq = wizardForm.filling_frequency;
        if (!freq) return null;
        
        const config = {
          type: freq,
          time: wizardForm.due_time || '17:00',
          timezone: wizardForm.timezone || 'Asia/Kolkata',
        };
        
        if (['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(freq)) {
          config.day_of_month = parseInt(wizardForm.due_day_of_month) || 15;
        }
        if (freq === 'weekly') {
          config.day_of_week = wizardForm.due_day_of_week || 'friday';
        }
        
        return config;
      };

      // For facility-level, send all facility assignments in one request
      if (wizardForm.assignment_level === 'facility') {
        const facilityAssignments = Object.entries(wizardForm.facility_assignments || {})
          .filter(([_, fa]) => fa?.user_ids?.length > 0);
        
        if (facilityAssignments.length === 0) {
          toast.error('Please assign at least one facility to a user');
          return;
        }
        
        // Build facility_assignments object: { facility_id: [user_ids], ... }
        const facilityAssignmentsMap = {};
        for (const [facilityId, fa] of facilityAssignments) {
          facilityAssignmentsMap[facilityId] = fa.user_ids;
        }
        
        await axios.post(
          `${API}/api/esg-records/assignments`,
          {
            entity_type: 'record_category',
            entity_id: entityId,
            category: assigningItem.category,
            subcategory: assigningItem.subcategory || null,
            sub_subcategory: assigningItem.sub_subcategory || null,
            assign_children: !assigningItem.subcategory,
            assignment_level: 'facility',
            facility_assignments: facilityAssignmentsMap,
            reporting_period: reportingPeriod,
            start_date: wizardForm.start_date || null,
            end_date: wizardForm.end_date || null,
            timezone: wizardForm.timezone || 'Asia/Kolkata',
            filling_frequency: wizardForm.filling_frequency || null,
            due_config: buildDueConfig(),
            reminder_enabled: wizardForm.reminder_enabled,
            reminder_config: wizardForm.reminder_enabled ? {
              frequency: wizardForm.reminder_frequency,
              days_before_due: [7, 3, 1],
              repeat_overdue: true,
            } : null,
            requires_approval: wizardForm.requires_approval,
            approver_id: wizardForm.requires_approval && !multiLevelApprovalEnabled ? wizardForm.approver_id : null,
            approval_chain: wizardForm.requires_approval && multiLevelApprovalEnabled ? wizardForm.approval_chain : [],
          },
          { headers }
        );
        
        const totalAssignments = facilityAssignments.reduce((sum, [_, fa]) => sum + (fa.user_ids?.length || 0), 0);
        toast.success(`Created ${totalAssignments} assignment(s) across ${facilityAssignments.length} facility(ies)`);
      } else {
        // Organization level
        const isParentCategory = !assigningItem.subcategory;
        
        await axios.post(
          `${API}/api/esg-records/assignments`,
          {
            entity_type: 'record_category',
            entity_id: entityId,
            category: assigningItem.category,
            subcategory: assigningItem.subcategory || null,
            sub_subcategory: assigningItem.sub_subcategory || null,
            assign_children: isParentCategory,
            assignment_level: 'organization',
            facility_id: null,
            user_ids: wizardForm.assigned_user_ids,
            reporting_period: reportingPeriod,
            start_date: wizardForm.start_date || null,
            end_date: wizardForm.end_date || null,
            timezone: wizardForm.timezone || 'Asia/Kolkata',
            filling_frequency: wizardForm.filling_frequency || null,
            due_config: buildDueConfig(),
            reminder_enabled: wizardForm.reminder_enabled,
            reminder_config: wizardForm.reminder_enabled ? {
              frequency: wizardForm.reminder_frequency,
              days_before_due: [7, 3, 1],
              repeat_overdue: true,
            } : null,
            requires_approval: wizardForm.requires_approval,
            approver_id: wizardForm.requires_approval && !multiLevelApprovalEnabled ? wizardForm.approver_id : null,
            approval_chain: wizardForm.requires_approval && multiLevelApprovalEnabled ? wizardForm.approval_chain : [],
          },
          { headers }
        );
        
        toast.success(`Assignment saved for ${wizardForm.assigned_user_ids.length} user(s)`);
      }
      
      setShowAssignModal(false);
      resetAssignForm();
      setAssignments([]);
      setTimeout(() => fetchTrackerData(true), 100);
    } catch (error) {
      console.error('Failed to save assignment:', error);
      // Handle Pydantic validation errors which come as array of {type, loc, msg, input, ctx}
      const detail = error.response?.data?.detail;
      const errorMsg = Array.isArray(detail) 
        ? detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ') 
        : (typeof detail === 'string' ? detail : 'Failed to save assignment');
      toast.error(errorMsg);
      throw error; // Re-throw to let wizard handle the error state
    } finally {
      setAssigning(false);
    }
  };

  // Send reminder
  const sendReminder = async (assignmentId) => {
    try {
      await axios.post(
        `${API}/api/esg-assignments/assignments/${assignmentId}/remind`,
        {},
        { headers }
      );
      toast.success('Reminder sent');
    } catch (error) {
      console.error('Send reminder error:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to send reminder';
      toast.error(errorMsg);
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <TableHead>Assigned To</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Last Updated</TableHead>
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
                // Get completion stats for this category (now from progress engine)
                const catCompletionKey = cat.category;
                const catCompletion = completionStats[catCompletionKey] || {};
                const completionPct = Math.round(catCompletion.progress_percentage || 0);
                const totalTasks = catCompletion.total_tasks || 0;
                const completedTasks = catCompletion.completed_tasks || 0;
                const pendingTasks = catCompletion.pending_tasks || 0;
                const overdueTasks = catCompletion.overdue_tasks || 0;
                const lastUpdated = catCompletion.last_updated || cat.assignment?.updated_at;
                
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
                      {renderAssigneeDisplay(cat.category)}
                    </TableCell>
                    <TableCell>
                      {cat.assignment?.filling_frequency || '-'}
                    </TableCell>
                    <TableCell>
                      {/* Progress Bar with tooltip */}
                      {totalTasks > 0 ? (
                        <div 
                          className="flex items-center gap-2 min-w-[160px] cursor-help"
                          title={`Completed: ${completedTasks}\nPending: ${pendingTasks}\nOverdue: ${overdueTasks}`}
                        >
                          <Progress value={completionPct} className="h-2 flex-1" />
                          <span className="text-xs text-text-muted whitespace-nowrap">
                            {completionPct}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">-</span>
                      )}
                      {totalTasks > 0 && (
                        <div className="text-xs text-text-muted mt-0.5">
                          {completedTasks} / {totalTasks} Tasks
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Last Updated with date and time */}
                      {lastUpdated ? (
                        <span className="text-xs text-text-muted">
                          {new Date(lastUpdated).toLocaleDateString('en-IN', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric' 
                          })}, {new Date(lastUpdated).toLocaleTimeString('en-IN', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Task Status Boxes - Pending (Orange), Overdue (Red), Completed (Green) */}
                      {totalTasks > 0 ? (
                        <TooltipProvider>
                          <div className="flex items-center gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 cursor-help">
                                  {pendingTasks}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Pending Tasks</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200 cursor-help">
                                  {overdueTasks}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Overdue Tasks</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200 cursor-help">
                                  {completedTasks}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Completed Tasks</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      ) : (
                        renderCategoryStatusBadge(cat.category, { completed: completedTasks, total: totalTasks })
                      )}
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
                    // Get completion for subcategory (now from progress engine)
                    const subCompletionKey = [cat.category, subcat.subcategory].filter(Boolean).join('|');
                    const subCompletion = completionStats[subCompletionKey] || {};
                    const subCompletionPct = Math.round(subCompletion.progress_percentage || 0);
                    const subTotalTasks = subCompletion.total_tasks || 0;
                    const subCompletedTasks = subCompletion.completed_tasks || 0;
                    const subPendingTasks = subCompletion.pending_tasks || 0;
                    const subOverdueTasks = subCompletion.overdue_tasks || 0;
                    const subLastUpdated = subCompletion.last_updated;
                    
                    // Use parent category assignment if subcategory doesn't have its own
                    const effectiveAssignment = subcat.assignment || cat.assignment;
                    const isInherited = !subcat.assignment && cat.assignment;
                    const lastUpdated = subLastUpdated || effectiveAssignment?.updated_at;
                    
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
                        <TableCell>
                          {renderAssigneeDisplay(cat.category, subcat.subcategory)}
                        </TableCell>
                        <TableCell>{effectiveAssignment?.filling_frequency || '-'}</TableCell>
                        <TableCell>
                          {/* Subcategory Progress Bar with tooltip */}
                          {subTotalTasks > 0 ? (
                            <div 
                              className="cursor-help"
                              title={`Completed: ${subCompletedTasks}\nPending: ${subPendingTasks}\nOverdue: ${subOverdueTasks}`}
                            >
                              <div className="flex items-center gap-2 min-w-[140px]">
                                <Progress value={subCompletionPct} className="h-2 flex-1" />
                                <span className="text-xs text-text-muted whitespace-nowrap">
                                  {subCompletionPct}%
                                </span>
                              </div>
                              <div className="text-xs text-text-muted mt-0.5">
                                {subCompletedTasks} / {subTotalTasks} Tasks
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-text-muted">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* Last Updated with date and time */}
                          {lastUpdated ? (
                            <span className="text-xs text-text-muted">
                              {new Date(lastUpdated).toLocaleDateString('en-IN', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })}, {new Date(lastUpdated).toLocaleTimeString('en-IN', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {effectiveAssignment?.status ? getStatusBadge(effectiveAssignment.status) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {/* View Details button - shows period/facility breakdown */}
                            {effectiveAssignment && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const detailKey = `${cat.category}|${subcat.subcategory}`;
                                  setExpandedDetailedView(
                                    expandedDetailedView === detailKey ? null : detailKey
                                  );
                                }}
                                title="View Period/Facility Details"
                                className={expandedDetailedView === `${cat.category}|${subcat.subcategory}` ? 'bg-emerald-100' : ''}
                                data-testid={`view-details-${cat.category}-${subcat.subcategory}`}
                              >
                                <Calendar className="w-4 h-4" />
                              </Button>
                            )}
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
                            {subcat.assignment && isUserAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => sendReminder(subcat.assignment.id)}
                                title="Send Reminder"
                              >
                                <Bell className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Detailed Progress View for Subcategory */}
                      {expandedDetailedView === `${cat.category}|${subcat.subcategory}` && (
                        <TableRow className="bg-stone-50">
                          <TableCell colSpan={8} className="py-3 px-4">
                            <DetailedProgressView
                              category={cat.category}
                              subcategory={subcat.subcategory}
                              onClose={() => setExpandedDetailedView(null)}
                            />
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Sub-subcategories */}
                      {expandedCategories[`${cat.category}-${subcat.subcategory}`] && 
                        subcat.sub_subcategories.map(subsub => {
                          // Use parent assignment chain: sub_sub -> subcategory -> category
                          const subsubEffectiveAssignment = subsub.assignment || subcat.assignment || cat.assignment;
                          const subsubIsInherited = !subsub.assignment && (subcat.assignment || cat.assignment);
                          
                          // Get completion for sub-subcategory (now from progress engine)
                          const subsubCompletionKey = [cat.category, subcat.subcategory, subsub.sub_subcategory].filter(Boolean).join('|');
                          const subsubCompletion = completionStats[subsubCompletionKey] || {};
                          const subsubCompletionPct = Math.round(subsubCompletion.progress_percentage || 0);
                          const subsubTotalTasks = subsubCompletion.total_tasks || 0;
                          const subsubCompletedTasks = subsubCompletion.completed_tasks || 0;
                          const subsubPendingTasks = subsubCompletion.pending_tasks || 0;
                          const subsubOverdueTasks = subsubCompletion.overdue_tasks || 0;
                          const subsubLastUpdated = subsubCompletion.last_updated || subsubEffectiveAssignment?.updated_at;
                          
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
                              {/* Sub-subcategory Progress Bar with tooltip */}
                              {subsubTotalTasks > 0 ? (
                                <div 
                                  className="cursor-help"
                                  title={`Completed: ${subsubCompletedTasks}\nPending: ${subsubPendingTasks}\nOverdue: ${subsubOverdueTasks}`}
                                >
                                  <div className="flex items-center gap-2 min-w-[140px]">
                                    <Progress value={subsubCompletionPct} className="h-2 flex-1" />
                                    <span className="text-xs text-text-muted whitespace-nowrap">
                                      {subsubCompletionPct}%
                                    </span>
                                  </div>
                                  <div className="text-xs text-text-muted mt-0.5">
                                    {subsubCompletedTasks} / {subsubTotalTasks} Tasks
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-text-muted">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {/* Last Updated with date and time */}
                              {subsubLastUpdated ? (
                                <span className="text-xs text-text-muted">
                                  {new Date(subsubLastUpdated).toLocaleDateString('en-IN', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    year: 'numeric' 
                                  })}, {new Date(subsubLastUpdated).toLocaleTimeString('en-IN', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </span>
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
                              {subsub.assignment && isUserAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => sendReminder(subsub.assignment.id)}
                                  title="Send Reminder"
                                >
                                  <Bell className="w-4 h-4" />
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

      {/* Assignment Wizard */}
      <AssignmentWizard
        open={showAssignModal}
        onOpenChange={(open) => {
          setShowAssignModal(open);
          if (!open) resetAssignForm();
        }}
        category={assigningItem?.category}
        subcategory={assigningItem?.subcategory}
        subSubcategory={assigningItem?.sub_subcategory}
        facilities={facilities}
        users={users}
        reportingPeriod={reportingPeriod}
        approvalWorkflowEnabled={approvalWorkflowEnabled}
        multiLevelApprovalEnabled={multiLevelApprovalEnabled}
        initialData={assignForm}
        authToken={token}
        onSubmit={handleWizardSubmit}
      />
    </div>
  );
}
