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

const API = process.env.REACT_APP_BACKEND_URL;

// Status colors
const STATUS_COLORS = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  pending: 'bg-stone-100 text-stone-600 border-stone-200',
  submitted: 'bg-purple-100 text-purple-700 border-purple-200',
  reviewed: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
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

export default function ESGRecordsTracker({ 
  section, 
  framework,
  reportingPeriodOverride = null,
  hideReportingPeriodSelector = false
}) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState(null);
  const [organization, setOrganization] = useState(null);
  
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
  
  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningItem, setAssigningItem] = useState(null);
  const [assignmentData, setAssignmentData] = useState({
    assigned_to_user_id: '',
    assignment_level: 'organization',
    facility_id: '',
    due_date: '',
    filling_frequency: 'monthly',
    reminder_frequency: 'weekly',
    role: 'editor',
  });
  const [assigning, setAssigning] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

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
    setAssignmentData({
      assigned_to_user_id: item.assigned_to_user_id || '',
      assignment_level: item.assignment_level || 'organization',
      facility_id: item.facility_id || '',
      due_date: item.due_date || '',
      filling_frequency: item.filling_frequency || 'monthly',
      reminder_frequency: item.reminder_config?.frequency || 'weekly',
      role: item.role || 'editor',
    });
    setShowAssignModal(true);
  };

  // Handle assignment
  const handleAssign = async () => {
    if (!assignmentData.assigned_to_user_id) {
      toast.error('Please select a user');
      return;
    }

    setAssigning(true);
    try {
      await axios.post(
        `${API}/api/esg-records/assignments`,
        {
          entity_type: 'record_category',
          entity_id: assigningItem.category_key || assigningItem.id,
          category: assigningItem.category,
          subcategory: assigningItem.subcategory,
          sub_subcategory: assigningItem.sub_subcategory,
          assignment_level: assignmentData.assignment_level,
          facility_id: assignmentData.assignment_level === 'facility' ? assignmentData.facility_id : null,
          assigned_to_user_id: assignmentData.assigned_to_user_id,
          reporting_period: reportingPeriod,
          due_date: assignmentData.due_date || null,
          filling_frequency: assignmentData.filling_frequency,
          reminder_config: {
            frequency: assignmentData.reminder_frequency,
            days_before_due: [7, 3, 1],
            repeat_overdue: true,
          },
          role: assignmentData.role,
        },
        { headers }
      );

      toast.success('Assignment saved');
      setShowAssignModal(false);
      fetchTrackerData(true);
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

  // Get status badge
  const getStatusBadge = (status) => {
    const labels = {
      pending: 'Pending',
      in_progress: 'In Progress',
      submitted: 'Submitted',
      reviewed: 'Reviewed',
      approved: 'Approved',
      completed: 'Completed',
      overdue: 'Overdue',
    };
    return (
      <Badge className={STATUS_COLORS[status] || STATUS_COLORS.pending}>
        {labels[status] || status}
      </Badge>
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
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Entry</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryHierarchy.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-text-muted">
                  No categories found for this section
                </TableCell>
              </TableRow>
            ) : (
              categoryHierarchy.map(cat => (
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
                      {cat.assignment?.assigned_to_name ? (
                        <div className="flex flex-col">
                          <span>{cat.assignment.assigned_to_name}</span>
                          {cat.assignment.assigned_to_email && (
                            <span className="text-xs text-text-muted">{cat.assignment.assigned_to_email}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-muted italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {cat.assignment?.filling_frequency || '-'}
                    </TableCell>
                    <TableCell>
                      {cat.assignment?.due_date ? new Date(cat.assignment.due_date).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      {cat.assignment?.status ? getStatusBadge(cat.assignment.status) : (
                        <Badge className="bg-stone-100 text-stone-500">Unassigned</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {cat.assignment?.last_entry_at ? new Date(cat.assignment.last_entry_at).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAssignModal({ category: cat.category, assignChildren: true })}
                          title="Assign (includes all subcategories)"
                        >
                          <UserPlus className="w-4 h-4" />
                        </Button>
                        {cat.assignment && (
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

                  {/* Subcategories */}
                  {expandedCategories[cat.category] && Object.values(cat.subcategories).map(subcat => {
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
                            {isInherited && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                Inherited
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {effectiveAssignment?.assignment_level === 'facility' ? 'Facility' : 'Org'}
                          </Badge>
                        </TableCell>
                        <TableCell>{effectiveAssignment?.facility_name || '-'}</TableCell>
                        <TableCell>
                          {effectiveAssignment?.assigned_to_name ? (
                            <div className="flex flex-col">
                              <span className="text-sm">{effectiveAssignment.assigned_to_name}</span>
                              {effectiveAssignment.assigned_to_email && (
                                <span className="text-xs text-text-muted">{effectiveAssignment.assigned_to_email}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-muted italic text-sm">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>{effectiveAssignment?.filling_frequency || '-'}</TableCell>
                        <TableCell>
                          {effectiveAssignment?.due_date ? new Date(effectiveAssignment.due_date).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          {effectiveAssignment?.status ? getStatusBadge(effectiveAssignment.status) : '-'}
                        </TableCell>
                        <TableCell>
                          {effectiveAssignment?.last_entry_at ? new Date(effectiveAssignment.last_entry_at).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAssignModal({ 
                              category: cat.category, 
                              subcategory: subcat.subcategory,
                              assignChildren: true
                            })}
                            title="Assign (includes all sub-subcategories)"
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>

                      {/* Sub-subcategories */}
                      {expandedCategories[`${cat.category}-${subcat.subcategory}`] && 
                        subcat.sub_subcategories.map(subsub => {
                          // Use parent assignment chain: sub_sub -> subcategory -> category
                          const subsubEffectiveAssignment = subsub.assignment || subcat.assignment || cat.assignment;
                          const subsubIsInherited = !subsub.assignment && (subcat.assignment || cat.assignment);
                          
                          return (
                          <TableRow key={`${cat.category}-${subcat.subcategory}-${subsub.sub_subcategory}`} className="bg-stone-25">
                            <TableCell className="pl-20">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-text-muted">{subsub.sub_subcategory}</span>
                                {subsubIsInherited && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                    Inherited
                                  </Badge>
                                )}
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
                              {subsubEffectiveAssignment?.due_date ? new Date(subsubEffectiveAssignment.due_date).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell>
                              {subsubEffectiveAssignment?.status ? getStatusBadge(subsubEffectiveAssignment.status) : '-'}
                            </TableCell>
                            <TableCell>
                              {subsubEffectiveAssignment?.last_entry_at ? new Date(subsubEffectiveAssignment.last_entry_at).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openAssignModal({ 
                                  category: cat.category, 
                                  subcategory: subcat.subcategory,
                                  sub_subcategory: subsub.sub_subcategory
                                })}
                              >
                                <UserPlus className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )})
                      }
                    </React.Fragment>
                  )})}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Assignment Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              Assign Metric Category
            </DialogTitle>
            <DialogDescription>
              {assigningItem?.category}
              {assigningItem?.subcategory && ` → ${assigningItem.subcategory}`}
              {assigningItem?.sub_subcategory && ` → ${assigningItem.sub_subcategory}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Assignment Level */}
            <div className="space-y-2">
              <Label>Assignment Level</Label>
              <Select 
                value={assignmentData.assignment_level} 
                onValueChange={(v) => setAssignmentData(prev => ({ ...prev, assignment_level: v }))}
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

            {/* Facility (if facility level) */}
            {assignmentData.assignment_level === 'facility' && (
              <div className="space-y-2">
                <Label>Facility</Label>
                <Select 
                  value={assignmentData.facility_id} 
                  onValueChange={(v) => setAssignmentData(prev => ({ ...prev, facility_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map(fac => (
                      <SelectItem key={fac.id} value={fac.id}>{fac.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Assigned User */}
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select 
                value={assignmentData.assigned_to_user_id} 
                onValueChange={(v) => setAssignmentData(prev => ({ ...prev, assigned_to_user_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      <div className="flex flex-col">
                        <span>{u.full_name || u.name || u.email}</span>
                        {u.email && (u.full_name || u.name) && (
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cascade info */}
            {assigningItem?.assignChildren && !assigningItem?.sub_subcategory && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700">
                <strong>Note:</strong> This assignment will automatically apply to all 
                {assigningItem?.subcategory ? ' sub-subcategories' : ' subcategories and sub-subcategories'} 
                under this {assigningItem?.subcategory ? 'subcategory' : 'category'}.
              </div>
            )}

            {/* Role */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select 
                value={assignmentData.role} 
                onValueChange={(v) => setAssignmentData(prev => ({ ...prev, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="approver">Approver</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filling Frequency */}
            <div className="space-y-2">
              <Label>Filling Frequency</Label>
              <Select 
                value={assignmentData.filling_frequency} 
                onValueChange={(v) => setAssignmentData(prev => ({ ...prev, filling_frequency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILLING_FREQUENCIES.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label>Due Date (Optional)</Label>
              <Input
                type="date"
                value={assignmentData.due_date}
                onChange={(e) => setAssignmentData(prev => ({ ...prev, due_date: e.target.value }))}
              />
            </div>

            {/* Reminder Frequency */}
            <div className="space-y-2">
              <Label>Reminder Frequency</Label>
              <Select 
                value={assignmentData.reminder_frequency} 
                onValueChange={(v) => setAssignmentData(prev => ({ ...prev, reminder_frequency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_FREQUENCIES.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assigning}>
              {assigning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
