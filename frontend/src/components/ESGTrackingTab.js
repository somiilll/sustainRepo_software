/**
 * ESG Tracking Tab Component
 * 
 * Provides a comprehensive "ESG Control Center" for admins to:
 * - Monitor disclosure completion
 * - Assign/reassign disclosures
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
  ChevronLeft,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Bell,
  UserPlus,
  Calendar,
  Filter,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { 
  generateReportingYears, 
  getCurrentReportingYear 
} from '../utils/reportingYearUtils';

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

/**
 * Main ESG Tracking Tab Component
 */
export default function ESGTrackingTab({ domain = 'environment' }) {
  const { getAuthHeader, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  // State
  const [loading, setLoading] = useState(true);
  const [reportingPeriod, setReportingPeriod] = useState(() => getCurrentReportingYear('financial_year'));
  const [frameworkSummary, setFrameworkSummary] = useState(null);
  const [selectedFramework, setSelectedFramework] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [disclosures, setDisclosures] = useState([]);
  const [sectionSummary, setSectionSummary] = useState(null);
  
  // Filter state
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAssigned, setFilterAssigned] = useState('all');
  
  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningDisclosure, setAssigningDisclosure] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [assignForm, setAssignForm] = useState({
    assigned_to_user_id: '',
    due_date: '',
    filling_frequency: '',
    requires_approval: false,
  });
  const [assigning, setAssigning] = useState(false);
  
  // Reminder state
  const [sendingReminder, setSendingReminder] = useState(null);
  
  // Year options
  const yearOptions = generateReportingYears('financial_year', 5);
  
  // Fetch framework summary
  const fetchFrameworkSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${API}/tracking/${domain}/frameworks?reporting_period=${encodeURIComponent(reportingPeriod)}`,
        { headers: getAuthHeader() }
      );
      setFrameworkSummary(res.data);
      
      // Auto-select first framework if only one
      if (res.data.frameworks?.length === 1) {
        setSelectedFramework(res.data.frameworks[0]);
      } else if (res.data.frameworks?.length > 0 && !selectedFramework) {
        setSelectedFramework(res.data.frameworks[0]);
      }
    } catch (error) {
      console.error('Failed to fetch framework summary:', error);
      toast.error('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }, [domain, reportingPeriod, getAuthHeader]);
  
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
    }
  }, [isAdmin, fetchOrgUsers]);
  
  // Handle assignment
  const handleAssign = async () => {
    if (!assigningDisclosure || !assignForm.assigned_to_user_id) {
      toast.error('Please select a user');
      return;
    }
    
    setAssigning(true);
    try {
      await axios.post(
        `${API}/tracking/${domain}/assign?reporting_period=${encodeURIComponent(reportingPeriod)}`,
        {
          framework_id: selectedFramework.framework_id,
          section_id: selectedSection?.section_id,
          disclosure_ids: [assigningDisclosure.disclosure_id],
          assigned_to_user_id: assignForm.assigned_to_user_id,
          due_date: assignForm.due_date || null,
          filling_frequency: assignForm.filling_frequency || null,
          requires_approval: assignForm.requires_approval,
          skip_already_assigned: false,
        },
        { headers: getAuthHeader() }
      );
      
      toast.success('Disclosure assigned successfully');
      setAssignModalOpen(false);
      setAssigningDisclosure(null);
      setAssignForm({
        assigned_to_user_id: '',
        due_date: '',
        filling_frequency: '',
        requires_approval: false,
      });
      
      // Refresh data
      fetchDisclosures(selectedFramework, selectedSection);
      fetchSections(selectedFramework);
      fetchFrameworkSummary();
    } catch (error) {
      console.error('Failed to assign:', error);
      toast.error(error.response?.data?.detail || 'Failed to assign disclosure');
    } finally {
      setAssigning(false);
    }
  };
  
  // Handle bulk assign remaining
  const handleBulkAssignRemaining = async () => {
    if (!assignForm.assigned_to_user_id) {
      toast.error('Please select a user');
      return;
    }
    
    setAssigning(true);
    try {
      const res = await axios.post(
        `${API}/tracking/${domain}/assign?reporting_period=${encodeURIComponent(reportingPeriod)}`,
        {
          framework_id: selectedFramework.framework_id,
          section_id: selectedSection?.section_id,
          assigned_to_user_id: assignForm.assigned_to_user_id,
          due_date: assignForm.due_date || null,
          filling_frequency: assignForm.filling_frequency || null,
          requires_approval: assignForm.requires_approval,
          skip_already_assigned: true,
        },
        { headers: getAuthHeader() }
      );
      
      toast.success(`Assigned ${res.data.created_count} disclosures (${res.data.skipped_count} already assigned)`);
      setAssignModalOpen(false);
      setAssigningDisclosure(null);
      
      // Refresh data
      fetchDisclosures(selectedFramework, selectedSection);
      fetchSections(selectedFramework);
      fetchFrameworkSummary();
    } catch (error) {
      console.error('Failed to bulk assign:', error);
      toast.error(error.response?.data?.detail || 'Failed to assign disclosures');
    } finally {
      setAssigning(false);
    }
  };
  
  // Handle send reminder
  const handleSendReminder = async (disclosure) => {
    if (!disclosure.is_assigned) {
      toast.error('Disclosure is not assigned');
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
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
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
      
      {/* Sections View */}
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sections.map(section => (
              <Card 
                key={section.section_id}
                className="p-4 cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all"
                onClick={() => setSelectedSection(section)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{section.section_name}</h4>
                  <Badge variant="outline" className="text-xs">
                    {section.completion_percentage}%
                  </Badge>
                </div>
                
                <Progress value={section.completion_percentage} className="h-1.5 mb-3" />
                
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <div className="flex items-center gap-3">
                    <span>{section.total_disclosures} items</span>
                    <span className="text-emerald-600">{section.completed_disclosures} done</span>
                    {section.overdue_count > 0 && (
                      <span className="text-red-600">{section.overdue_count} overdue</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {section.assigned_users?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> 
                        {section.assigned_users.length}
                      </span>
                    )}
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}
      
      {/* Disclosures View */}
      {selectedSection && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedSection(null)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {selectedSection.section_name} Disclosures
            </h3>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setAssigningDisclosure({ bulk: true });
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
          
          {/* Disclosures Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="w-[40%]">Disclosure</TableHead>
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
                      No disclosures found matching filters
                    </TableCell>
                  </TableRow>
                ) : (
                  disclosures.map(disc => (
                    <TableRow key={disc.disclosure_id} className="hover:bg-stone-50">
                      <TableCell>
                        <div className="font-medium text-sm">{disc.disclosure_name}</div>
                        <div className="text-xs text-text-muted">{disc.disclosure_id}</div>
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
                            <div className="text-xs text-text-muted">{disc.assignment_role || 'owner'}</div>
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
                                onClick={() => {
                                  setAssigningDisclosure(disc);
                                  setAssignModalOpen(true);
                                }}
                                title="Reassign"
                              >
                                <Users className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAssigningDisclosure(disc);
                                setAssignModalOpen(true);
                              }}
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
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assigningDisclosure?.bulk 
                ? 'Assign Remaining Disclosures' 
                : assigningDisclosure?.is_assigned 
                  ? 'Reassign Disclosure' 
                  : 'Assign Disclosure'
              }
            </DialogTitle>
            <DialogDescription>
              {assigningDisclosure?.bulk 
                ? `Assign all unassigned disclosures in ${selectedSection?.section_name}`
                : `Assign "${assigningDisclosure?.disclosure_name}" to a user`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assign To *</Label>
              <Select 
                value={assignForm.assigned_to_user_id} 
                onValueChange={(v) => setAssignForm({...assignForm, assigned_to_user_id: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {orgUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">
                          {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-xs text-text-muted">{user.role}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
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
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requires_approval"
                checked={assignForm.requires_approval}
                onChange={(e) => setAssignForm({...assignForm, requires_approval: e.target.checked})}
                className="rounded border-stone-300"
              />
              <Label htmlFor="requires_approval" className="text-sm cursor-pointer">
                Requires approval before finalization
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={assigningDisclosure?.bulk ? handleBulkAssignRemaining : handleAssign}
              disabled={assigning || !assignForm.assigned_to_user_id}
            >
              {assigning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assigning...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" /> {assigningDisclosure?.bulk ? 'Assign All' : 'Assign'}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
