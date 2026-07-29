import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import SubmissionReviewPanel from './SubmissionReviewPanel';
import EmissionApprovalWrapper from './EmissionApprovalWrapper';
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
      const allowedEntityTypes = ['esg_record', 'emission_record', 'esg_response'];
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
            section: r.entity_subtype || 'environment',
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
            _source: 'approval_workflow',
            _approval_request_id: r.id,
            _needs_config: r.entity_type === 'esg_response', // Flag for config enrichment
          };
        });
      
      // Fetch question configs for BRSR items to get proper display names
      const brsrItems = recordApprovals.filter(r => r._needs_config);
      if (brsrItems.length > 0) {
        try {
          const questionKeys = brsrItems.map(r => r.entity_id).filter(Boolean);
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
            if (item._needs_config && configMap[item.entity_id]) {
              const cfg = configMap[item.entity_id];
              return {
                ...item,
                disclosure_name: cfg.description || cfg.label || cfg.question || item.entity_id,
              };
            }
            return item;
          });
        } catch (configErr) {
          console.warn('Could not fetch BRSR question configs:', configErr);
        }
      }
      
      // Combine questionnaire submissions + record approvals
      const allItems = [
        ...(questionnaireRes.data.submissions || []),
        ...recordApprovals
      ];
      
      // Deduplicate by id
      const seen = new Set();
      const deduplicated = allItems.filter(item => {
        const key = item._approval_request_id || item.id || item.question_key;
        if (seen.has(key)) {
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
          {submissions.map((item) => {
            const isRecordApproval = item._source === 'approval_workflow';
            const isEmissionRecord = item.entity_type === 'emission_record';
            const isQuestionnaireApproval = item._source === 'questionnaire_approval_v2';
            return (
              <Card 
                key={item.id || item.question_key}
                className="p-4 hover:bg-stone-50 transition-colors cursor-pointer"
                onClick={() => setSelectedQuestion(item)}
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
                        ) : isRecordApproval ? (
                          <Badge className="bg-emerald-100 text-emerald-800">Data Record</Badge>
                        ) : (
                          getSectionBadge(item)
                        )}
                        {item.request_type && item.request_type !== 'create' && (
                          <Badge variant="outline" className="text-xs">
                            {item.request_type.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-text-muted">
                        {isQuestionnaireApproval ? (
                          <>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {item.submitted_by_name || item.submitted_by_email || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(item.submitted_at)}
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
                              {formatDate(item.submitted_at)}
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
                              Latest: {formatDate(item.submissions?.[0]?.submitted_at)}
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
            ) : selectedQuestion.entity_type === 'esg_response' ? (
              <BRSRApprovalPanel
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
                Review GRI Submission
              </DialogTitle>
            </DialogHeader>
            
            <SubmissionReviewPanel
              questionKey={selectedQuestion.question_key}
              reportingPeriod={selectedQuestion.reporting_period || reportingPeriod}
              onClose={() => setSelectedQuestion(null)}
              onApproved={handleApprovalComplete}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * RecordApprovalPanel - Review panel for ESG Record approvals
 * Allows approvers to view and edit record data before approval
 * Shows ALL fields defined for the category, not just filled ones
 */
function RecordApprovalPanel({ item, onClose, onApproved, getAuthHeader }) {
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');
  const [editedFields, setEditedFields] = useState({});
  const [hasEdits, setHasEdits] = useState(false);
  
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
              {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : 'N/A'}
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
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [questionConfig, setQuestionConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [editedValue, setEditedValue] = useState(item.entity_snapshot?.value || {});
  
  // Track if value was edited
  const originalValue = JSON.stringify(item.entity_snapshot?.value || {});
  const hasEdits = JSON.stringify(editedValue) !== originalValue;
  
  // Fetch question config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const questionKey = item.entity_id || item.question_key;
        if (questionKey) {
          const res = await axios.get(
            `${API}/api/esg-questionnaire/config/${questionKey}`,
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
  
  // Get question display name
  const getQuestionText = () => {
    if (questionConfig) {
      return questionConfig.description || questionConfig.label || questionConfig.question || item.entity_id;
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

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Import QuestionRenderer dynamically or use inline rendering
  // For now, use a simplified version that handles the common BRSR types
  const renderResponse = () => {
    const value = isEditing ? editedValue : item.entity_snapshot?.value;
    const config = questionConfig || {};
    const questionType = config.type || config.input_type;
    
    // Handle principle_toggle type (NGRBC principles)
    if (questionType === 'principle_toggle' || (value && typeof value === 'object' && ('mode' in value || 'all_enabled' in value || 'principles' in value))) {
      return <PrincipleToggleDisplay 
        value={value} 
        onChange={isEditing ? setEditedValue : undefined}
        isEditing={isEditing}
        config={config}
      />;
    }
    
    // Handle table type (array of objects)
    if (questionType === 'table' || Array.isArray(value)) {
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
                      <span className="text-stone-800">
                        {typeof value[k] === 'object' && value[k] !== null 
                          ? (value[k][ik] ?? '-')
                          : '-'}
                      </span>
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
    return (
      <div className="space-y-1">
        {keys.map(k => (
          <div key={k} className="flex gap-2 text-sm">
            <span className="font-medium text-stone-600">{formatHeader(k)}:</span>
            <span className="text-stone-800">{formatCell(value[k])}</span>
          </div>
        ))}
      </div>
    );
  }
  
  // Fallback for non-object/non-array values
  return <p className="text-stone-400 italic text-sm">No table data</p>;
}
