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
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import SubmissionReviewPanel from './SubmissionReviewPanel';
import QuestionnaireApprovalPanel from './QuestionnaireApprovalPanel';
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
      
      // Fetch questionnaire submissions (old system)
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
      
      // Fetch V2 questionnaire response approvals
      const questionnaireV2Promise = axios.get(
        `${API}/api/approval-workflows/questionnaire/queue`,
        { headers: getAuthHeader() }
      ).catch(err => {
        console.warn('Failed to fetch V2 questionnaire approvals:', err);
        return { data: { items: [] } };
      });
      
      const [questionnaireRes, recordApprovalsRes, questionnaireV2Res] = await Promise.all([
        questionnairePromise,
        recordApprovalsPromise,
        questionnaireV2Promise
      ]);
      
      // Transform record approvals to match submission format
      // Handle both esg_record and emission_record types
      const recordApprovals = (recordApprovalsRes.data.requests || [])
        .filter(r => r.entity_type === 'esg_record' || r.entity_type === 'emission_record')
        .map(r => ({
          id: r.id,
          entity_type: r.entity_type,  // Keep original type (esg_record or emission_record)
          entity_id: r.entity_id,
          section: r.entity_subtype || 'environment',
          question_key: `record_${r.entity_snapshot?.category || 'unknown'}`,
          disclosure_name: r.entity_type === 'emission_record' 
            ? `GHG ${r.entity_snapshot?.scope?.toUpperCase() || ''} - ${r.entity_snapshot?.category || 'Emissions'}${r.entity_snapshot?.sub_category ? ' → ' + r.entity_snapshot.sub_category : ''}`
            : `${r.entity_snapshot?.category}${r.entity_snapshot?.subcategory ? ' → ' + r.entity_snapshot.subcategory : ''}`,
          submitted_by: r.submitted_by,
          submitted_by_name: r.submitted_by_name,
          submitted_by_email: r.submitted_by_email,
          submitted_at: r.submitted_at,
          status: r.status,
          workflow_name: r.workflow_name,
          entity_snapshot: r.entity_snapshot,
          request_type: r.request_type,  // 'create', 'update', 'delete'
          _source: 'approval_workflow',
          _approval_request_id: r.id,
        }));
      
      // Transform V2 questionnaire approvals
      const questionnaireV2Approvals = (questionnaireV2Res.data.items || [])
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
          _source: 'questionnaire_approval_v2',
          _response_id: item.id,
        }));
      
      // Combine all sources
      setSubmissions([
        ...(questionnaireRes.data.submissions || []),
        ...recordApprovals,
        ...questionnaireV2Approvals
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
                <span className="font-mono">
                  {selectedQuestion?._source === 'approval_workflow' 
                    ? selectedQuestion.disclosure_name 
                    : selectedQuestion?.question_key}
                </span>
              </DialogTitle>
            </DialogHeader>
            
            {selectedQuestion && selectedQuestion._source === 'approval_workflow' ? (
              selectedQuestion.entity_type === 'emission_record' ? (
                <EmissionApprovalPanel
                  item={selectedQuestion}
                  onClose={() => setSelectedQuestion(null)}
                  onApproved={handleApprovalComplete}
                  getAuthHeader={getAuthHeader}
                />
              ) : (
                <RecordApprovalPanel
                  item={selectedQuestion}
                  onClose={() => setSelectedQuestion(null)}
                  onApproved={handleApprovalComplete}
                  getAuthHeader={getAuthHeader}
                />
              )
            ) : selectedQuestion ? (
              <SubmissionReviewPanel
                questionKey={selectedQuestion.question_key}
                reportingPeriod={selectedQuestion.reporting_period || reportingPeriod}
                onClose={() => setSelectedQuestion(null)}
                onApproved={handleApprovalComplete}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      )}
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
 * EmissionApprovalPanel - Review panel for GHG Emission Record approvals
 * Shows emission-specific fields with proper formatting
 * Handles both CREATE and UPDATE request types with diff view
 * Allows approver to modify inputs, override emission factors, and recalculate
 */
function EmissionApprovalPanel({ item, onClose, onApproved, getAuthHeader }) {
  const [processing, setProcessing] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [comment, setComment] = useState('');
  
  const snapshot = item.entity_snapshot || {};
  const requestType = item.request_type || snapshot.edit_type || 'create';
  const isUpdate = requestType === 'update';
  const originalValues = snapshot.original_values || {};
  const proposedChanges = snapshot.proposed_changes || {};
  
  // Get the actual data to display (proposed for updates, snapshot for creates)
  const currentData = isUpdate ? { ...snapshot, ...proposedChanges } : snapshot;
  
  // Editable state for approver modifications
  const [editedInputs, setEditedInputs] = useState(() => {
    const inputs = currentData.inputs || currentData.dynamic_field_values || {};
    // Convert to editable format
    const editable = {};
    Object.entries(inputs).forEach(([key, val]) => {
      editable[key] = {
        value: val?.value ?? '',
        unit: val?.unit || '',
        is_override: val?.is_override || false
      };
    });
    return editable;
  });
  
  // Store original inputs for reset and comparison
  const [originalInputs] = useState(() => {
    const inputs = currentData.inputs || currentData.dynamic_field_values || {};
    const original = {};
    Object.entries(inputs).forEach(([key, val]) => {
      original[key] = {
        value: val?.value ?? '',
        unit: val?.unit || '',
        is_override: val?.is_override || false
      };
    });
    return original;
  });
  
  // Override state
  const [overrideEnabled, setOverrideEnabled] = useState(
    currentData.emission_factor_override?.enabled || 
    currentData.has_custom_ef || 
    false
  );
  const [customEmissionFactor, setCustomEmissionFactor] = useState(
    currentData.emission_factor_override?.value || 
    currentData.emission_factor_used || 
    ''
  );
  const [originalOverride] = useState({
    enabled: currentData.emission_factor_override?.enabled || currentData.has_custom_ef || false,
    value: currentData.emission_factor_override?.value || currentData.emission_factor_used || ''
  });
  
  // Calculated emissions (can be recalculated)
  const [calculatedEmissions, setCalculatedEmissions] = useState({
    co2: snapshot.co2_emissions,
    ch4: snapshot.ch4_emissions,
    n2o: snapshot.n2o_emissions,
    total: snapshot.total_emissions || snapshot.co2e_emissions
  });
  const [originalEmissions] = useState({
    co2: snapshot.co2_emissions,
    ch4: snapshot.ch4_emissions,
    n2o: snapshot.n2o_emissions,
    total: snapshot.total_emissions || snapshot.co2e_emissions
  });
  
  // Track if approver made any modifications
  const hasModifications = useMemo(() => {
    // Check input modifications
    for (const key of Object.keys(editedInputs)) {
      if (editedInputs[key]?.value !== originalInputs[key]?.value) {
        return true;
      }
    }
    // Check override modifications
    if (overrideEnabled !== originalOverride.enabled) return true;
    if (overrideEnabled && customEmissionFactor !== originalOverride.value) return true;
    return false;
  }, [editedInputs, originalInputs, overrideEnabled, customEmissionFactor, originalOverride]);
  
  // Build modification audit trail
  const getModificationAudit = useCallback(() => {
    const modifications = [];
    
    // Input changes
    for (const key of Object.keys(editedInputs)) {
      const oldVal = originalInputs[key]?.value;
      const newVal = editedInputs[key]?.value;
      if (oldVal !== newVal) {
        modifications.push({
          field: key,
          old_value: oldVal,
          new_value: newVal,
          unit: editedInputs[key]?.unit
        });
      }
    }
    
    // Override changes
    if (overrideEnabled !== originalOverride.enabled) {
      modifications.push({
        field: 'emission_factor_override',
        old_value: originalOverride.enabled ? 'Enabled' : 'Disabled',
        new_value: overrideEnabled ? 'Enabled' : 'Disabled'
      });
    }
    if (overrideEnabled && customEmissionFactor !== originalOverride.value) {
      modifications.push({
        field: 'custom_emission_factor',
        old_value: originalOverride.value || 'N/A',
        new_value: customEmissionFactor
      });
    }
    
    return modifications;
  }, [editedInputs, originalInputs, overrideEnabled, customEmissionFactor, originalOverride]);
  
  // Format emission value
  const formatEmission = (value) => {
    if (value === null || value === undefined) return '-';
    return typeof value === 'number' ? value.toFixed(4) : value;
  };
  
  // Handle input change
  const handleInputChange = (key, value) => {
    setEditedInputs(prev => ({
      ...prev,
      [key]: { ...prev[key], value: value }
    }));
  };
  
  // Reset to original values
  const handleReset = () => {
    setEditedInputs({ ...originalInputs });
    setOverrideEnabled(originalOverride.enabled);
    setCustomEmissionFactor(originalOverride.value);
    setCalculatedEmissions({ ...originalEmissions });
  };
  
  // Recalculate emissions
  const handleRecalculate = async () => {
    setCalculating(true);
    try {
      // Build inputs for calculation API
      const inputs = {};
      Object.entries(editedInputs).forEach(([key, val]) => {
        inputs[key] = {
          value: parseFloat(val.value) || 0,
          unit: val.unit
        };
      });
      
      // Call calculation endpoint
      const response = await axios.post(
        `${API}/api/calc-engine/execute-by-category`,
        {
          category_id: snapshot.category_id,
          inputs: inputs,
          context: {
            scope: snapshot.scope,
            category: snapshot.category,
            fuel_name: snapshot.fuel_type || snapshot.sub_category
          },
          user_overrides: overrideEnabled && customEmissionFactor ? {
            ef: { value: parseFloat(customEmissionFactor), unit: 'kgCO2/TJ' }
          } : {},
          dry_run: true
        },
        { headers: getAuthHeader() }
      );
      
      if (response.data.ok) {
        const outputs = response.data.outputs || {};
        setCalculatedEmissions({
          co2: outputs.co2?.value || 0,
          ch4: outputs.ch4?.value || 0,
          n2o: outputs.n2o?.value || 0,
          total: outputs.co2e?.value || 0
        });
        toast.success('Emissions recalculated');
      } else {
        toast.error('Calculation failed');
      }
    } catch (e) {
      console.error('Recalculate error:', e);
      toast.error(e.response?.data?.detail || 'Failed to recalculate');
    }
    setCalculating(false);
  };
  
  const handleApprove = async () => {
    setProcessing(true);
    try {
      // Build updated_data if modifications were made
      const updatedData = hasModifications ? {
        inputs: editedInputs,
        emission_factor_override: overrideEnabled ? {
          enabled: true,
          value: parseFloat(customEmissionFactor) || null
        } : { enabled: false },
        calculated_emissions: calculatedEmissions,
        approver_modifications: getModificationAudit()
      } : null;
      
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        { 
          action: 'approve', 
          comment: comment || (hasModifications ? 'Approved with modifications' : 'Approved'),
          updated_data: updatedData
        },
        { headers: getAuthHeader() }
      );
      toast.success(hasModifications ? 'Emission record approved with modifications' : 'Emission record approved');
      onApproved?.();
      onClose?.();
    } catch (e) {
      console.error('Approve error:', e);
      toast.error(e.response?.data?.detail || 'Failed to approve');
    }
    setProcessing(false);
  };
  
  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setProcessing(true);
    try {
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        { action: 'reject', comment },
        { headers: getAuthHeader() }
      );
      toast.success('Emission record rejected');
      onApproved?.();
      onClose?.();
    } catch (e) {
      console.error('Reject error:', e);
      toast.error(e.response?.data?.detail || 'Failed to reject');
    }
    setProcessing(false);
  };
  
  const evidenceFiles = snapshot.evidence_files || [];
  const inputFieldKeys = Object.keys(editedInputs);
  
  return (
    <div className="space-y-4 p-4" data-testid="emission-approval-panel">
      {/* Header Info */}
      <div className="bg-stone-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">
            {isUpdate ? 'Update Request' : 'New Submission'} - {snapshot.scope?.toUpperCase() || 'GHG'}
          </h3>
          <div className="flex items-center gap-2">
            {hasModifications && (
              <Badge className="bg-violet-100 text-violet-700">Modified by Approver</Badge>
            )}
            <Badge variant={isUpdate ? 'secondary' : 'default'}>
              {requestType.toUpperCase()}
            </Badge>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-stone-500">Category:</span>
            <span className="ml-2 font-medium">{snapshot.category || '-'}</span>
          </div>
          <div>
            <span className="text-stone-500">Sub-category:</span>
            <span className="ml-2 font-medium">{snapshot.sub_category || '-'}</span>
          </div>
          <div>
            <span className="text-stone-500">Facility:</span>
            <span className="ml-2 font-medium">{snapshot.facility_name || snapshot.facility_id || '-'}</span>
          </div>
          <div>
            <span className="text-stone-500">Period:</span>
            <span className="ml-2 font-medium">{snapshot.reporting_period || '-'}</span>
          </div>
        </div>
        
        <div className="text-sm">
          <span className="text-stone-500">Submitted by:</span>
          <span className="ml-2 font-medium">{item.submitted_by_name || item.submitted_by_email}</span>
          <span className="text-stone-400 ml-2">
            {item.submitted_at && new Date(item.submitted_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      {/* Update Diff View for UPDATE requests */}
      {isUpdate && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <h4 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Proposed Changes (from Submitter)
          </h4>
          <div className="space-y-2">
            {Object.keys(proposedChanges.inputs || {}).map(fieldKey => {
              const oldInput = originalValues.inputs?.[fieldKey];
              const newInput = proposedChanges.inputs?.[fieldKey];
              const changed = oldInput?.value !== newInput?.value;
              
              if (!changed) return null;
              
              return (
                <div key={fieldKey} className="bg-white rounded p-3 border border-amber-100">
                  <div className="text-sm font-medium text-stone-700 capitalize mb-2">
                    {fieldKey.replace(/_/g, ' ')}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-red-600">
                      <span className="text-stone-500">Old: </span>
                      <span className="line-through">
                        {oldInput?.value || 0} {oldInput?.unit || ''}
                      </span>
                    </div>
                    <div className="text-green-600">
                      <span className="text-stone-500">New: </span>
                      <span className="font-medium">
                        {newInput?.value || 0} {newInput?.unit || ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }).filter(Boolean)}
            
            {Object.keys(proposedChanges.inputs || {}).filter(k => {
              const oldInput = originalValues.inputs?.[k];
              const newInput = proposedChanges.inputs?.[k];
              return oldInput?.value !== newInput?.value;
            }).length === 0 && (
              <p className="text-stone-500 text-sm">No input changes detected</p>
            )}
          </div>
        </div>
      )}
      
      {/* Editable Input Fields */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-stone-100 px-4 py-2 font-medium text-sm flex items-center justify-between">
          <span>Input Data (Editable by Approver)</span>
          {hasModifications && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleReset}
              className="text-xs h-7"
              data-testid="reset-inputs-btn"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reset to Original
            </Button>
          )}
        </div>
        <div className="p-4 space-y-3">
          {inputFieldKeys.length > 0 ? (
            inputFieldKeys.map(fieldKey => {
              const field = editedInputs[fieldKey];
              const originalField = originalInputs[fieldKey];
              const isModified = field?.value !== originalField?.value;
              
              return (
                <div key={fieldKey} className={`flex items-center gap-3 py-2 ${isModified ? 'bg-violet-50 -mx-2 px-2 rounded border border-violet-200' : ''}`}>
                  <label className="text-stone-600 text-sm w-40 capitalize flex-shrink-0">
                    {fieldKey.replace(/_/g, ' ')}
                  </label>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      value={field?.value ?? ''}
                      onChange={(e) => handleInputChange(fieldKey, e.target.value)}
                      className="w-32 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      data-testid={`input-${fieldKey}`}
                    />
                    <span className="text-stone-500 text-sm">{field?.unit || ''}</span>
                    {isModified && (
                      <Badge variant="outline" className="text-xs bg-violet-100 text-violet-700 border-violet-300">
                        Modified
                      </Badge>
                    )}
                    {isModified && (
                      <span className="text-stone-400 text-xs">
                        (was: {originalField?.value} {originalField?.unit})
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-stone-400 text-sm">No input fields available for this emission type</p>
          )}
        </div>
      </div>
      
      {/* Emission Factor Override */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-stone-100 px-4 py-2 font-medium text-sm flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Emission Factor Override
          {originalOverride.enabled && (
            <Badge className="bg-violet-100 text-violet-700 text-xs">Submitter Applied Override</Badge>
          )}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overrideEnabled}
                onChange={(e) => setOverrideEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300"
                data-testid="override-checkbox"
              />
              <span className="text-sm">Enable Custom Emission Factor</span>
            </label>
          </div>
          
          {overrideEnabled && (
            <div className="flex items-center gap-3 pl-6">
              <label className="text-stone-600 text-sm">Custom EF Value:</label>
              <input
                type="number"
                value={customEmissionFactor}
                onChange={(e) => setCustomEmissionFactor(e.target.value)}
                placeholder="e.g., 2.5"
                className="w-32 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="custom-ef-input"
              />
              <span className="text-stone-500 text-sm">kgCO2/unit</span>
              {overrideEnabled !== originalOverride.enabled || customEmissionFactor !== originalOverride.value ? (
                <Badge variant="outline" className="text-xs bg-violet-100 text-violet-700">Modified</Badge>
              ) : null}
            </div>
          )}
        </div>
      </div>
      
      {/* Recalculate Button */}
      {hasModifications && (
        <div className="flex justify-center">
          <Button
            onClick={handleRecalculate}
            disabled={calculating}
            variant="outline"
            className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
            data-testid="recalculate-btn"
          >
            {calculating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Recalculate Emissions
          </Button>
        </div>
      )}
      
      {/* Emissions Output */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-stone-100 px-4 py-2 font-medium text-sm flex items-center justify-between">
          <span>Calculated Emissions (tCO2e)</span>
          {hasModifications && calculatedEmissions.total !== originalEmissions.total && (
            <Badge className="bg-green-100 text-green-700 text-xs">Updated</Badge>
          )}
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-600">CO2</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatEmission(calculatedEmissions.co2)}</span>
                {calculatedEmissions.co2 !== originalEmissions.co2 && (
                  <span className="text-stone-400 text-xs line-through">{formatEmission(originalEmissions.co2)}</span>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">CH4</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatEmission(calculatedEmissions.ch4)}</span>
                {calculatedEmissions.ch4 !== originalEmissions.ch4 && (
                  <span className="text-stone-400 text-xs line-through">{formatEmission(originalEmissions.ch4)}</span>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">N2O</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatEmission(calculatedEmissions.n2o)}</span>
                {calculatedEmissions.n2o !== originalEmissions.n2o && (
                  <span className="text-stone-400 text-xs line-through">{formatEmission(originalEmissions.n2o)}</span>
                )}
              </div>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total CO2e</span>
              <div className="flex items-center gap-2">
                <span className="text-emerald-600">{formatEmission(calculatedEmissions.total)}</span>
                {calculatedEmissions.total !== originalEmissions.total && (
                  <span className="text-stone-400 text-xs line-through">{formatEmission(originalEmissions.total)}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Evidence Files */}
      {evidenceFiles.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-stone-100 px-4 py-2 font-medium text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Evidence Files ({evidenceFiles.length})
          </div>
          <div className="p-4 space-y-2">
            {evidenceFiles.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between py-1 border-b last:border-0">
                <span className="text-sm">{file.name || file.filename || `File ${idx + 1}`}</span>
                <a 
                  href={file.url || file.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Notes */}
      {snapshot.notes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-sm font-medium text-blue-800 mb-1">Notes</div>
          <p className="text-sm text-blue-700">{snapshot.notes}</p>
        </div>
      )}
      
      {/* Approver Modifications Summary */}
      {hasModifications && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
          <div className="text-sm font-medium text-violet-800 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Your Modifications (Will be recorded in audit trail)
          </div>
          <div className="space-y-1">
            {getModificationAudit().map((mod, idx) => (
              <div key={idx} className="text-sm text-violet-700">
                • <span className="capitalize">{mod.field.replace(/_/g, ' ')}</span>: {mod.old_value} → <span className="font-medium">{mod.new_value}</span> {mod.unit || ''}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Comment */}
      <div>
        <label className="text-sm font-medium">Comment {hasModifications ? '(describe your modifications)' : '(required for rejection)'}</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={hasModifications ? "Explain why you modified the values..." : "Add a comment..."}
          className="mt-1 w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          data-testid="emission-approval-comment"
        />
      </div>
      
      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={processing}
          data-testid="reject-emission-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Reject
        </Button>
        <Button
          onClick={handleApprove}
          disabled={processing}
          className={hasModifications ? "bg-violet-600 hover:bg-violet-700" : "bg-green-600 hover:bg-green-700"}
          data-testid="approve-emission-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {hasModifications ? 'Approve with Modifications' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
