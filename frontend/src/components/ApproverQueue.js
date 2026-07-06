import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
  Filter,
  RefreshCw,
  FileText,
  ChevronRight,
  Inbox
} from 'lucide-react';
import { toast } from 'sonner';
import SubmissionReviewPanel from './SubmissionReviewPanel';
import { getCurrentReportingYear, generateReportingYears } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * ApproverQueue - Dashboard for approvers to review pending submissions
 * 
 * Features:
 * - View all pending submissions grouped by question
 * - Filter by section and reporting period
 * - Click to open review panel for each question
 * - Real-time refresh
 */
export default function ApproverQueue() {
  const { getAuthHeader, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [organization, setOrganization] = useState(null);
  
  // Filters
  const [reportingPeriod, setReportingPeriod] = useState(null);
  const [reportingYears, setReportingYears] = useState([]);
  const [sectionFilter, setSectionFilter] = useState('all');

  // Fetch organization data
  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setOrganization(res.data);
        
        const yearType = res.data.reporting_year_type || 'financial_year';
        const years = generateReportingYears(yearType, 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear(yearType));
      } catch (error) {
        console.error('Failed to fetch organization:', error);
        const years = generateReportingYears('financial_year', 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear('financial_year'));
      }
    };
    
    if (token) {
      fetchOrganization();
    }
  }, [token]);

  // Fetch pending submissions
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
      
      // Fetch questionnaire submissions
      const questionnairePromise = axios.get(
        `${API}/api/esg-questionnaire/submissions/pending`,
        { headers: getAuthHeader(), params }
      ).catch(err => {
        console.warn('Failed to fetch questionnaire submissions:', err);
        return { data: { submissions: [] } };
      });
      
      // Fetch ESG record approval requests
      const recordApprovalsPromise = axios.get(
        `${API}/api/approval-workflows/requests`,
        { headers: getAuthHeader(), params: { status: 'pending', my_approvals: true } }
      ).catch(err => {
        console.warn('Failed to fetch record approvals:', err);
        return { data: { requests: [] } };
      });
      
      const [questionnaireRes, recordApprovalsRes] = await Promise.all([
        questionnairePromise,
        recordApprovalsPromise
      ]);
      
      // Transform record approvals to match submission format
      const recordApprovals = (recordApprovalsRes.data.requests || [])
        .filter(r => r.entity_type === 'esg_record')
        .map(r => ({
          id: r.id,
          entity_type: 'esg_record',
          entity_id: r.entity_id,
          section: r.entity_subtype || 'environment',
          question_key: `record_${r.entity_snapshot?.category || 'unknown'}`,
          disclosure_name: `${r.entity_snapshot?.category}${r.entity_snapshot?.subcategory ? ' → ' + r.entity_snapshot.subcategory : ''}`,
          submitted_by: r.submitted_by,
          submitted_by_name: r.submitted_by_name,
          submitted_by_email: r.submitted_by_email,
          submitted_at: r.submitted_at,
          status: r.status,
          workflow_name: r.workflow_name,
          entity_snapshot: r.entity_snapshot,
          _source: 'approval_workflow',
          _approval_request_id: r.id,
        }));
      
      // Combine both sources
      setSubmissions([
        ...(questionnaireRes.data.submissions || []),
        ...recordApprovals
      ]);
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
      toast.error('Failed to load approval queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeader, reportingPeriod, sectionFilter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // Handle approval complete
  const handleApprovalComplete = () => {
    setSelectedQuestion(null);
    fetchSubmissions(true);
  };

  // Get section label
  const getSectionLabel = (section) => {
    const labels = {
      environment: 'Environment',
      social: 'Social',
      governance: 'Governance'
    };
    return labels[section] || section;
  };

  // Get section badge color
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

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate total pending count
  const totalPending = submissions.reduce(
    (acc, q) => acc + (q.submissions?.length || 0), 
    0
  );

  if (loading || !reportingPeriod) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-text-muted">Loading approval queue...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Inbox className="w-6 h-6 text-purple-600" />
            Approval Queue
          </h2>
          <p className="text-text-muted mt-1">
            Review and approve ESG disclosure submissions
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchSubmissions(true)}
          disabled={refreshing}
          data-testid="refresh-queue-btn"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium text-text-secondary">Filters:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-muted">Period:</label>
            <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
              <SelectTrigger className="w-[180px]" data-testid="period-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reportingYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-muted">Section:</label>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-[150px]" data-testid="section-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                <SelectItem value="environment">Environment</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="governance">Governance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="ml-auto">
            <Badge variant="secondary" className="text-sm">
              {totalPending} pending submission{totalPending !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Submissions list */}
      {submissions.length === 0 ? (
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
          {submissions.map((questionGroup) => (
            <Card 
              key={questionGroup.question_key}
              className="p-4 hover:bg-stone-50 transition-colors cursor-pointer"
              onClick={() => setSelectedQuestion(questionGroup)}
              data-testid={`queue-item-${questionGroup.question_key}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-text-primary">
                        {questionGroup.question_key}
                      </span>
                      {getSectionBadge(questionGroup.question_key)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-text-muted">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {questionGroup.submissions?.length || 0} submission{(questionGroup.submissions?.length || 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Latest: {formatDate(questionGroup.submissions?.[0]?.submitted_at)}
                      </span>
                    </div>
                    
                    {/* Preview of submitters */}
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
                  </div>
                </div>
                
                <ChevronRight className="w-5 h-5 text-stone-400" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog 
        open={selectedQuestion !== null} 
        onOpenChange={() => setSelectedQuestion(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              <span className="font-mono">{selectedQuestion?.question_key}</span>
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
    </div>
  );
}
