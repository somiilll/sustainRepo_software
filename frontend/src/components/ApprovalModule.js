/**
 * Approval Module Component
 * 
 * Modular approval functionality that can be used:
 * 1. As a standalone page (/approver-queue)
 * 2. As a subtab within other modules
 * 
 * @param {string} entityType - 'question' for Disclosures, 'record' for Metrics, 'all' for both
 * @param {string} section - 'environment' | 'social' | 'governance' | 'all'
 * @param {string} reportingPeriodOverride - If provided, use this instead of internal state
 * @param {boolean} hideFilters - Hide the filter bar (when embedded)
 * @param {boolean} compact - Use compact layout (when embedded)
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useDateFormatter } from '../hooks/useDateFormatter';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { 
  Loader2, 
  Users, 
  Clock, 
  CheckCircle2,
  XCircle,
  Filter,
  RefreshCw,
  FileText,
  ChevronRight,
  Inbox,
  Search,
  BarChart3,
  ScrollText,
  User
} from 'lucide-react';
import { toast } from 'sonner';
import SubmissionReviewPanel from './SubmissionReviewPanel';
import QuestionnaireApprovalPanel from './QuestionnaireApprovalPanel';
import { getCurrentReportingYear, generateReportingYears } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

export default function ApprovalModule({ 
  entityType = 'all',
  section = 'all',
  reportingPeriodOverride = null,
  hideFilters = false,
  compact = false
}) {
  const { getAuthHeader, token } = useAuth();
  const { formatDateTime } = useDateFormatter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  
  // Filters
  const [internalReportingPeriod, setInternalReportingPeriod] = useState(null);
  const [reportingYears, setReportingYears] = useState([]);
  const [sectionFilter, setSectionFilter] = useState(section !== 'all' ? section : 'all');
  const [searchQuery, setSearchQuery] = useState('');

  // Use override if provided
  const reportingPeriod = reportingPeriodOverride || internalReportingPeriod;

  // Fetch organization data
  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
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
    
    if (token) {
      fetchOrganization();
    }
  }, [token, reportingPeriodOverride]);

  // Fetch pending submissions (questionnaire) AND approval workflow requests (records)
  const fetchSubmissions = useCallback(async (showRefreshIndicator = false) => {
    if (!reportingPeriod) return;
    
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const params = { reporting_period: reportingPeriod };
      if (sectionFilter !== 'all') {
        params.section = sectionFilter;
      }
      if (entityType !== 'all') {
        params.entity_type = entityType;
      }
      
      // Fetch questionnaire submissions (from old submission system)
      const questionnairePromise = axios.get(
        `${API}/api/esg-questionnaire/submissions/pending`,
        {
          headers: getAuthHeader(),
          params
        }
      ).catch(err => {
        console.warn('Failed to fetch questionnaire submissions:', err);
        return { data: { submissions: [] } };
      });
      
      // Fetch ESG record approval requests from approval workflow engine
      const recordApprovalsPromise = axios.get(
        `${API}/api/approval-workflows/requests`,
        {
          headers: getAuthHeader(),
          params: { status: 'pending', my_approvals: true }
        }
      ).catch(err => {
        console.warn('Failed to fetch record approvals:', err);
        return { data: { requests: [] } };
      });
      
      // Fetch questionnaire response approvals (new V2 system)
      const questionnaireApprovalsPromise = axios.get(
        `${API}/api/approval-workflows/questionnaire/queue`,
        {
          headers: getAuthHeader(),
        }
      ).catch(err => {
        console.warn('Failed to fetch questionnaire approvals:', err);
        return { data: { items: [] } };
      });
      
      const [questionnaireRes, recordApprovalsRes, questionnaireApprovalsRes] = await Promise.all([
        questionnairePromise,
        recordApprovalsPromise,
        questionnaireApprovalsPromise
      ]);
      
      // Transform record approvals to match submission format
      const recordApprovals = (recordApprovalsRes.data.requests || [])
        .filter(r => r.entity_type === 'esg_record')
        .map(r => ({
          id: r.id,
          entity_type: 'esg_record',
          entity_id: r.entity_id,
          section: r.entity_subtype || 'environment',
          question_key: r.entity_snapshot?.category,
          disclosure_name: `${r.entity_snapshot?.category}${r.entity_snapshot?.subcategory ? ' → ' + r.entity_snapshot.subcategory : ''}`,
          submitted_by: r.submitted_by,
          submitted_by_name: r.submitted_by_name,
          submitted_by_email: r.submitted_by_email,
          submitted_at: r.submitted_at,
          status: r.status,
          current_approvers: r.current_approvers,
          workflow_name: r.workflow_name,
          entity_snapshot: r.entity_snapshot,
          // Flag to identify this is from approval workflow
          _source: 'approval_workflow',
          _approval_request_id: r.id,
        }));
      
      // Transform questionnaire approvals (V2 system) to match format
      const questionnaireApprovals = (questionnaireApprovalsRes.data.items || [])
        .map(item => ({
          id: item.id,
          entity_type: 'questionnaire_response',
          entity_id: item.question_key,
          section: item.section_id || 'section_b',
          question_key: item.question_key,
          disclosure_name: item.question_name,
          question_type: item.question_type,
          field_config: item.field_config,
          framework: item.framework,
          reporting_year: item.reporting_year,
          response_data: item.response_data,
          submitted_by: item.submitted_by_id,
          submitted_by_name: item.submitted_by_name,
          submitted_by_email: item.submitted_by_email,
          submitted_at: item.submitted_at,
          status: 'pending_approval',
          due_date: item.due_date,
          assignment_id: item.assignment_id,
          // Flag to identify this is from V2 questionnaire approval
          _source: 'questionnaire_approval_v2',
          _response_id: item.id,
        }));
      
      // Combine all sources
      const allSubmissions = [
        ...(questionnaireRes.data.submissions || []),
        ...recordApprovals,
        ...questionnaireApprovals
      ];
      
      setSubmissions(allSubmissions);
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
      toast.error('Failed to load approval queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeader, reportingPeriod, sectionFilter, entityType]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Handle approval complete
  const handleApprovalComplete = () => {
    setSelectedQuestion(null);
    fetchSubmissions(true);
  };

  // Filter submissions by search
  const filteredSubmissions = submissions.filter(q => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      q.question_key?.toLowerCase().includes(searchLower) ||
      q.submissions?.some(s => 
        s.submitted_by_user_name?.toLowerCase().includes(searchLower)
      )
    );
  });

  // Get section badge
  const getSectionBadge = (questionKey) => {
    if (questionKey.includes('_3') || questionKey.startsWith('gri_3')) {
      return <Badge className="bg-green-100 text-green-800">Environment</Badge>;
    } else if (questionKey.includes('_4') || questionKey.startsWith('gri_4')) {
      return <Badge className="bg-blue-100 text-blue-800">Social</Badge>;
    } else if (questionKey.includes('_2') || questionKey.startsWith('gri_2')) {
      return <Badge className="bg-purple-100 text-purple-800">Governance</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">General</Badge>;
  };

  // Get entity type badge
  const getEntityBadge = (questionKey) => {
    // Check if it's a metric/record vs disclosure
    if (questionKey.startsWith('metric_') || questionKey.startsWith('record_')) {
      return (
        <Badge className="bg-emerald-100 text-emerald-800">
          <BarChart3 className="w-3 h-3 mr-1" /> Metric
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-100 text-blue-800">
        <FileText className="w-3 h-3 mr-1" /> Disclosure
      </Badge>
    );
  };

  // Calculate stats
  const totalPending = submissions.reduce(
    (acc, q) => acc + (q.submissions?.length || 0), 
    0
  );

  if (loading || !reportingPeriod) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        <span className="ml-2 text-text-muted">Loading approval queue...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-text-primary">{submissions.length}</div>
          <div className="text-sm text-text-muted">Questions/Items</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-purple-600">{totalPending}</div>
          <div className="text-sm text-text-muted">Pending Approvals</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {submissions.filter(q => q.submissions?.length === 1).length}
          </div>
          <div className="text-sm text-text-muted">Single Submission</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-orange-600">
            {submissions.filter(q => q.submissions?.length > 1).length}
          </div>
          <div className="text-sm text-text-muted">Needs Merge</div>
        </Card>
      </div>

      {/* Filters */}
      {!hideFilters && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-text-muted" />
              <span className="text-sm font-medium text-text-secondary">Filters:</span>
            </div>
            
            {!reportingPeriodOverride && (
              <Select value={reportingPeriod} onValueChange={setInternalReportingPeriod}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {reportingYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {section === 'all' && (
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  <SelectItem value="environment">Environment</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="governance">Governance</SelectItem>
                </SelectContent>
              </Select>
            )}
            
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input
                  placeholder="Search submissions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSubmissions(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </Card>
      )}

      {/* Submissions list */}
      {filteredSubmissions.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            All Caught Up!
          </h3>
          <p className="text-text-muted">
            No pending submissions require your approval.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((questionGroup) => {
            // Determine item source type
            const isV2Questionnaire = questionGroup._source === 'questionnaire_approval_v2';
            const isMetricApproval = questionGroup._source === 'approval_workflow';
            
            return (
              <Card 
                key={questionGroup.id || questionGroup.question_key}
                className={`p-4 hover:bg-stone-50 transition-colors cursor-pointer ${
                  isV2Questionnaire ? 'border-l-4 border-l-purple-400' :
                  isMetricApproval ? 'border-l-4 border-l-blue-400' :
                  questionGroup.submissions?.length > 1 ? 'border-l-4 border-l-orange-400' : ''
                }`}
                onClick={() => setSelectedQuestion(questionGroup)}
                data-testid={`queue-item-${questionGroup.question_key || questionGroup.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isV2Questionnaire ? 'bg-purple-100' :
                      isMetricApproval ? 'bg-blue-100' :
                      questionGroup.submissions?.length > 1 
                        ? 'bg-orange-100' 
                        : 'bg-purple-100'
                    }`}>
                      {isV2Questionnaire ? (
                        <ScrollText className="w-5 h-5 text-purple-600" />
                      ) : isMetricApproval ? (
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                      ) : questionGroup.submissions?.length > 1 ? (
                        <Users className="w-5 h-5 text-orange-600" />
                      ) : (
                        <FileText className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isV2Questionnaire || isMetricApproval ? (
                          <span className="text-sm font-medium text-text-primary">
                            {questionGroup.disclosure_name || questionGroup.question_key}
                          </span>
                        ) : (
                          <span className="font-mono text-sm font-medium text-text-primary">
                            {questionGroup.question_key}
                          </span>
                        )}
                        {getSectionBadge(questionGroup.section || questionGroup.question_key)}
                        {isV2Questionnaire && (
                          <Badge className="bg-purple-100 text-purple-800">
                            {questionGroup.framework?.toUpperCase() || 'BRSR'}
                          </Badge>
                        )}
                        {isMetricApproval && (
                          <Badge className="bg-blue-100 text-blue-800">
                            Metric
                          </Badge>
                        )}
                        {!isV2Questionnaire && !isMetricApproval && entityType === 'all' && getEntityBadge(questionGroup.question_key)}
                        {questionGroup.submissions?.length > 1 && (
                          <Badge className="bg-orange-100 text-orange-800">
                            Merge Required
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-text-muted">
                        {isV2Questionnaire ? (
                          <>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {questionGroup.submitted_by_name || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDateTime(questionGroup.submitted_at)}
                            </span>
                          </>
                        ) : isMetricApproval ? (
                          <>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {questionGroup.submitted_by_name || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDateTime(questionGroup.submitted_at)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {questionGroup.submissions?.length || 0} submission{(questionGroup.submissions?.length || 0) !== 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Latest: {formatDateTime(questionGroup.submissions?.[0]?.submitted_at)}
                            </span>
                          </>
                        )}
                      </div>
                      
                      {/* Preview of submitters - only for non-V2 items */}
                      {!isV2Questionnaire && !isMetricApproval && (
                        <div className="flex items-center gap-2 mt-2">
                          {questionGroup.submissions?.slice(0, 3).map((sub, idx) => (
                            <Badge 
                              key={sub.id} 
                              variant="outline" 
                              className="text-xs"
                            >
                              {sub.submitted_by_user_name?.split(' ')[0] || 'User'}
                            </Badge>
                          ))}
                          {(questionGroup.submissions?.length || 0) > 3 && (
                            <span className="text-xs text-text-muted">
                              +{questionGroup.submissions.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <ChevronRight className="w-5 h-5 text-stone-400" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Dialog - Handle different item types */}
      {selectedQuestion && selectedQuestion._source === 'questionnaire_approval_v2' ? (
        <QuestionnaireApprovalPanel
          item={selectedQuestion}
          onClose={() => setSelectedQuestion(null)}
          onApproved={handleApprovalComplete}
        />
      ) : (
        <Dialog 
          open={selectedQuestion !== null && selectedQuestion._source !== 'questionnaire_approval_v2'} 
          onOpenChange={() => setSelectedQuestion(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <span className="font-mono">{selectedQuestion?.question_key}</span>
                {selectedQuestion?.submissions?.length > 1 && (
                  <Badge className="bg-orange-100 text-orange-800 ml-2">
                    {selectedQuestion.submissions.length} submissions to merge
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {selectedQuestion && (
              <SubmissionReviewPanel
                questionKey={selectedQuestion.question_key}
                reportingPeriod={selectedQuestion.reporting_period || reportingPeriod}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
