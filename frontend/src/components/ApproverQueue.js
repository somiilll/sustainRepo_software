import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useDateFormatter } from '../hooks/useDateFormatter';
import { formatDateTime as formatDateTimeUtil } from '../utils/dateTimeUtils';
import { useOrganization } from '../contexts/OrganizationContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
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
  User,
  Clock, 
  CheckCircle2,
  Filter,
  RefreshCw,
  FileText,
  ChevronRight,
  Inbox,
  ScrollText,
  BarChart3,
  Download,
  Activity,
  XCircle,
  AlertCircle,
  History,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import SubmissionReviewPanel from './SubmissionReviewPanel';
import EmissionApprovalWrapper from './EmissionApprovalWrapper';
import MultiProposalReview from './MultiProposalReview';
import { getCurrentReportingYear, generateReportingYears } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

const questionConfigLookupKeys = (keys) => [...new Set(keys.flatMap((key) => {
  const parts = key?.split('_') || [];
  return [key, parts.slice(0, -1).join('_'), parts.slice(0, -2).join('_')].filter(Boolean);
}))];

const questionDisplayName = (configMap, questionKey) => {
  const exact = configMap[questionKey];
  if (exact) return exact.description || exact.label || exact.question || questionKey;
  const parentKey = questionKey?.replace(/_[^_]+$/, '');
  const parent = configMap[parentKey];
  const subKey = questionKey?.split('_').pop();
  const sub = parent?.sub_questions?.find((item) => item.sub_key === subKey);
  if (parent && sub) return `${(parent.description || parent.label || parent.question || parentKey).replace(/:\s*$/, '')} → ${sub.label}`;
  return questionKey;
};

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
  const { formatDateTime } = useDateFormatter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [organization, setOrganization] = useState(null);
  
  // Multi-proposal review state
  const [multiProposalRecord, setMultiProposalRecord] = useState(null);
  
  // History state
  const [activeTab, setActiveTab] = useState('pending');
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  
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
      
      // Fetch questionnaire submissions (old system - GRI disclosures)
      const questionnairePromise = axios.get(
        `${API}/api/esg-questionnaire/submissions/pending`,
        { headers: getAuthHeader(), params }
      ).catch(err => {
        console.warn('Failed to fetch questionnaire submissions:', err);
        return { data: { submissions: [] } };
      });
      
      // Fetch ESG record approval requests (GHG emissions, ESG records)
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
      
      // Transform record approvals (GHG emissions, ESG records, BRSR responses)
      const allowedEntityTypes = ['esg_record', 'emission_record', 'esg_response', 'esg_response_submission'];
      let recordApprovals = (recordApprovalsRes.data.requests || [])
        .filter(r => allowedEntityTypes.includes(r.entity_type))
        .map(r => {
          // Build display name based on entity type
          let displayName;
          if (r.entity_type === 'emission_record') {
            displayName = `GHG ${r.entity_snapshot?.scope?.toUpperCase() || ''} - ${r.entity_snapshot?.category || 'Emissions'}${r.entity_snapshot?.sub_category ? ' → ' + r.entity_snapshot.sub_category : ''}`;
          } else if (r.entity_type === 'esg_response') {
            // BRSR response - will be enriched with config below
            displayName = r.entity_id || 'BRSR Disclosure';
          } else {
            displayName = `${r.entity_snapshot?.category}${r.entity_snapshot?.subcategory ? ' → ' + r.entity_snapshot.subcategory : ''}`;
          }
          
          return {
            id: r.id,
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            section: r.entity_subtype || r.section || 'environment',
            question_key: r.entity_type === 'esg_response' ? r.entity_id : `record_${r.entity_snapshot?.category || 'unknown'}`,
            disclosure_name: displayName,
            reporting_period: r.entity_snapshot?.reporting_year,
            submitted_by: r.submitted_by,
            submitted_by_name: r.submitted_by_name,
            submitted_by_email: r.submitted_by_email,
            submitted_at: r.submitted_at,
            status: r.status,
            workflow_name: r.workflow_name,
            entity_snapshot: r.entity_snapshot,
            request_type: r.request_type,
            framework: r.framework,
            _source: 'approval_workflow',
            _approval_request_id: r.id,
            _needs_config: r.entity_type === 'esg_response',
          };
        });
      
      // GROUP esg_record proposals by entity_id for multi-proposal review
      const esgRecordProposals = recordApprovals.filter(r => r.entity_type === 'esg_record');
      // GROUP emission_record proposals by entity_id for multi-proposal review
      const emissionRecordProposals = recordApprovals.filter(r => r.entity_type === 'emission_record');
      const otherApprovals = recordApprovals.filter(r => r.entity_type !== 'esg_record' && r.entity_type !== 'emission_record');
      
      // Group ESG records by entity_id (record_id)
      const groupedByRecord = {};
      esgRecordProposals.forEach(proposal => {
        const recordId = proposal.entity_id;
        if (!groupedByRecord[recordId]) {
          groupedByRecord[recordId] = {
            ...proposal,
            _proposals: [proposal],
            _proposal_count: 1,
            _submitters: [proposal.submitted_by_name || proposal.submitted_by_email || 'Unknown'],
          };
        } else {
          groupedByRecord[recordId]._proposals.push(proposal);
          groupedByRecord[recordId]._proposal_count += 1;
          groupedByRecord[recordId]._submitters.push(proposal.submitted_by_name || proposal.submitted_by_email || 'Unknown');
          // Use the earliest submission time for sorting
          if (new Date(proposal.submitted_at) < new Date(groupedByRecord[recordId].submitted_at)) {
            groupedByRecord[recordId].submitted_at = proposal.submitted_at;
          }
        }
      });
      
      // Group emission records by entity_id (record_id)
      const groupedEmissionsByRecord = {};
      emissionRecordProposals.forEach(proposal => {
        const recordId = proposal.entity_id;
        if (!groupedEmissionsByRecord[recordId]) {
          groupedEmissionsByRecord[recordId] = {
            ...proposal,
            _proposals: [proposal],
            _proposal_count: 1,
            _submitters: [proposal.submitted_by_name || proposal.submitted_by_email || 'Unknown'],
          };
        } else {
          groupedEmissionsByRecord[recordId]._proposals.push(proposal);
          groupedEmissionsByRecord[recordId]._proposal_count += 1;
          groupedEmissionsByRecord[recordId]._submitters.push(proposal.submitted_by_name || proposal.submitted_by_email || 'Unknown');
          // Use the earliest submission time for sorting
          if (new Date(proposal.submitted_at) < new Date(groupedEmissionsByRecord[recordId].submitted_at)) {
            groupedEmissionsByRecord[recordId].submitted_at = proposal.submitted_at;
          }
        }
      });
      
      // Convert grouped records back to array
      const groupedEsgRecords = Object.values(groupedByRecord);
      const groupedEmissionRecords = Object.values(groupedEmissionsByRecord);
      
      // Merge grouped ESG records, grouped emission records with other approvals
      recordApprovals = [...groupedEsgRecords, ...groupedEmissionRecords, ...otherApprovals];
      
      // Fetch question configs for BRSR items to get proper display names
      const brsrItems = recordApprovals.filter(r => r._needs_config);
      if (brsrItems.length > 0) {
        try {
          const questionKeys = questionConfigLookupKeys(brsrItems.map(r => r.entity_id).filter(Boolean));
          const configRes = await axios.post(
            `${API}/api/esg-questionnaire/configs/batch`,
            { question_keys: questionKeys },
            { headers: getAuthHeader() }
          );
          const configMap = {};
          (configRes.data.configs || []).forEach(cfg => {
            configMap[cfg.question_key] = cfg;
          });
          
          // Enrich BRSR items with config data
          recordApprovals = recordApprovals.map(item => {
            if (item._needs_config) {
              const cfg = configMap[item.entity_id] || configMap[item.entity_id?.replace(/_[^_]+$/, '')];
              // Get framework from config if not already set
              const cfgFramework = cfg.framework || (cfg.frameworks && cfg.frameworks[0]);
              return {
                ...item,
                disclosure_name: questionDisplayName(configMap, item.entity_id),
                framework: item.framework || cfgFramework,  // Use existing or from config
              };
            }
            return item;
          });
        } catch (configErr) {
          console.warn('Could not fetch BRSR question configs:', configErr);
        }
      }
      
      // Combine questionnaire submissions + record approvals
      // Put recordApprovals FIRST so new approval_requests with correct framework take precedence
      const allItems = [
        ...recordApprovals,
        ...(questionnaireRes.data.submissions || [])
      ];
      
      // Deduplicate by question_key for esg_response items, otherwise by id
      const seen = new Set();
      const deduplicated = allItems.filter(item => {
        if (!item) return false;
        // For questionnaire responses, dedupe by question_key to merge old and new systems
        const key = (item.entity_type === 'esg_response' || !item.entity_type)
          ? (item.entity_id || item.question_key)
          : (item._approval_request_id || item.id || item.question_key);
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      
      setSubmissions(deduplicated);
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
      toast.error('Failed to load approval queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeader, reportingPeriod, sectionFilter]);

  // Fetch approval history (approved/rejected items)
  const fetchHistory = useCallback(async () => {
    if (!reportingPeriod) return;
    
    try {
      setHistoryLoading(true);
      
      // Use the dedicated history endpoint that includes rejection_reason
      const res = await axios.get(`${API}/api/approval-workflows/requests/history`, {
        headers: getAuthHeader()
      }).catch(() => ({ data: { requests: [] } }));
      
      const allHistory = (res.data.requests || [])
        .map(r => ({ ...r, _historyStatus: r.status }))
        .filter(r => r.entity_type && ['esg_record', 'emission_record', 'esg_response', 'esg_response_submission'].includes(r.entity_type))
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      
      // Enrich BRSR items with config data
      const brsrItems = allHistory.filter(r => r.entity_type === 'esg_response');
      if (brsrItems.length > 0) {
        try {
          const questionKeys = questionConfigLookupKeys(brsrItems.map(r => r.entity_id).filter(Boolean));
          const uniqueKeys = [...new Set(questionKeys)];
          const configRes = await axios.post(
            `${API}/api/esg-questionnaire/configs/batch`,
            { question_keys: uniqueKeys },
            { headers: getAuthHeader() }
          );
          const configMap = {};
          (configRes.data.configs || []).forEach(cfg => {
            configMap[cfg.question_key] = cfg;
          });
          
          // Enrich items with disclosure names
          allHistory.forEach(item => {
            if (item.entity_type === 'esg_response') {
              item._disclosure_name = questionDisplayName(configMap, item.entity_id);
            }
          });
        } catch (configErr) {
          console.warn('Could not fetch BRSR question configs for history:', configErr);
        }
      }
      
      setHistoryItems(allHistory);
    } catch (error) {
      console.error('Failed to fetch approval history:', error);
      toast.error('Failed to load approval history');
    } finally {
      setHistoryLoading(false);
    }
  }, [getAuthHeader, reportingPeriod]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);
  
  // Fetch history when tab changes to history
  useEffect(() => {
    if (activeTab === 'history' && historyItems.length === 0) {
      fetchHistory();
    }
  }, [activeTab, fetchHistory, historyItems.length]);

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

  // Get section badge color based on framework and section
  const getSectionBadge = (item) => {
    // For questionnaire items, show framework badge
    if (item._source === 'questionnaire_approval_v2' || item.framework) {
      const framework = (item.framework || '').toUpperCase();
      if (framework === 'BRSR') {
        return <Badge className="bg-amber-100 text-amber-800">BRSR</Badge>;
      } else if (framework === 'GRI') {
        return <Badge className="bg-cyan-100 text-cyan-800">GRI</Badge>;
      }
      return <Badge className="bg-stone-100 text-stone-800">{framework || 'ESG'}</Badge>;
    }
    
    // For other items, use question key pattern
    const questionKey = item.question_key || '';
    if (questionKey.includes('_3') || questionKey.startsWith('gri_3')) {
      return <Badge className="bg-green-100 text-green-800">Environment</Badge>;
    } else if (questionKey.includes('_4') || questionKey.startsWith('gri_4')) {
      return <Badge className="bg-blue-100 text-blue-800">Social</Badge>;
    } else if (questionKey.includes('_2') || questionKey.startsWith('gri_2')) {
      return <Badge className="bg-purple-100 text-purple-800">Governance</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">General</Badge>;
  };

  // Calculate total pending count
  // Handle both formats: questionnaire items have nested submissions array, approval workflow items are flat
  const totalPending = submissions.reduce((acc, q) => {
    if (q.submissions && Array.isArray(q.submissions)) {
      // Questionnaire format: has nested submissions array
      return acc + q.submissions.length;
    } else if (q._source === 'approval_workflow' || q._approval_request_id) {
      // Approval workflow format: each item is a single submission
      return acc + 1;
    }
    // Fallback: count as 1 if it's a valid item
    return acc + 1;
  }, 0);

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

      {/* Tabs for Pending and History */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="pending-tab">
            <Inbox className="w-4 h-4" />
            Pending ({totalPending})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2" data-testid="history-tab">
            <History className="w-4 h-4" />
            History ({historyItems.length})
          </TabsTrigger>
        </TabsList>
        
        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-4">
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
              {submissions.map((item) => {
                const isRecordApproval = item._source === 'approval_workflow';
                const isEmissionRecord = item.entity_type === 'emission_record';
                const isQuestionnaireApproval = item._source === 'questionnaire_approval_v2';
                const hasMultipleProposals = item._proposal_count && item._proposal_count > 1;
                const isEsgRecord = item.entity_type === 'esg_record';
                
                // Handle click based on whether it's a multi-proposal record (ESG or GHG Emission)
                const handleClick = () => {
                  if (isEmissionRecord && hasMultipleProposals) {
                    // Open multi-proposal review for grouped emission records
                    setMultiProposalRecord({
                      recordId: item.entity_id,
                      entityType: 'emission_record',
                      section: item.section,
                      displayName: item.disclosure_name,
                    });
                  } else if (isEmissionRecord) {
                    // Single proposal emission record - use multi-proposal review for consistency
                    setMultiProposalRecord({
                      recordId: item.entity_id,
                      entityType: 'emission_record',
                      section: item.section,
                      displayName: item.disclosure_name,
                    });
                  } else if (isEsgRecord && hasMultipleProposals) {
                    // Open multi-proposal review for grouped ESG records
                    setMultiProposalRecord({
                      recordId: item.entity_id,
                      entityType: 'esg_record',
                      section: item.section,
                      displayName: item.disclosure_name,
                    });
                  } else if (isEsgRecord) {
                    // Single proposal ESG record - also use multi-proposal review for consistency
                    setMultiProposalRecord({
                      recordId: item.entity_id,
                      entityType: 'esg_record',
                      section: item.section,
                      displayName: item.disclosure_name,
                    });
                  } else {
                    setSelectedQuestion(item);
                  }
                };
                
                return (
                  <Card 
                    key={item.id || item.question_key}
                    className="p-4 hover:bg-stone-50 transition-colors cursor-pointer"
                    onClick={handleClick}
                    data-testid={`queue-item-${item.question_key || item.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isEmissionRecord ? 'bg-teal-100' : isRecordApproval ? 'bg-emerald-100' : 'bg-purple-100'}`}>
                          {isEmissionRecord ? (
                            <BarChart3 className="w-5 h-5 text-teal-600" />
                          ) : (
                            <FileText className={`w-5 h-5 ${isRecordApproval ? 'text-emerald-600' : 'text-purple-600'}`} />
                          )}
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">
                              {item.disclosure_name || item.question_name || item.question_key}
                            </span>
                            {isEmissionRecord ? (
                              <Badge className="bg-teal-100 text-teal-800">GHG Emission</Badge>
                            ) : item.entity_type === 'esg_response' || item.entity_type === 'esg_response_submission' ? (
                              getSectionBadge(item)
                            ) : isRecordApproval ? (
                              <Badge className="bg-emerald-100 text-emerald-800">Data Record</Badge>
                            ) : (
                              getSectionBadge(item)
                            )}
                            {hasMultipleProposals && (
                              <Badge className="bg-blue-100 text-blue-800">
                                <Users className="w-3 h-3 mr-1" />
                                {item._proposal_count} proposals
                              </Badge>
                            )}
                            {item.request_type && item.request_type !== 'create' && (
                              <Badge variant="outline" className="text-xs">
                                {item.request_type.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-text-muted">
                            {hasMultipleProposals ? (
                              <>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {item._submitters.join(', ')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDateTime(item.submitted_at)}
                                </span>
                              </>
                            ) : isQuestionnaireApproval ? (
                              <>
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {item.submitted_by_name || item.submitted_by_email || 'Unknown'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDateTime(item.submitted_at)}
                                </span>
                              </>
                            ) : isRecordApproval ? (
                              <>
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {item.submitted_by_name || 'Unknown'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDateTime(item.submitted_at)}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {item.submissions?.length || 0} submission{(item.submissions?.length || 0) !== 1 ? 's' : ''}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Latest: {formatDateTime(item.submissions?.[0]?.submitted_at)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <ChevronRight className="w-5 h-5 text-stone-400" />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-text-muted">Loading history...</span>
            </div>
          ) : historyItems.length === 0 ? (
            <Card className="p-12 text-center">
              <History className="w-16 h-16 text-stone-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-text-primary mb-2">
                No History Yet
              </h3>
              <p className="text-text-muted">
                Previously approved or rejected submissions will appear here.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {historyItems.map((item) => {
                const isApproved = item._historyStatus === 'approved';
                const isEmissionRecord = item.entity_type === 'emission_record';
                const displayName = item._disclosure_name || 
                  (isEmissionRecord 
                    ? `GHG ${item.entity_snapshot?.scope?.toUpperCase() || ''} - ${item.entity_snapshot?.category || 'Emissions'}`
                    : item.entity_id || 'Unknown');
                
                return (
                  <Card 
                    key={item.id}
                    className="p-4 hover:bg-stone-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedHistoryItem(item)}
                    data-testid={`history-card-${item.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                          isApproved ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          {isApproved ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {isApproved ? 'Approved' : 'Rejected'}
                            </Badge>
                            {item.framework && (
                              <Badge className="bg-stone-100 text-stone-800">{item.framework}</Badge>
                            )}
                            {item.request_type === 'delete' && (
                              <Badge className="bg-red-100 text-red-800">Delete</Badge>
                            )}
                          </div>
                          <h4 className="font-medium text-text-primary">
                            {displayName}
                          </h4>
                          <div className="flex items-center gap-4 mt-1 text-xs text-text-muted">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Submitted by: {item.submitted_by_name || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDateTime(item.updated_at || item.created_at)}
                            </span>
                          </div>
                          {!isApproved && item.rejection_reason && (
                            <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                              <strong>Rejection Reason:</strong> {item.rejection_reason}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <Button variant="ghost" size="sm" className="text-stone-500">
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

     
      {/* Review Dialog - Handle different item types */}
      {selectedQuestion && selectedQuestion._source === 'approval_workflow' ? (
        <Dialog 
          open={true} 
          onOpenChange={() => setSelectedQuestion(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <span className="font-mono">
                  {selectedQuestion?.disclosure_name || selectedQuestion?.question_key}
                </span>
              </DialogTitle>
            </DialogHeader>
            
            {selectedQuestion.entity_type === 'emission_record' ? (
              <EmissionApprovalWrapper
                item={selectedQuestion}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
              />
            ) : selectedQuestion.entity_type === 'esg_record' ? (
              <RecordApprovalPanel
                item={selectedQuestion}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
                getAuthHeader={getAuthHeader}
              />
            ) : selectedQuestion.entity_type === 'esg_response' && selectedQuestion.framework?.toUpperCase() === 'BRSR' ? (
              <BRSRApprovalPanel
                item={selectedQuestion}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
                getAuthHeader={getAuthHeader}
              />
            ) : (selectedQuestion.entity_type === 'esg_response' || selectedQuestion.entity_type === 'esg_response_submission') ? (
              <GRIApprovalPanel
                item={selectedQuestion}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
                getAuthHeader={getAuthHeader}
              />
            ) : (
              <div className="p-6 text-center">
                <p className="text-amber-600 font-medium mb-2">Unsupported Record Type</p>
                <p className="text-text-muted text-sm">
                  This approval request type ({selectedQuestion.entity_type || 'unknown'}) is not yet supported in this view.
                </p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setSelectedQuestion(null)}
                >
                  Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      ) : selectedQuestion ? (
        <Dialog 
          open={true} 
          onOpenChange={() => setSelectedQuestion(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                {selectedQuestion.framework?.toUpperCase() === 'BRSR' ? 'Review BRSR Submission' : 'Review GRI Submission'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedQuestion.submissions?.[0]?.entity_type === 'esg_response' && selectedQuestion.framework?.toUpperCase() === 'BRSR' ? (
              <BRSRApprovalPanel
                item={selectedQuestion}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
                getAuthHeader={getAuthHeader}
              />
            ) : (selectedQuestion.entity_type === 'esg_response' || selectedQuestion.submissions?.[0]?.entity_type === 'esg_response' || selectedQuestion.entity_type === 'esg_response_submission') ? (
              <GRIApprovalPanel
                item={selectedQuestion}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
                getAuthHeader={getAuthHeader}
              />
            ) : (
              <SubmissionReviewPanel
                questionKey={selectedQuestion.question_key}
                reportingPeriod={selectedQuestion.reporting_period || reportingPeriod}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
              />
            )}
          </DialogContent>
        </Dialog>
      ) : null}
      
      {/* History View Dialog - Read Only */}
      {selectedHistoryItem && (
        <Dialog open={true} onOpenChange={() => setSelectedHistoryItem(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-stone-600" />
                {selectedHistoryItem._historyStatus === 'approved' ? 'Approved Submission' : 'Rejected Submission'}
              </DialogTitle>
            </DialogHeader>
            
            <HistoryViewPanel
              item={selectedHistoryItem}
              onClose={() => setSelectedHistoryItem(null)}
              formatDateTime={formatDateTime}
            />
          </DialogContent>
        </Dialog>
      )}
      
      {/* Multi-Proposal Review Dialog for ESG Records and Emission Records */}
      {multiProposalRecord && (
        <Dialog open={true} onOpenChange={() => setMultiProposalRecord(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Review Proposals: {multiProposalRecord.displayName}
              </DialogTitle>
            </DialogHeader>
            <MultiProposalReview
              recordId={multiProposalRecord.recordId}
              entityType={multiProposalRecord.entityType || 'esg_record'}
              section={multiProposalRecord.section}
              onClose={() => setMultiProposalRecord(null)}
              onActionComplete={() => {
                setMultiProposalRecord(null);
                fetchSubmissions();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/**
 * HistoryViewPanel - Read-only view for historical approved/rejected items
 * Shows submission data without any edit or action capabilities
 */
function HistoryViewPanel({ item, onClose, formatDateTime }) {
  const isApproved = item._historyStatus === 'approved';
  const snapshot = item.entity_snapshot || {};
  const isEmissionRecord = item.entity_type === 'emission_record';
  const isBRSR = item.framework?.toUpperCase() === 'BRSR';
  
  // Format the display name
  const displayName = item._disclosure_name || 
    (isEmissionRecord 
      ? `GHG ${snapshot.scope?.toUpperCase() || ''} - ${snapshot.category || 'Emissions'}`
      : item.entity_id || 'Unknown');
  
  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`p-4 rounded-lg ${isApproved ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center gap-3">
          {isApproved ? (
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          ) : (
            <XCircle className="w-6 h-6 text-red-600" />
          )}
          <div>
            <p className={`font-semibold ${isApproved ? 'text-green-800' : 'text-red-800'}`}>
              {isApproved ? 'Approved' : 'Rejected'}
            </p>
            <p className="text-sm text-stone-600">
              {formatDateTime(item.updated_at || item.created_at)}
            </p>
          </div>
        </div>
        
        {!isApproved && item.rejection_reason && (
          <div className="mt-3 p-3 bg-white rounded border border-red-100">
            <p className="text-sm font-medium text-red-700 mb-1">Rejection Reason:</p>
            <p className="text-sm text-red-600">{item.rejection_reason}</p>
          </div>
        )}
      </div>
      
      {/* Submission Details */}
      <Card className="p-4">
        <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Submission Details
        </h3>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-muted">Disclosure:</span>
            <p className="font-medium">{displayName}</p>
          </div>
          <div>
            <span className="text-text-muted">Framework:</span>
            <p className="font-medium">{item.framework || 'N/A'}</p>
          </div>
          <div>
            <span className="text-text-muted">Submitted By:</span>
            <p className="font-medium">{item.submitted_by_name || 'Unknown'}</p>
          </div>
          <div>
            <span className="text-text-muted">Submitted At:</span>
            <p className="font-medium">{formatDateTime(item.submitted_at)}</p>
          </div>
          {item.request_type && (
            <div>
              <span className="text-text-muted">Request Type:</span>
              <p className="font-medium capitalize">{item.request_type}</p>
            </div>
          )}
          {snapshot.reporting_year && (
            <div>
              <span className="text-text-muted">Reporting Period:</span>
              <p className="font-medium">{snapshot.reporting_year}</p>
            </div>
          )}
        </div>
      </Card>
      
      {/* Submitted Data */}
      <Card className="p-4">
        <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
          <ScrollText className="w-4 h-4" />
          Submitted Data
        </h3>
        
        {isEmissionRecord ? (
          <div className="space-y-3">
            {snapshot.scope && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-text-muted">Scope</span>
                <span className="font-medium">{snapshot.scope}</span>
              </div>
            )}
            {snapshot.category && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-text-muted">Category</span>
                <span className="font-medium">{snapshot.category}</span>
              </div>
            )}
            {snapshot.sub_category && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-text-muted">Sub-category</span>
                <span className="font-medium">{snapshot.sub_category}</span>
              </div>
            )}
            {snapshot.co2e_emissions !== undefined && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-text-muted">CO2e Emissions</span>
                <span className="font-medium">{snapshot.co2e_emissions?.toLocaleString()} tCO2e</span>
              </div>
            )}
            {snapshot.dynamic_field_values && Object.entries(snapshot.dynamic_field_values).map(([key, val]) => (
              <div key={key} className="flex justify-between py-2 border-b">
                <span className="text-text-muted capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-medium">
                  {typeof val === 'object' ? `${val.value} ${val.unit || ''}` : String(val)}
                </span>
              </div>
            ))}
          </div>
        ) : isBRSR ? (
          <div className="space-y-3">
            {snapshot.value && typeof snapshot.value === 'object' ? (
              <>
                {snapshot.value.mode && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-text-muted">Mode</span>
                    <span className="font-medium capitalize">{snapshot.value.mode.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {snapshot.value.all_enabled !== undefined && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-text-muted">Enabled</span>
                    <span className="font-medium">{snapshot.value.all_enabled ? 'Yes' : 'No'}</span>
                  </div>
                )}
                {snapshot.value.all_description && (
                  <div className="py-2 border-b">
                    <span className="text-text-muted block mb-1">Description</span>
                    <p className="font-medium text-sm bg-stone-50 p-2 rounded">{snapshot.value.all_description}</p>
                  </div>
                )}
                {snapshot.value.principles && Object.keys(snapshot.value.principles).length > 0 && (
                  <div className="py-2">
                    <span className="text-text-muted block mb-2">Principles</span>
                    <div className="space-y-2">
                      {Object.entries(snapshot.value.principles).map(([key, val]) => (
                        <div key={key} className="bg-stone-50 p-2 rounded text-sm">
                          <span className="font-medium">{key}:</span> {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-2">
                <span className="text-text-muted block mb-1">Value</span>
                <p className="font-medium bg-stone-50 p-3 rounded">{String(snapshot.value)}</p>
              </div>
            )}
            
            {/* BRSR Field-based questions (e.g., sustainable_pct, water_withdrawal, etc.) */}
            {isBRSR && snapshot.value?.fields && Object.keys(snapshot.value.fields).length > 0 && (
              <div className="py-2 border-t mt-2">
                <span className="text-text-muted block mb-2">Response Fields</span>
                <div className="space-y-2">
                  {Object.entries(snapshot.value.fields).map(([fieldKey, fieldVal]) => (
                    <div key={fieldKey} className="flex justify-between py-2 bg-stone-50 px-3 rounded">
                      <span className="text-text-muted capitalize">{fieldKey.replace(/_/g, ' ')}</span>
                      <span className="font-medium">{typeof fieldVal === 'object' ? JSON.stringify(fieldVal) : String(fieldVal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* BRSR Table format - Previous FY / Current FY comparison tables */}
            {isBRSR && snapshot.value && typeof snapshot.value === 'object' && (
              <BRSRTableRenderer value={snapshot.value} />
            )}
          </div>
        ) : (
          <div className="py-2">
            <span className="text-text-muted block mb-1">Value</span>
            <pre className="font-medium bg-stone-50 p-3 rounded text-sm whitespace-pre-wrap">
              {typeof snapshot.value === 'object' ? JSON.stringify(snapshot.value, null, 2) : String(snapshot.value || 'N/A')}
            </pre>
          </div>
        )}
      </Card>
      
      {/* Close Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/**
 * BRSRTableRenderer - Renders various BRSR table formats
 * Handles: previous_fy/current_fy comparisons, principle_wise, nested objects
 * Only used for BRSR framework data
 */
function BRSRTableRenderer({ value }) {
  if (!value || typeof value !== 'object') return null;
  
  // Skip already-handled keys
  const handledKeys = ['mode', 'all_enabled', 'all_description', 'principles', 'has_value', 'fields'];
  const unhandledKeys = Object.keys(value).filter(k => !handledKeys.includes(k));
  
  if (unhandledKeys.length === 0) return null;
  
  // Helper to format field names
  const formatLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Helper to render a value (handles primitives and objects)
  const renderValue = (val) => {
    if (val === null || val === undefined) return <span className="text-stone-400">-</span>;
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val !== 'object') return String(val);
    
    // For arrays
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="text-stone-400">None</span>;
      return (
        <ul className="list-disc list-inside">
          {val.map((item, i) => (
            <li key={i} className="text-sm">{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
          ))}
        </ul>
      );
    }
    
    // For nested objects, render recursively
    return (
      <div className="pl-2 border-l-2 border-stone-200 space-y-1">
        {Object.entries(val).map(([k, v]) => (
          <div key={k} className="text-sm">
            <span className="text-text-muted">{formatLabel(k)}:</span>{' '}
            <span className="font-medium">{renderValue(v)}</span>
          </div>
        ))}
      </div>
    );
  };
  
  // Check if this looks like a FY comparison table (has previous_fy/current_fy structure)
  const isFYComparison = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj);
    return keys.includes('previous_fy') || keys.includes('current_fy');
  };
  
  // Render FY comparison table
  const renderFYTable = (label, data) => {
    if (!data || typeof data !== 'object') return null;
    
    const prevFY = data.previous_fy;
    const currFY = data.current_fy;
    const details = data.details;
    
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-stone-100 px-3 py-2 font-medium text-sm border-b">
          {formatLabel(label)}
        </div>
        <div className="p-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-muted block mb-1">Previous FY</span>
              <div className="font-medium bg-stone-50 p-2 rounded">{renderValue(prevFY)}</div>
            </div>
            <div>
              <span className="text-text-muted block mb-1">Current FY</span>
              <div className="font-medium bg-stone-50 p-2 rounded">{renderValue(currFY)}</div>
            </div>
          </div>
          {details && (
            <div className="mt-3 pt-3 border-t">
              <span className="text-text-muted block mb-1">Details</span>
              <div className="font-medium bg-stone-50 p-2 rounded text-sm">{renderValue(details)}</div>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // Render principle-wise data
  const renderPrincipleWise = (data) => {
    if (!data || typeof data !== 'object') return null;
    
    const principles = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
    
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-stone-100 px-3 py-2 font-medium text-sm border-b">
          Principle-wise Breakdown
        </div>
        <div className="divide-y">
          {principles.map(([principle, pData]) => (
            <div key={principle} className="p-3">
              <div className="font-medium text-sm mb-2 text-blue-700">{principle}</div>
              <div className="pl-2">{renderValue(pData)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-4 py-2 border-t mt-2">
      <span className="text-text-muted block mb-2">Table Data</span>
      
      {unhandledKeys.map(key => {
        const data = value[key];
        
        // Special handling for principle_wise
        if (key === 'principle_wise') {
          return <div key={key}>{renderPrincipleWise(data)}</div>;
        }
        
        // FY comparison tables (directors_coi, kmps_coi, rd, capex, etc.)
        if (isFYComparison(data)) {
          return <div key={key}>{renderFYTable(key, data)}</div>;
        }
        
        // Generic nested object
        if (typeof data === 'object' && data !== null) {
          return (
            <div key={key} className="border rounded-lg overflow-hidden">
              <div className="bg-stone-100 px-3 py-2 font-medium text-sm border-b">
                {formatLabel(key)}
              </div>
              <div className="p-3">{renderValue(data)}</div>
            </div>
          );
        }
        
        // Simple value
        return (
          <div key={key} className="flex justify-between py-2 bg-stone-50 px-3 rounded">
            <span className="text-text-muted">{formatLabel(key)}</span>
            <span className="font-medium">{renderValue(data)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * RecordApprovalPanel - Review panel for ESG Record approvals
 * Allows approvers to view and edit record data before approval
 * Shows ALL fields defined for the category, not just filled ones
 */
function RecordApprovalPanel({ item, onClose, onApproved, getAuthHeader }) {
  const { timezone } = useOrganization();
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');
  const [editedFields, setEditedFields] = useState({});
  const [hasEdits, setHasEdits] = useState(false);
  
  // Format date using organization timezone
  const formatDateTime = (dateStr) => formatDateTimeUtil(dateStr, timezone);
  
  const snapshot = item.entity_snapshot || {};
  const originalFieldValues = snapshot.field_values || {};
  const fieldDefinitions = snapshot.field_definitions || [];
  
  // Initialize edited fields with original values or from field definitions
  useEffect(() => {
    const initialFields = {};
    
    if (fieldDefinitions.length > 0) {
      // Initialize all fields from definitions with their values or defaults
      fieldDefinitions.forEach(field => {
        const key = field.field_key;
        if (originalFieldValues[key] !== undefined) {
          initialFields[key] = originalFieldValues[key];
        } else if (field.default_value !== undefined && field.default_value !== null) {
          initialFields[key] = field.default_value;
        } else {
          // Set appropriate empty value based on type
          switch (field.type) {
            case 'number':
              initialFields[key] = '';
              break;
            case 'yes_no':
              initialFields[key] = null;
              break;
            case 'checkbox_group':
              initialFields[key] = [];
              break;
            case 'table':
              initialFields[key] = [];
              break;
            default:
              initialFields[key] = '';
          }
        }
      });
    } else {
      // Fallback: Initialize from originalFieldValues for older requests without field_definitions
      Object.entries(originalFieldValues).forEach(([key, value]) => {
        initialFields[key] = value;
      });
    }
    
    setEditedFields(initialFields);
  }, [item.id]); // Re-run when item changes
  
  // Track if user made edits
  const handleFieldChange = (key, value) => {
    setEditedFields(prev => {
      const updated = { ...prev, [key]: value };
      // Check if any field differs from original
      const isDifferent = Object.keys(updated).some(k => 
        JSON.stringify(updated[k]) !== JSON.stringify(originalFieldValues[k])
      );
      setHasEdits(isDifferent);
      return updated;
    });
  };
  
  const handleApprove = async () => {
    try {
      setProcessing(true);
      
      const payload = {
        action: 'approve',
        comment: comment || 'Approved'
      };
      
      // Always send updated data with all fields
      payload.updated_data = {
        field_values: editedFields
      };
      
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        payload,
        { headers: getAuthHeader() }
      );
      toast.success(hasEdits ? 'Record approved with edits' : 'Record approved successfully');
      onApproved();
    } catch (error) {
      console.error('Failed to approve:', error);
      toast.error(error.response?.data?.detail || 'Failed to approve record');
    } finally {
      setProcessing(false);
    }
  };
  
  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    try {
      setProcessing(true);
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        { action: 'reject', comment },
        { headers: getAuthHeader() }
      );
      toast.success('Record rejected');
      onApproved();
    } catch (error) {
      console.error('Failed to reject:', error);
      toast.error(error.response?.data?.detail || 'Failed to reject record');
    } finally {
      setProcessing(false);
    }
  };
  
  // Reset edits
  const handleResetEdits = () => {
    const initialFields = {};
    
    if (fieldDefinitions.length > 0) {
      fieldDefinitions.forEach(field => {
        const key = field.field_key;
        if (originalFieldValues[key] !== undefined) {
          initialFields[key] = originalFieldValues[key];
        } else if (field.default_value !== undefined && field.default_value !== null) {
          initialFields[key] = field.default_value;
        } else {
          switch (field.type) {
            case 'number':
              initialFields[key] = '';
              break;
            case 'yes_no':
              initialFields[key] = null;
              break;
            case 'checkbox_group':
              initialFields[key] = [];
              break;
            case 'table':
              initialFields[key] = [];
              break;
            default:
              initialFields[key] = '';
          }
        }
      });
    } else {
      // Fallback for older requests without field_definitions
      Object.entries(originalFieldValues).forEach(([key, value]) => {
        initialFields[key] = value;
      });
    }
    
    setEditedFields(initialFields);
    setHasEdits(false);
  };
  
  // Render field based on field definition type
  const renderFieldByDefinition = (field) => {
    const key = field.field_key;
    const currentValue = editedFields[key];
    const originalValue = originalFieldValues[key];
    const isModified = JSON.stringify(currentValue) !== JSON.stringify(originalValue);
    const isFilled = originalValue !== undefined && originalValue !== null && originalValue !== '';
    
    const inputClasses = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
    
    let input;
    
    switch (field.type) {
      case 'number':
        input = (
          <input
            type="number"
            value={currentValue ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value ? parseFloat(e.target.value) : '')}
            className={inputClasses}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            disabled={processing}
            min={field.validation?.min}
            max={field.validation?.max}
          />
        );
        break;
        
      case 'textarea':
        input = (
          <textarea
            value={currentValue ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={`${inputClasses} resize-none`}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            rows={3}
            disabled={processing}
          />
        );
        break;
        
      case 'dropdown':
      case 'radio':
        input = (
          <select
            value={currentValue ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={inputClasses}
            disabled={processing}
          >
            <option value="">Select {field.label}</option>
            {(field.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
        break;
        
      case 'yes_no':
        // Handle both boolean (true/false) and string ('yes'/'no') values
        const yesNoValue = currentValue === true || currentValue === 'yes' ? 'yes' 
                        : currentValue === false || currentValue === 'no' ? 'no' 
                        : '';
        input = (
          <select
            value={yesNoValue}
            onChange={(e) => handleFieldChange(key, e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
            className={inputClasses}
            disabled={processing}
          >
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        );
        break;
        
      case 'date':
        input = (
          <input
            type="date"
            value={currentValue ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={inputClasses}
            disabled={processing}
          />
        );
        break;
        
      case 'unit_selector':
        // unit_selector is a simple dropdown for selecting units (like 'Litres', 'KiloLitres')
        // It stores a plain string value, same as 'dropdown' type
        input = (
          <select
            value={currentValue ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={inputClasses}
            disabled={processing}
          >
            <option value="">Select {field.label?.toLowerCase() || 'unit'}...</option>
            {(field.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
        break;
        
      case 'checkbox_group':
        input = (
          <div className="space-y-2">
            {(field.options || []).map(opt => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(currentValue || []).includes(opt)}
                  onChange={(e) => {
                    const arr = currentValue || [];
                    if (e.target.checked) {
                      handleFieldChange(key, [...arr, opt]);
                    } else {
                      handleFieldChange(key, arr.filter(v => v !== opt));
                    }
                  }}
                  className="rounded border-gray-300"
                  disabled={processing}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        );
        break;
        
      case 'file_upload':
        input = (
          <div className="text-sm text-text-muted p-2 border rounded-lg bg-stone-50">
            {currentValue ? (
              <span>File: {typeof currentValue === 'string' ? currentValue : 'Uploaded'}</span>
            ) : (
              <span>No file uploaded</span>
            )}
          </div>
        );
        break;
        
      case 'table':
        input = (
          <div className="text-sm text-text-muted p-2 border rounded-lg bg-stone-50">
            {Array.isArray(currentValue) && currentValue.length > 0 ? (
              <span>{currentValue.length} row(s) of data</span>
            ) : (
              <span>No table data</span>
            )}
          </div>
        );
        break;
        
      default: // text
        input = (
          <input
            type="text"
            value={currentValue ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={inputClasses}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            disabled={processing}
          />
        );
    }
    
    return (
      <div 
        key={key} 
        className={`space-y-1 p-3 rounded-lg ${isModified ? 'bg-amber-50 border border-amber-200' : isFilled ? 'bg-green-50 border border-green-200' : 'bg-stone-50 border border-stone-200'}`}
      >
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text-secondary">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="flex items-center gap-2">
            {isModified && <Badge className="bg-amber-100 text-amber-800 text-xs">Edited</Badge>}
            {!isModified && isFilled && <Badge className="bg-green-100 text-green-800 text-xs">Filled</Badge>}
            {!isModified && !isFilled && <Badge className="bg-stone-100 text-stone-600 text-xs">Empty</Badge>}
          </div>
        </div>
        {input}
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Edit indicator banner */}
      {snapshot.is_edit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-amber-500 text-white">Re-submission</Badge>
            <span className="font-medium text-amber-800">This record was edited after previous approval</span>
          </div>
          {snapshot.changes_summary && snapshot.changes_summary.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-amber-800 mb-2">Changes made:</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {snapshot.changes_summary.map((change, idx) => (
                  <div key={idx} className="bg-white rounded p-2 text-sm border border-amber-100">
                    <span className="font-medium capitalize">{change.field_key?.replace(/_/g, ' ')}</span>
                    <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                      <div className="text-red-600">
                        <span className="text-text-muted">Old: </span>
                        {change.old_value !== null && change.old_value !== undefined 
                          ? (typeof change.old_value === 'object' ? JSON.stringify(change.old_value) : String(change.old_value))
                          : <em className="text-stone-400">empty</em>}
                      </div>
                      <div className="text-green-600">
                        <span className="text-text-muted">New: </span>
                        {change.new_value !== null && change.new_value !== undefined 
                          ? (typeof change.new_value === 'object' ? JSON.stringify(change.new_value) : String(change.new_value))
                          : <em className="text-stone-400">empty</em>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Record Info */}
      <div className="bg-stone-50 rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-text-primary">Record Details</h4>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-muted">Category:</span>
            <p className="font-medium">{snapshot.category || 'N/A'}</p>
          </div>
          {snapshot.subcategory && (
            <div>
              <span className="text-text-muted">Subcategory:</span>
              <p className="font-medium">{snapshot.subcategory}</p>
            </div>
          )}
          <div>
            <span className="text-text-muted">Submitted By:</span>
            <p className="font-medium">{item.submitted_by_name || item.submitted_by_email || 'Unknown'}</p>
          </div>
          <div>
            <span className="text-text-muted">Submitted At:</span>
            <p className="font-medium">
              {item.submitted_at ? formatDateTime(item.submitted_at) : 'N/A'}
            </p>
          </div>
          {snapshot.reporting_period && (
            <div>
              <span className="text-text-muted">Reporting Period:</span>
              <p className="font-medium">
                {(() => {
                  const rp = snapshot.reporting_period;
                  if (typeof rp === 'string') return rp;
                  const month = rp.month;
                  const year = rp.year;
                  // Convert month number to name if needed
                  let monthDisplay = month;
                  if (month && typeof month === 'number') {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
                    monthDisplay = monthNames[month - 1] || month;
                  }
                  return `${monthDisplay ? monthDisplay + ' ' : ''}${year || ''}`;
                })()}
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Editable Data Fields */}
      {fieldDefinitions.length > 0 ? (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-text-primary">
              Record Fields ({fieldDefinitions.length})
            </h4>
            {hasEdits && (
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-100 text-amber-800">Modified</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetEdits}
                  disabled={processing}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted">
            Review and edit all fields for this category. Green = filled by submitter, Gray = empty.
          </p>
          
          <div className="space-y-3">
            {fieldDefinitions.map(field => renderFieldByDefinition(field))}
          </div>
        </div>
      ) : Object.keys(originalFieldValues).length > 0 ? (
        // Fallback for older approval requests without field_definitions
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-text-primary">Submitted Data</h4>
            {hasEdits && (
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-100 text-amber-800">Modified</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetEdits}
                  disabled={processing}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted">You can edit fields below before approving</p>
          
          <div className="space-y-3">
            {Object.entries(originalFieldValues).map(([key, value]) => {
              const currentValue = editedFields[key];
              const isModified = JSON.stringify(currentValue) !== JSON.stringify(value);
              return (
                <div 
                  key={key} 
                  className={`space-y-1 p-3 rounded-lg ${isModified ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text-secondary capitalize">
                      {key.replace(/_/g, ' ')}
                    </label>
                    {isModified && <Badge className="bg-amber-100 text-amber-800 text-xs">Edited</Badge>}
                  </div>
                  <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={currentValue ?? ''}
                    onChange={(e) => handleFieldChange(key, typeof value === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={processing}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4 text-center text-text-muted">
          No field definitions available for this record category
        </div>
      )}
      
      {/* Comment */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-primary">
          Comment {processing ? '' : '(required for rejection)'}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          disabled={processing}
        />
      </div>
      
      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={processing}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={processing}
          data-testid="reject-record-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Reject
        </Button>
        <Button
          onClick={handleApprove}
          disabled={processing}
          className="bg-green-600 hover:bg-green-700"
          data-testid="approve-record-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {hasEdits ? 'Approve with Edits' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}



/**
 * BRSRApprovalPanel - Review panel for BRSR response approvals (esg_response entity type)
 * Uses the existing QuestionRenderer from ESGQuestionnaire for consistent rendering
 */
function BRSRApprovalPanel({ item, onClose, onApproved, getAuthHeader }) {
  const { timezone } = useOrganization();
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [questionConfig, setQuestionConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  
  // Format date using organization timezone
  const formatDate = (dateStr) => formatDateTimeUtil(dateStr, timezone);
  
  // Get value from multiple possible paths (entity_snapshot for new system, value for old system)
  const submittedValue = item.entity_snapshot?.value || item.value || item.submissions?.[0]?.value || {};
  const [editedValue, setEditedValue] = useState(submittedValue);
  
  // Track if value was edited
  const originalValue = JSON.stringify(submittedValue);
  const hasEdits = JSON.stringify(editedValue) !== originalValue;
  
  // Fetch question config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const questionKey = item.entity_id || item.question_key;
        if (questionKey) {
          const res = await axios.get(
            `${API}/api/esg-questionnaire/configs/${questionKey}`,
            { headers: getAuthHeader() }
          );
          setQuestionConfig(res.data);
        }
      } catch (err) {
        console.warn('Could not fetch question config:', err);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchConfig();
  }, [item.entity_id, item.question_key, getAuthHeader]);
  
  // Get question display name (handles sub-question resolution)
  const getQuestionText = () => {
    if (questionConfig) {
      const desc = questionConfig.description || questionConfig.label || questionConfig.question || item.entity_id;
      if (questionConfig.resolved_from_parent && questionConfig.matched_sub_question) {
        const sub = questionConfig.matched_sub_question;
        return `${desc} → ${sub.label}`;
      }
      return desc;
    }
    return item.disclosure_name || item.entity_id || item.question_key;
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      const payload = { comment: comment || undefined };
      
      if (hasEdits) {
        payload.updated_data = { value: editedValue };
      }
      
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/approve`,
        payload,
        { headers: getAuthHeader() }
      );
      toast.success(hasEdits ? 'BRSR response approved with edits' : 'BRSR response approved');
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to approve BRSR response:', error);
      toast.error(error.response?.data?.detail || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setProcessing(true);
    try {
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/reject`,
        { comment },
        { headers: getAuthHeader() }
      );
      toast.success('BRSR response rejected');
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to reject BRSR response:', error);
      toast.error(error.response?.data?.detail || 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  // Import QuestionRenderer dynamically or use inline rendering
  // For now, use a simplified version that handles the common BRSR types
  const renderResponse = () => {
    // Use submittedValue for view mode (with fallback paths), editedValue for edit mode
    const value = isEditing ? editedValue : submittedValue;
    const config = questionConfig || {};
    const questionType = config.type || config.input_type;
    
    // Handle ngrbc_policy_matrix type (different structure from principle_toggle)
    if (questionType === 'ngrbc_policy_matrix' || (value && typeof value === 'object' && ('all_together' in value || 'principle_wise' in value))) {
      return <NGRBCPolicyMatrixDisplay 
        value={value} 
        onChange={isEditing ? setEditedValue : undefined}
        isEditing={isEditing}
        config={config}
      />;
    }
    
    // Handle principle_toggle type (NGRBC principles)
    if (questionType === 'principle_toggle' || questionType === 'principle_toggle_with_description' || (value && typeof value === 'object' && ('mode' in value || 'all_enabled' in value || 'principles' in value))) {
      return <PrincipleToggleDisplay 
        value={value} 
        onChange={isEditing ? setEditedValue : undefined}
        isEditing={isEditing}
        config={config}
      />;
    }
    
    // Handle table type (array of objects or table-like types)
    if (questionType === 'table' || questionType?.includes('table') || Array.isArray(value)) {
      return <TableDisplay 
        value={value}
        onChange={isEditing ? setEditedValue : undefined}
        isEditing={isEditing}
        config={config}
      />;
    }
    
    // Handle simple text/textarea
    if (typeof value === 'string') {
      return isEditing ? (
        <textarea
          value={value}
          onChange={(e) => setEditedValue(e.target.value)}
          className="w-full min-h-[100px] px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter response..."
        />
      ) : (
        <p className="text-stone-700 whitespace-pre-wrap">{value || '-'}</p>
      );
    }
    
    // Handle other object types with friendly display
    if (typeof value === 'object' && value !== null) {
      return <ObjectFieldsDisplay 
        value={value}
        onChange={isEditing ? setEditedValue : undefined}
        isEditing={isEditing}
      />;
    }
    
    return <p className="text-stone-400 italic">No response provided</p>;
  };

  return (
    <div className="space-y-5">
      {/* Question Text */}
      <Card className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100">
        <div className="flex items-start gap-2 mb-2">
          <Badge variant="outline" className="shrink-0 bg-amber-100 text-amber-800">BRSR</Badge>
        </div>
        {loadingConfig ? (
          <div className="flex items-center gap-2 text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading question...</span>
          </div>
        ) : (
          <p className="text-stone-800 font-medium leading-relaxed">
            {getQuestionText()}
          </p>
        )}
      </Card>

      {/* Submitter Info */}
      <div className="flex items-center gap-6 text-sm px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <span className="text-stone-500">Submitted by </span>
            <span className="font-medium text-stone-800">
              {item.submitted_by_name || item.submitted_by_email || 'Unknown'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-stone-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatDate(item.submitted_at)}</span>
        </div>
      </div>

      {/* Response Display */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-stone-700">Response</label>
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="h-7 text-xs gap-1"
          >
            <Activity className="w-3 h-3" />
            {isEditing ? 'Editing' : 'Edit'}
          </Button>
        </div>
        
        <Card className="p-4 bg-white border-stone-200">
          {renderResponse()}
        </Card>
        
        {hasEdits && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Response has been modified
          </p>
        )}
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-stone-700">
          Comment {processing ? '' : '(required for rejection)'}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          disabled={processing}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={processing}
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
          Reject
        </Button>
        <Button
          onClick={handleApprove}
          disabled={processing}
          className="bg-green-600 hover:bg-green-700"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {hasEdits ? 'Approve with Edits' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}

/**
 * GRIApprovalPanel - Review panel for GRI response approvals
 * GRI responses are typically simpler text/number values
 */
function GRIApprovalPanel({ item, onClose, onApproved, getAuthHeader }) {
  const { timezone } = useOrganization();
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [questionConfig, setQuestionConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  
  // Format date using organization timezone
  const formatDate = (dateStr) => formatDateTimeUtil(dateStr, timezone);
  
  // Get value from multiple possible paths (entity_snapshot for new system, value for old system)
  const submittedValue = item.entity_snapshot?.value || item.value || item.submissions?.[0]?.value || '';
  const [editedValue, setEditedValue] = useState(submittedValue);
  
  // Track if value was edited
  const originalValue = JSON.stringify(submittedValue);
  const hasEdits = JSON.stringify(editedValue) !== originalValue;
  
  // Fetch question config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const questionKey = item.entity_id || item.question_key;
        if (questionKey) {
          const res = await axios.get(
            `${API}/api/esg-questionnaire/configs/${questionKey}`,
            { headers: getAuthHeader() }
          );
          setQuestionConfig(res.data);
        }
      } catch (err) {
        console.warn('Could not fetch question config:', err);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchConfig();
  }, [item.entity_id, item.question_key, getAuthHeader]);
  
  // Get question display name (handles sub-question resolution)
  const getQuestionText = () => {
    if (questionConfig) {
      const desc = questionConfig.description || questionConfig.label || questionConfig.question || item.entity_id;
      if (questionConfig.resolved_from_parent && questionConfig.matched_sub_question) {
        const sub = questionConfig.matched_sub_question;
        return `${desc} → ${sub.sub_key}. ${sub.label}`;
      }
      return desc;
    }
    return item.disclosure_name || item.entity_id || item.question_key;
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      const payload = { comment: comment || undefined };
      
      if (hasEdits) {
        payload.updated_data = { value: editedValue };
      }
      
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/approve`,
        payload,
        { headers: getAuthHeader() }
      );
      toast.success(hasEdits ? 'GRI response approved with edits' : 'GRI response approved');
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to approve GRI response:', error);
      toast.error(error.response?.data?.detail || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setProcessing(true);
    try {
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/reject`,
        { comment },
        { headers: getAuthHeader() }
      );
      toast.success('GRI response rejected');
      onApproved?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to reject GRI response:', error);
      toast.error(error.response?.data?.detail || 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  // Render GRI response - typically simple text, number, or select values
  const renderResponse = () => {
    // Use submittedValue for view mode (with fallback paths), editedValue for edit mode
    const value = isEditing ? editedValue : submittedValue;
    const config = questionConfig || {};
    const inputType = config.input_type || config.type || 'textarea';
    
    if (isEditing) {
      // Editable mode
      if (inputType === 'number') {
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => setEditedValue(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter value..."
          />
        );
      }
      
      if (inputType === 'select' && config.options) {
        return (
          <select
            value={value || ''}
            onChange={(e) => setEditedValue(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select an option</option>
            {config.options.map((opt) => (
              <option key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </option>
            ))}
          </select>
        );
      }
      
      // Default to textarea
      return (
        <textarea
          value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          onChange={(e) => setEditedValue(e.target.value)}
          className="w-full min-h-[100px] px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter response..."
        />
      );
    }
    
    // Display mode
    if (value === null || value === undefined || value === '') {
      return <p className="text-stone-400 italic">No response provided</p>;
    }
    
    if (typeof value === 'string' || typeof value === 'number') {
      return <p className="text-stone-700 whitespace-pre-wrap">{value}</p>;
    }
    
    // Handle arrays or objects (shouldn't happen for GRI but just in case)
    if (typeof value === 'object') {
      return (
        <pre className="text-sm text-stone-700 bg-stone-50 p-3 rounded overflow-auto">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    
    return <p className="text-stone-700">{String(value)}</p>;
  };

  return (
    <div className="space-y-5">
      {/* Question Text */}
      <Card className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100">
        <div className="flex items-start gap-2 mb-2">
          <Badge variant="outline" className="shrink-0 bg-emerald-100 text-emerald-800">GRI</Badge>
          {questionConfig?.disclosure_number && (
            <Badge variant="outline" className="shrink-0 bg-stone-100 text-stone-600">
              {questionConfig.disclosure_number}
            </Badge>
          )}
        </div>
        {loadingConfig ? (
          <div className="flex items-center gap-2 text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading question...</span>
          </div>
        ) : (
          <p className="text-stone-800 font-medium leading-relaxed">
            {getQuestionText()}
          </p>
        )}
      </Card>

      {/* Submitter Info */}
      <div className="flex items-center gap-6 text-sm px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <span className="text-stone-500">Submitted by </span>
            <span className="font-medium text-stone-800">
              {item.submitted_by_name || item.submitted_by_email || 'Unknown'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-stone-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatDate(item.submitted_at)}</span>
        </div>
      </div>

      {/* Response Display */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-stone-700">Response</label>
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="h-7 text-xs gap-1"
          >
            <Activity className="w-3 h-3" />
            {isEditing ? 'Editing' : 'Edit'}
          </Button>
        </div>
        
        <Card className="p-4 bg-white border-stone-200">
          {renderResponse()}
        </Card>
        
        {hasEdits && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Response has been modified
          </p>
        )}
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-stone-700">
          Comment {processing ? '' : '(required for rejection)'}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          disabled={processing}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={processing}
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
          Reject
        </Button>
        <Button
          onClick={handleApprove}
          disabled={processing}
          className="bg-green-600 hover:bg-green-700"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {hasEdits ? 'Approve with Edits' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}

// NGRBC Principles list
const NGRBC_PRINCIPLES = [
  { key: "P1", name: "Ethics, Transparency and Accountability" },
  { key: "P2", name: "Sustainable and Safe Products/Services" },
  { key: "P3", name: "Employee Wellbeing" },
  { key: "P4", name: "Stakeholder Responsiveness" },
  { key: "P5", name: "Human Rights" },
  { key: "P6", name: "Environment Protection" },
  { key: "P7", name: "Policy Advocacy" },
  { key: "P8", name: "Inclusive Growth" },
  { key: "P9", name: "Customer Value" },
];

// Principle Toggle Display/Edit component (handles NGRBC all_together vs principle_wise)
function PrincipleToggleDisplay({ value, onChange, isEditing, config = {} }) {
  const data = value || { mode: 'all_together', all_enabled: null, all_description: '', principles: {} };
  
  const handleModeChange = (newMode) => {
    onChange?.({ ...data, mode: newMode });
  };

  const handleAllChange = (field, val) => {
    onChange?.({ ...data, [field]: val });
  };

  const handlePrincipleChange = (key, field, val) => {
    const principles = { ...data.principles };
    if (!principles[key]) principles[key] = { enabled: null, description: '' };
    principles[key][field] = val;
    onChange?.({ ...data, principles });
  };

  // Read-only display
  if (!isEditing) {
    return (
      <div className="space-y-3">
        <Badge variant="outline" className="mb-2">
          Mode: {data.mode === 'all_together' ? 'All Principles Together' : 'Principle-wise'}
        </Badge>
        {data.mode === 'all_together' ? (
          <div className="bg-stone-50 p-3 rounded space-y-1">
            <p className="text-sm"><strong>Applicable to all principles:</strong> {data.all_enabled === true ? 'Yes' : data.all_enabled === false ? 'No' : '-'}</p>
            <p className="text-sm"><strong>Description / Justification:</strong> {data.all_description || '-'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {NGRBC_PRINCIPLES.map((p) => {
              const pData = data.principles?.[p.key] || {};
              return (
                <div key={p.key} className="bg-stone-50 p-2 rounded text-sm">
                  <strong>{p.key} - {p.name}:</strong>{' '}
                  {pData.enabled === true ? 'Yes' : pData.enabled === false ? 'No' : '-'}
                  {pData.description && <span className="text-stone-600"> - {pData.description}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Editing mode
  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Mode:</label>
        <select
          value={data.mode || 'all_together'}
          onChange={(e) => handleModeChange(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all_together">Fill All Principles Together</option>
          <option value="principle_wise">Fill Principle-wise Separately</option>
        </select>
      </div>

      {data.mode === 'all_together' ? (
        <div className="space-y-3 bg-stone-50 p-4 rounded-lg">
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-600">Applicable to all principles?</label>
            <select
              value={data.all_enabled === true ? 'yes' : data.all_enabled === false ? 'no' : ''}
              onChange={(e) => handleAllChange('all_enabled', e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-600">Description / Justification</label>
            <textarea
              value={data.all_description || ''}
              onChange={(e) => handleAllChange('all_description', e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter description or justification..."
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {NGRBC_PRINCIPLES.map((p) => {
            const pData = data.principles?.[p.key] || {};
            return (
              <div key={p.key} className="bg-stone-50 p-3 rounded-lg space-y-2">
                <p className="text-sm font-medium">{p.key} - {p.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-stone-600">Applicable?</label>
                    <select
                      value={pData.enabled === true ? 'yes' : pData.enabled === false ? 'no' : ''}
                      onChange={(e) => handlePrincipleChange(p.key, 'enabled', e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
                      className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select...</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-600">Description</label>
                    <input
                      type="text"
                      value={pData.description || ''}
                      onChange={(e) => handlePrincipleChange(p.key, 'description', e.target.value)}
                      className="w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter description..."
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// NGRBC Policy Matrix Display/Edit component (handles ngrbc_policy_matrix type)
// Different from PrincipleToggleDisplay - uses all_together/principle_wise structure
function NGRBCPolicyMatrixDisplay({ value, onChange, isEditing, config = {} }) {
  const defaultAllTogether = { covered: null, board_approved: null, web_link: '', reasons: {} };
  const data = value || { mode: 'together', all_together: defaultAllTogether, principle_wise: {} };
  const mode = data.mode || 'together';
  const allTogether = data.all_together || defaultAllTogether;
  const principleWise = data.principle_wise || {};
  
  const noReasons = [
    { key: 'not_material', label: 'Not material to business' },
    { key: 'not_ready', label: 'Not ready to implement' },
    { key: 'no_resources', label: 'No resources available' },
    { key: 'planned_next_fy', label: 'Planned for next FY' },
    { key: 'other', label: 'Other reason', hasText: true }
  ];

  const handleModeChange = (newMode) => {
    onChange?.({ ...data, mode: newMode });
  };

  const handleAllTogetherChange = (field, val) => {
    onChange?.({ 
      ...data, 
      all_together: { ...allTogether, [field]: val } 
    });
  };

  const handleAllTogetherReasonChange = (reasonKey, checked, textVal = '') => {
    onChange?.({
      ...data,
      all_together: {
        ...allTogether,
        reasons: {
          ...allTogether.reasons,
          [reasonKey]: checked ? (reasonKey === 'other' ? textVal || true : true) : false
        }
      }
    });
  };

  const handlePrincipleChange = (principle, field, val) => {
    onChange?.({
      ...data,
      principle_wise: {
        ...principleWise,
        [principle]: { ...principleWise[principle], [field]: val }
      }
    });
  };

  // Read-only display
  if (!isEditing) {
    return (
      <div className="space-y-3">
        <Badge variant="outline" className="mb-2">
          Mode: {mode === 'together' ? 'All Principles Together' : 'Principle-wise'}
        </Badge>
        {mode === 'together' ? (
          <div className="bg-stone-50 p-3 rounded space-y-2">
            <p className="text-sm"><strong>Policies cover NGRBCs:</strong> {allTogether.covered === true ? 'Yes' : allTogether.covered === false ? 'No' : '-'}</p>
            {allTogether.covered === true && (
              <>
                <p className="text-sm"><strong>Board Approved:</strong> {allTogether.board_approved === true ? 'Yes' : allTogether.board_approved === false ? 'No' : '-'}</p>
                <p className="text-sm"><strong>Web Link:</strong> {allTogether.web_link || '-'}</p>
              </>
            )}
            {allTogether.covered === false && allTogether.reasons && Object.keys(allTogether.reasons).length > 0 && (
              <div className="text-sm">
                <strong>Reasons:</strong>
                <ul className="list-disc pl-5 text-xs mt-1">
                  {noReasons.filter(r => allTogether.reasons?.[r.key]).map(r => (
                    <li key={r.key}>{r.label}{r.key === 'other' && typeof allTogether.reasons?.other === 'string' ? `: ${allTogether.reasons.other}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {NGRBC_PRINCIPLES.map((p) => {
              const pData = principleWise[p.key] || {};
              return (
                <div key={p.key} className="bg-stone-50 p-2 rounded text-sm">
                  <strong className="text-violet-700">{p.key} - {p.name}:</strong>{' '}
                  <span>{pData.covered === true ? 'Yes' : pData.covered === false ? 'No' : '-'}</span>
                  {pData.covered === true && (
                    <span className="text-stone-600 ml-2">
                      | Board: {pData.board_approved === true ? 'Yes' : pData.board_approved === false ? 'No' : '-'}
                      {pData.web_link && <> | Link: {pData.web_link}</>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Editing mode
  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Mode:</label>
        <select 
          value={mode} 
          onChange={(e) => handleModeChange(e.target.value)}
          className="px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="together">All Principles Together</option>
          <option value="separate">Principle-wise Separately</option>
        </select>
      </div>

      {/* All Together Mode */}
      {mode === 'together' && (
        <div className="border rounded p-3 space-y-3">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Policies cover NGRBCs:</label>
            <select
              value={allTogether.covered === true ? 'yes' : allTogether.covered === false ? 'no' : ''}
              onChange={(e) => handleAllTogetherChange('covered', e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
              className="px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          
          {allTogether.covered === true && (
            <div className="pl-4 border-l-2 border-green-300 space-y-3">
              <div className="flex items-center gap-4">
                <label className="text-sm">Board Approved:</label>
                <select
                  value={allTogether.board_approved === true ? 'yes' : allTogether.board_approved === false ? 'no' : ''}
                  onChange={(e) => handleAllTogetherChange('board_approved', e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
                  className="px-3 py-1.5 border rounded text-sm"
                >
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="text-sm">Web Link:</label>
                <input
                  type="text"
                  value={allTogether.web_link || ''}
                  onChange={(e) => handleAllTogetherChange('web_link', e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 border rounded text-sm"
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
          
          {allTogether.covered === false && (
            <div className="pl-4 border-l-2 border-red-300 space-y-2">
              <label className="text-sm font-medium">Reasons:</label>
              {noReasons.map(reason => (
                <div key={reason.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={!!allTogether.reasons?.[reason.key]}
                    onChange={(e) => handleAllTogetherReasonChange(reason.key, e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm">{reason.label}</span>
                  {reason.hasText && allTogether.reasons?.[reason.key] && (
                    <input
                      type="text"
                      value={typeof allTogether.reasons?.other === 'string' ? allTogether.reasons.other : ''}
                      onChange={(e) => handleAllTogetherReasonChange('other', true, e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                      placeholder="Specify..."
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Principle-wise Mode */}
      {mode === 'separate' && (
        <div className="space-y-3">
          {NGRBC_PRINCIPLES.map((p) => {
            const pData = principleWise[p.key] || {};
            return (
              <div key={p.key} className="border rounded p-3">
                <div className="font-medium text-sm text-violet-700 mb-2">{p.key}: {p.name}</div>
                <div className="flex items-center gap-4">
                  <label className="text-sm">Covered:</label>
                  <select
                    value={pData.covered === true ? 'yes' : pData.covered === false ? 'no' : ''}
                    onChange={(e) => handlePrincipleChange(p.key, 'covered', e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    <option value="">Select...</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                {pData.covered === true && (
                  <div className="mt-2 pl-3 border-l-2 border-green-300 space-y-2">
                    <div className="flex items-center gap-4">
                      <label className="text-xs">Board Approved:</label>
                      <select
                        value={pData.board_approved === true ? 'yes' : pData.board_approved === false ? 'no' : ''}
                        onChange={(e) => handlePrincipleChange(p.key, 'board_approved', e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)}
                        className="px-2 py-1 border rounded text-xs"
                      >
                        <option value="">Select...</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs">Web Link:</label>
                      <input
                        type="text"
                        value={pData.web_link || ''}
                        onChange={(e) => handlePrincipleChange(p.key, 'web_link', e.target.value)}
                        className="w-full mt-1 px-2 py-1 border rounded text-xs"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Generic object fields display/edit (for non-principle BRSR fields)
function ObjectFieldsDisplay({ value, onChange, isEditing }) {
  const FIELD_LABELS = {
    all_description: 'Description / Justification',
    all_enabled: 'Applicable to all principles?',
    mode: 'Mode',
    value: 'Value',
    description: 'Description',
    justification: 'Justification',
    response: 'Response',
  };

  const handleFieldChange = (key, newVal) => {
    onChange?.({ ...value, [key]: newVal });
  };
  
  // Helper to format any value for display
  const formatValue = (val) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (Array.isArray(val)) return `${val.length} item(s)`;
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  const entries = Object.entries(value || {}).filter(([_, v]) => v !== null && v !== undefined);
  
  if (entries.length === 0) {
    return <p className="text-stone-400 italic">No response provided</p>;
  }

  if (!isEditing) {
    return (
      <div className="space-y-3">
        {entries.map(([key, val]) => (
          <div key={key} className="border-b border-stone-100 pb-2 last:border-0 last:pb-0">
            <div className="text-xs font-medium text-stone-500 mb-1">
              {FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <div className="text-stone-800">
              {Array.isArray(val) || (typeof val === 'object' && val !== null) ? (
                <TableDisplay value={val} isEditing={false} />
              ) : (
                formatValue(val)
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, val]) => (
        <div key={key} className="space-y-1">
          <label className="text-xs font-medium text-stone-600">
            {FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </label>
          {typeof val === 'boolean' ? (
            <select
              value={val ? 'yes' : 'no'}
              onChange={(e) => handleFieldChange(key, e.target.value === 'yes')}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          ) : key === 'mode' ? (
            <select
              value={val || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all_together">All Together</option>
              <option value="individual">Individual</option>
              <option value="principle_wise">Principle-wise</option>
            </select>
          ) : Array.isArray(val) || (typeof val === 'object' && val !== null) ? (
            <TableDisplay 
              value={val} 
              onChange={(newVal) => handleFieldChange(key, newVal)}
              isEditing={true}
            />
          ) : (
            <textarea
              value={val || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className="w-full min-h-[60px] px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`Enter ${FIELD_LABELS[key] || key}...`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Table display/edit component for array data
function TableDisplay({ value, onChange, isEditing, config = {} }) {
  // Format column header for display
  const formatHeader = (key) => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };
  
  // Format cell value
  const formatCell = (val) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Handle array data (standard table)
  if (Array.isArray(value)) {
    const data = value;
    if (data.length === 0) {
      return <p className="text-stone-400 italic text-sm">No table data</p>;
    }
    
    const columns = Object.keys(data[0] || {});
    
    const handleCellChange = (rowIndex, colKey, newValue) => {
      if (!onChange) return;
      const newData = [...data];
      newData[rowIndex] = { ...newData[rowIndex], [colKey]: newValue };
      onChange(newData);
    };

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-stone-100">
              {columns.map(col => (
                <th key={col} className="border border-stone-200 px-3 py-2 text-left font-medium text-stone-700">
                  {formatHeader(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                {columns.map(col => (
                  <td key={col} className="border border-stone-200 px-3 py-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={row[col] ?? ''}
                        onChange={(e) => handleCellChange(rowIndex, col, e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span className="text-stone-800">{formatCell(row[col])}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-stone-500 mt-2">{data.length} row(s)</p>
      </div>
    );
  }
  
  // Handle object with nested objects (like {bod: {total: 87, trained: 23}, ...})
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return <p className="text-stone-400 italic text-sm">No data</p>;
    }
    
    // Check if values are nested objects
    const hasNestedObjects = keys.some(k => typeof value[k] === 'object' && value[k] !== null && !Array.isArray(value[k]));
    
    if (hasNestedObjects) {
      // Get all unique inner keys across all nested objects
      const innerKeys = new Set();
      keys.forEach(k => {
        if (typeof value[k] === 'object' && value[k] !== null) {
          Object.keys(value[k]).forEach(ik => innerKeys.add(ik));
        }
      });
      const innerKeysArr = Array.from(innerKeys);
      
      const handleNestedCellChange = (outerKey, innerKey, newValue) => {
        if (!onChange) return;
        onChange({
          ...value,
          [outerKey]: { ...(value[outerKey] || {}), [innerKey]: newValue }
        });
      };
      
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-stone-100">
                <th className="border border-stone-200 px-3 py-2 text-left font-medium text-stone-700">Category</th>
                {innerKeysArr.map(ik => (
                  <th key={ik} className="border border-stone-200 px-3 py-2 text-left font-medium text-stone-700">
                    {formatHeader(ik)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, idx) => (
                <tr key={k} className={idx % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
                  <td className="border border-stone-200 px-3 py-2 font-medium text-stone-700">
                    {formatHeader(k)}
                  </td>
                  {innerKeysArr.map(ik => (
                    <td key={ik} className="border border-stone-200 px-3 py-2">
                      {isEditing && onChange ? (
                        <input
                          type="text"
                          value={typeof value[k] === 'object' && value[k] !== null ? (value[k][ik] ?? '') : ''}
                          onChange={(e) => handleNestedCellChange(k, ik, e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-stone-800">
                          {typeof value[k] === 'object' && value[k] !== null 
                            ? formatCell(value[k][ik])
                            : '-'}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    
    // Simple key-value object (not nested)
    const handleSimpleChange = (k, newValue) => {
      if (!onChange) return;
      onChange({ ...value, [k]: newValue });
    };

    return (
      <div className="space-y-1">
        {keys.map(k => (
          <div key={k} className="flex gap-2 text-sm items-center">
            <span className="font-medium text-stone-600 shrink-0">{formatHeader(k)}:</span>
            {isEditing && onChange ? (
              <input
                type="text"
                value={value[k] ?? ''}
                onChange={(e) => handleSimpleChange(k, e.target.value)}
                className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : (
              <span className="text-stone-800">{formatCell(value[k])}</span>
            )}
          </div>
        ))}
      </div>
    );
  }
  
  // Fallback for non-object/non-array values
  return <p className="text-stone-400 italic text-sm">No table data</p>;
}
