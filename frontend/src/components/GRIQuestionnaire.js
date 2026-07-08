import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
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
  DialogTrigger,
} from './ui/dialog';
import { 
  ChevronDown, 
  ChevronRight, 
  Save, 
  Loader2, 
  CheckCircle2,
  Circle,
  FileText,
  Info,
  Calendar,
  History,
  Clock,
  FileEdit,
  Send,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentReportingYear, generateReportingYears } from '../utils/reportingYearUtils';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * GRI Questionnaire Component
 * Renders GRI disclosures in collapsible format with questions grouped by disclosure
 * Supports sub_questions with individual input fields for each sub-part
 * 
 * @param {string} section - 'environment' | 'social' | 'governance'
 * @param {boolean} isEditing - Whether in edit mode
 */
export default function GRIQuestionnaire({ section, isEditing = false }) {
  const { getAuthHeader, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [disclosures, setDisclosures] = useState([]);
  const [responses, setResponses] = useState({});
  const [openDisclosures, setOpenDisclosures] = useState({});
  const [organization, setOrganization] = useState(null);
  const [reportingPeriod, setReportingPeriod] = useState(null);
  const [reportingYears, setReportingYears] = useState([]);
  const [historyDialog, setHistoryDialog] = useState({ open: false, questionKey: null, history: [] });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [userDrafts, setUserDrafts] = useState({});  // Drafts keyed by disclosure_id

  // Fetch organization data to get reporting_year_type
  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const res = await axios.get(`${API}/api/organizations/my`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setOrganization(res.data);
        
        // Set reporting year type and generate years
        const yearType = res.data.reporting_year_type || 'financial_year';
        const years = generateReportingYears(yearType, 5);
        setReportingYears(years);
        
        // Set default to current reporting year
        const currentYear = getCurrentReportingYear(yearType);
        setReportingPeriod(currentYear);
      } catch (error) {
        console.error('Failed to fetch organization:', error);
        // Fallback to financial year
        const years = generateReportingYears('financial_year', 5);
        setReportingYears(years);
        setReportingPeriod(getCurrentReportingYear('financial_year'));
      }
    };
    
    if (token) {
      fetchOrganization();
    }
  }, [token]);

  // Fetch GRI disclosures for this section
  const fetchDisclosures = useCallback(async () => {
    if (!reportingPeriod) return; // Wait for reporting period to be set
    try {
      setLoading(true);
      
      // Fetch disclosures (now includes user draft info directly)
      const [disclosuresRes, draftsRes] = await Promise.all([
        axios.get(
          `${API}/api/esg-questionnaire/gri/${section}`,
          { 
            headers: getAuthHeader(),
            params: { reporting_period: reportingPeriod }
          }
        ),
        axios.get(
          `${API}/api/esg-questionnaire/drafts/gri/${section}`,
          {
            headers: getAuthHeader(),
            params: { reporting_period: reportingPeriod }
          }
        ).catch(() => ({ data: { drafts: {} } }))  // Don't fail if no drafts
      ]);
      
      // Group questions by disclosure
      const grouped = groupByDisclosure(disclosuresRes.data.questions || []);
      setDisclosures(grouped);
      
      // Store user drafts keyed by disclosure_id
      setUserDrafts(draftsRes.data.drafts || {});
      
      // Set responses - use user_draft_value from API if available, else saved response
      const initialResponses = {};
      const drafts = draftsRes.data.drafts || {};
      
      (disclosuresRes.data.questions || []).forEach(q => {
        const disclosureDraft = drafts[q.disclosure_id];
        
        if (q.sub_questions && q.sub_questions.length > 0) {
          // Question has sub-parts - use user_draft_value from API if available
          q.sub_questions.forEach(sub => {
            if (sub.user_draft_value !== undefined && sub.user_draft_value !== null) {
              // User has a draft for this question
              initialResponses[sub.response_key] = sub.user_draft_value;
            } else if (disclosureDraft?.draft_data?.[sub.response_key] !== undefined) {
              // Fallback to disclosure-level draft
              initialResponses[sub.response_key] = disclosureDraft.draft_data[sub.response_key];
            } else if (sub.response_value !== undefined && sub.response_value !== null) {
              // Use saved response
              initialResponses[sub.response_key] = sub.response_value;
            }
          });
        } else {
          // Simple question - use user_draft_value from API if available
          if (q.user_draft_value !== undefined && q.user_draft_value !== null) {
            initialResponses[q.question_key] = q.user_draft_value;
          } else if (disclosureDraft?.draft_data?.[q.question_key] !== undefined) {
            initialResponses[q.question_key] = disclosureDraft.draft_data[q.question_key];
          } else if (q.response_value !== undefined && q.response_value !== null) {
            initialResponses[q.question_key] = q.response_value;
          }
        }
      });
      setResponses(initialResponses);
      
      // Open first disclosure by default
      if (grouped.length > 0) {
        setOpenDisclosures({ [grouped[0].disclosure_id]: true });
      }
    } catch (error) {
      console.error('Failed to fetch GRI disclosures:', error);
      toast.error('Failed to load GRI disclosures');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, section, reportingPeriod]);

  useEffect(() => {
    fetchDisclosures();
  }, [fetchDisclosures]);

  // Group questions by disclosure_id
  const groupByDisclosure = (questions) => {
    const groups = {};
    questions.forEach(q => {
      const discId = q.disclosure_id || 'other';
      if (!groups[discId]) {
        groups[discId] = {
          disclosure_id: discId,
          disclosure_name: q.disclosure_name || discId,
          material_topic: q.material_topic || '',
          material_topic_id: q.material_topic_id || '',
          questions: []
        };
      }
      groups[discId].questions.push(q);
    });
    
    // Sort questions within each group
    Object.values(groups).forEach(g => {
      g.questions.sort((a, b) => (a.question_order || 0) - (b.question_order || 0));
    });
    
    return Object.values(groups);
  };

  // Toggle disclosure open/close
  const toggleDisclosure = (disclosureId) => {
    setOpenDisclosures(prev => ({
      ...prev,
      [disclosureId]: !prev[disclosureId]
    }));
  };

  // Handle response change
  const handleResponseChange = (responseKey, value) => {
    setResponses(prev => ({
      ...prev,
      [responseKey]: value
    }));
  };

  // Save single response (with status) - Last save wins logic
  const saveResponse = async (responseKey, status = 'saved') => {
    setSaving(prev => ({ ...prev, [responseKey]: true }));
    try {
      const response = await axios.post(
        `${API}/api/esg-questionnaire/response`,
        {
          question_key: responseKey,
          value: responses[responseKey] || '',
          reporting_period: reportingPeriod,
          status: status
        },
        { headers: getAuthHeader() }
      );
      
      // Check if submitted for approval (approval workflow active)
      if (response.data.submitted_for_approval) {
        toast.info('Submitted for approval. Awaiting approver review.', {
          duration: 4000,
        });
        await fetchDisclosures();
        return;
      }
      
      // Check if any drafts were cleared (last save wins)
      if (response.data.drafts_cleared > 0) {
        toast.success(`Response saved. ${response.data.drafts_cleared} other draft(s) cleared.`);
      } else {
        toast.success(status === 'draft' ? 'Saved as draft' : 'Response saved');
      }
      // Refresh to get updated status
      await fetchDisclosures();
    } catch (error) {
      console.error('Failed to save response:', error);
      toast.error('Failed to save response');
    } finally {
      setSaving(prev => ({ ...prev, [responseKey]: false }));
    }
  };

  // Save single question as draft (per-user draft system)
  const saveQuestionDraft = async (disclosureId, responseKey) => {
    const draftKey = `draft_${responseKey}`;
    setSaving(prev => ({ ...prev, [draftKey]: true }));
    try {
      // Get existing draft data or create new
      const existingDraft = userDrafts[disclosureId];
      const draftData = existingDraft?.draft_data ? { ...existingDraft.draft_data } : {};
      
      // Add/update this question's response
      draftData[responseKey] = responses[responseKey] || '';
      
      await axios.post(
        `${API}/api/esg-questionnaire/draft`,
        {
          framework_id: 'gri',
          disclosure_id: disclosureId,
          reporting_period: reportingPeriod,
          draft_data: draftData,
          draft_status: 'draft',
        },
        { headers: getAuthHeader() }
      );
      
      toast.success('Saved as draft');
      // Refresh to get updated draft status
      await fetchDisclosures();
    } catch (error) {
      console.error('Failed to save draft:', error);
      toast.error('Failed to save draft');
    } finally {
      setSaving(prev => ({ ...prev, [draftKey]: false }));
    }
  };

  // Discard user's draft for a question - reverts to saved value
  const discardDraft = async (questionKey) => {
    setSaving(prev => ({ ...prev, [`discard_${questionKey}`]: true }));
    try {
      await axios.delete(
        `${API}/api/esg-questionnaire/draft/${questionKey}`,
        {
          headers: getAuthHeader(),
          params: { reporting_period: reportingPeriod }
        }
      );
      toast.success('Draft discarded');
      await fetchDisclosures();
    } catch (error) {
      console.error('Failed to discard draft:', error);
      toast.error('Failed to discard draft');
    } finally {
      setSaving(prev => ({ ...prev, [`discard_${questionKey}`]: false }));
    }
  };

  // Save disclosure draft (per-user draft system)
  const saveDraft = async (disclosure, draftStatus = 'draft') => {
    setSaving(prev => ({ ...prev, [disclosure.disclosure_id]: true }));
    try {
      // Collect all question responses for this disclosure
      const draftData = {};
      disclosure.questions.forEach(q => {
        if (q.sub_questions && q.sub_questions.length > 0) {
          q.sub_questions.forEach(sub => {
            const value = responses[sub.response_key];
            if (value !== undefined && value !== '') {
              draftData[sub.response_key] = value;
            }
          });
        } else {
          const value = responses[q.question_key];
          if (value !== undefined && value !== '') {
            draftData[q.question_key] = value;
          }
        }
      });
      
      await axios.post(
        `${API}/api/esg-questionnaire/draft`,
        {
          framework_id: 'gri',
          disclosure_id: disclosure.disclosure_id,
          reporting_period: reportingPeriod,
          draft_data: draftData,
          draft_status: draftStatus,
        },
        { headers: getAuthHeader() }
      );
      
      const statusMessages = {
        'editing': 'Auto-saved',
        'draft': 'Saved as draft',
        'submitted': 'Submitted for approval',
      };
      toast.success(`${disclosure.disclosure_id} ${statusMessages[draftStatus] || 'saved'}`);
      
      // Refresh to get updated statuses
      await fetchDisclosures();
    } catch (error) {
      console.error('Failed to save draft:', error);
      toast.error('Failed to save draft');
    } finally {
      setSaving(prev => ({ ...prev, [disclosure.disclosure_id]: false }));
    }
  };

  // Submit draft for approval
  const submitForApproval = async (disclosure) => {
    setSaving(prev => ({ ...prev, [disclosure.disclosure_id]: true }));
    try {
      // First save the current state as submitted
      await saveDraft(disclosure, 'submitted');
    } catch (error) {
      console.error('Failed to submit for approval:', error);
      toast.error('Failed to submit for approval');
    } finally {
      setSaving(prev => ({ ...prev, [disclosure.disclosure_id]: false }));
    }
  };

  // Save all responses for a disclosure - Last save wins logic
  const saveDisclosure = async (disclosure, status = 'saved') => {
    setSaving(prev => ({ ...prev, [disclosure.disclosure_id]: true }));
    try {
      const savePromises = [];
      
      disclosure.questions.forEach(q => {
        if (q.sub_questions && q.sub_questions.length > 0) {
          // Save each sub-question response
          q.sub_questions.forEach(sub => {
            savePromises.push(
              axios.post(
                `${API}/api/esg-questionnaire/response`,
                {
                  question_key: sub.response_key,
                  value: responses[sub.response_key] || '',
                  reporting_period: reportingPeriod,
                  status: status
                },
                { headers: getAuthHeader() }
              )
            );
          });
        } else {
          // Save simple question response
          savePromises.push(
            axios.post(
              `${API}/api/esg-questionnaire/response`,
              {
                question_key: q.question_key,
                value: responses[q.question_key] || '',
                reporting_period: reportingPeriod,
                status: status
              },
              { headers: getAuthHeader() }
            )
          );
        }
      });
      
      // Execute all saves (last save wins - no conflicts)
      const results = await Promise.allSettled(savePromises);
      
      // Count successes and check for approval submissions
      const successes = results.filter(r => r.status === 'fulfilled');
      const approvalSubmissions = successes.filter(
        r => r.value?.data?.submitted_for_approval
      );
      
      if (approvalSubmissions.length > 0) {
        toast.info(`${approvalSubmissions.length} response(s) submitted for approval`);
      } else if (successes.length > 0) {
        toast.success(status === 'draft' 
          ? `${successes.length} response(s) saved as draft` 
          : `${successes.length} response(s) saved`
        );
      }
      
      // Refresh to get updated statuses
      await fetchDisclosures();
    } catch (error) {
      console.error('Failed to save disclosure:', error);
      toast.error('Failed to save responses');
    } finally {
      setSaving(prev => ({ ...prev, [disclosure.disclosure_id]: false }));
    }
  };

  // Fetch version history for a question
  const fetchHistory = async (questionKey) => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(
        `${API}/api/esg-questionnaire/history/${questionKey}?reporting_period=${encodeURIComponent(reportingPeriod)}`,
        { headers: getAuthHeader() }
      );
      setHistoryDialog({
        open: true,
        questionKey: questionKey,
        history: res.data.history || []
      });
    } catch (error) {
      console.error('Failed to fetch history:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Get status badge for a question or disclosure
  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'saved':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Saved</Badge>;
      case 'pending_approval':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200"><Clock className="w-3 h-3 mr-1" />Pending Approval</Badge>;
      case 'submitted':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Send className="w-3 h-3 mr-1" />Submitted</Badge>;
      case 'draft':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><FileEdit className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'editing':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200"><Clock className="w-3 h-3 mr-1" />Editing</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><Circle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'superseded':
        return <Badge className="bg-gray-100 text-gray-500 border-gray-200"><Circle className="w-3 h-3 mr-1" />Superseded</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-600 border-gray-200"><Circle className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  // Get disclosure status from user draft
  const getDisclosureStatus = (disclosureId) => {
    const draft = userDrafts[disclosureId];
    if (draft) {
      return draft.draft_status;
    }
    // Check if any questions have saved responses
    const disclosure = disclosures.find(d => d.disclosure_id === disclosureId);
    if (disclosure) {
      const hasAnyResponse = disclosure.questions.some(q => {
        if (q.sub_questions?.length > 0) {
          return q.sub_questions.some(sub => sub.response_status === 'saved' || sub.response_status === 'approved');
        }
        return q.status === 'saved' || q.status === 'approved';
      });
      if (hasAnyResponse) return 'saved';
    }
    return 'pending';
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get action icon for history
  const getActionIcon = (action) => {
    switch (action) {
      case 'created':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'updated':
        return <FileEdit className="w-4 h-4 text-orange-500" />;
      case 'draft_updated':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'submitted':
        return <Send className="w-4 h-4 text-green-500" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  // Calculate completion status for a disclosure (only count saved/approved, not drafts)
  const getDisclosureCompletion = (disclosure) => {
    let total = 0;
    let completed = 0;
    
    disclosure.questions.forEach(q => {
      if (q.sub_questions && q.sub_questions.length > 0) {
        total += q.sub_questions.length;
        completed += q.sub_questions.filter(sub => 
          sub.response_status === 'saved' || sub.response_status === 'approved'
        ).length;
      } else {
        total += 1;
        if (q.status === 'saved' || q.status === 'approved') {
          completed += 1;
        }
      }
    });
    
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  // Render a single question (with or without sub-questions)
  const renderQuestion = (question, qIndex) => {
    const hasSubQuestions = question.sub_questions && question.sub_questions.length > 0;
    
    return (
      <div key={question.question_key} className="space-y-3">
        {/* Question Label with Status */}
        <div className="flex items-start justify-between gap-4">
          <Label className="text-sm font-medium text-text-primary flex items-start gap-2 flex-1">
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-mono shrink-0">
              {String.fromCharCode(97 + qIndex)}.
            </span>
            <span className="leading-relaxed">{question.description}</span>
            {question.is_required && (
              <span className="text-red-500 shrink-0">*</span>
            )}
          </Label>
          
          {/* Status Badge & History Button */}
          <div className="flex items-center gap-2 shrink-0">
            {getStatusBadge(question.status)}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchHistory(question.question_key)}
              disabled={loadingHistory}
              className="h-7 px-2 text-xs text-stone-500 hover:text-blue-600"
              title="View version history"
              data-testid={`history-${question.question_key}`}
            >
              {loadingHistory ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <History className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        
        {hasSubQuestions ? (
          // Render sub-questions with individual textareas
          <div className="ml-8 space-y-4 border-l-2 border-blue-100 pl-4">
            {question.sub_questions.map((sub) => (
              <div key={sub.response_key} className="space-y-2">
                <Label className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-blue-600 font-mono text-xs shrink-0">{sub.sub_key}.</span>
                  <span>{sub.label}</span>
                </Label>
                
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={responses[sub.response_key] || ''}
                      onChange={(e) => handleResponseChange(sub.response_key, e.target.value)}
                      placeholder={`Enter response for ${sub.sub_key}...`}
                      rows={3}
                      className="bg-white"
                      data-testid={`input-${sub.response_key}`}
                    />
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">
                          {(responses[sub.response_key] || '').length} / {question.validation_rules?.max_length || 10000} characters
                        </span>
                        {/* Show if user has a draft (different from saved value) */}
                        {sub.has_user_draft && sub.saved_status === 'saved' && (
                          <Badge className="text-xs bg-yellow-100 text-yellow-700">
                            You have unsaved changes
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {/* Discard Draft button - only show if user has draft and there's a saved value */}
                        {sub.has_user_draft && sub.saved_status === 'saved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => discardDraft(sub.response_key)}
                            disabled={saving[`discard_${sub.response_key}`]}
                            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                            data-testid={`discard-draft-${sub.response_key}`}
                            title="Discard your draft and revert to saved answer"
                          >
                            {saving[`discard_${sub.response_key}`] ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <><Trash2 className="w-3 h-3 mr-1" /> Discard</>
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveQuestionDraft(question.disclosure_id, sub.response_key)}
                          disabled={saving[`draft_${sub.response_key}`]}
                          className="h-7 text-xs border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                          data-testid={`save-draft-${sub.response_key}`}
                        >
                          {saving[`draft_${sub.response_key}`] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <><FileEdit className="w-3 h-3 mr-1" /> Save as Draft</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveResponse(sub.response_key)}
                          disabled={saving[sub.response_key]}
                          className="h-7 text-xs"
                          data-testid={`save-${sub.response_key}`}
                        >
                          {saving[sub.response_key] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <><Save className="w-3 h-3 mr-1" /> Save</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-lg border border-stone-200 min-h-[50px]">
                    {responses[sub.response_key] ? (
                      <p className="text-sm text-text-primary whitespace-pre-wrap">
                        {responses[sub.response_key]}
                      </p>
                    ) : (
                      <p className="text-sm text-text-muted italic">No response provided</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Simple question without sub-parts
          isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={responses[question.question_key] || ''}
                onChange={(e) => handleResponseChange(question.question_key, e.target.value)}
                placeholder="Enter your response..."
                rows={4}
                className="bg-white"
                data-testid={`input-${question.question_key}`}
              />
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">
                    {(responses[question.question_key] || '').length} / {question.validation_rules?.max_length || 10000} characters
                  </span>
                  {/* Show if user has a draft (different from saved value) */}
                  {question.has_user_draft && question.saved_status === 'saved' && (
                    <Badge className="text-xs bg-yellow-100 text-yellow-700">
                      You have unsaved changes
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {/* Discard Draft button - only show if user has draft and there's a saved value */}
                  {question.has_user_draft && question.saved_status === 'saved' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => discardDraft(question.question_key)}
                      disabled={saving[`discard_${question.question_key}`]}
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      data-testid={`discard-draft-${question.question_key}`}
                      title="Discard your draft and revert to saved answer"
                    >
                      {saving[`discard_${question.question_key}`] ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <><Trash2 className="w-3 h-3 mr-1" /> Discard</>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveQuestionDraft(question.disclosure_id, question.question_key)}
                    disabled={saving[`draft_${question.question_key}`]}
                    className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                    data-testid={`save-draft-${question.question_key}`}
                  >
                    {saving[`draft_${question.question_key}`] ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <><FileEdit className="w-3 h-3 mr-1" /> Save as Draft</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveResponse(question.question_key)}
                    disabled={saving[question.question_key]}
                    data-testid={`save-${question.question_key}`}
                  >
                    {saving[question.question_key] ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <><Save className="w-3 h-3 mr-1" /> Save</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-white rounded-lg border border-stone-200 min-h-[60px]">
              {responses[question.question_key] ? (
                <p className="text-sm text-text-primary whitespace-pre-wrap">
                  {responses[question.question_key]}
                </p>
              ) : (
                <p className="text-sm text-text-muted italic">No response provided</p>
              )}
            </div>
          )
        )}
      </div>
    );
  };

  if (loading || !reportingPeriod) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-text-muted">Loading GRI disclosures...</span>
      </div>
    );
  }

  if (disclosures.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-text-primary mb-1">No GRI Disclosures</h3>
        <p className="text-sm text-text-muted">
          No GRI disclosures have been configured for the {section} section yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Reporting Year Selector */}
      <Card className="p-4 bg-blue-50/50 border-blue-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2 flex-1">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-blue-800">
                <strong>GRI Standards:</strong> Complete the disclosures below based on your organization&apos;s material topics.
                Click on each disclosure to expand and fill in the required information.
              </p>
            </div>
          </div>
          
          {/* Reporting Year Selector */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Calendar className="w-4 h-4 text-blue-600" />
            <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
              <SelectTrigger 
                className="w-[180px] h-9 bg-white border-blue-200 text-sm"
                data-testid="gri-reporting-year-selector"
              >
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {reportingYears.map(year => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Collapsible Disclosures */}
      {disclosures.map(disclosure => {
        const completion = getDisclosureCompletion(disclosure);
        const isOpen = openDisclosures[disclosure.disclosure_id];
        
        return (
          <Collapsible
            key={disclosure.disclosure_id}
            open={isOpen}
            onOpenChange={() => toggleDisclosure(disclosure.disclosure_id)}
          >
            <Card className="overflow-hidden">
              {/* Disclosure Header */}
              <CollapsibleTrigger asChild>
                <button
                  className="w-full p-4 flex items-center justify-between hover:bg-stone-50 transition-colors text-left"
                  data-testid={`disclosure-trigger-${disclosure.disclosure_id}`}
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <ChevronDown className="w-5 h-5 text-stone-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-stone-400" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200">
                          {disclosure.disclosure_id}
                        </Badge>
                        <span className="font-medium text-text-primary">
                          {disclosure.disclosure_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {disclosure.material_topic}
                        </Badge>
                        <span className="text-xs text-text-muted">
                          {disclosure.questions.length} question{disclosure.questions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Completion Badge */}
                  <div className="flex items-center gap-2">
                    {completion.percentage === 100 ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Complete
                      </Badge>
                    ) : completion.completed > 0 ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-200">
                        {completion.completed}/{completion.total}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-stone-400">
                        <Circle className="w-3 h-3 mr-1" />
                        Not Started
                      </Badge>
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>

              {/* Disclosure Content */}
              <CollapsibleContent>
                <div className="border-t border-stone-100 p-4 space-y-6 bg-stone-50/50">
                  {/* Draft Status Banner */}
                  {userDrafts[disclosure.disclosure_id] && (
                    <div className={`p-3 rounded-lg flex items-center justify-between ${
                      userDrafts[disclosure.disclosure_id].draft_status === 'submitted' 
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-yellow-50 border border-yellow-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(userDrafts[disclosure.disclosure_id].draft_status)}
                        <span className="text-sm text-text-secondary">
                          Last updated: {formatDate(userDrafts[disclosure.disclosure_id].updated_at)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {disclosure.questions.map((question, qIndex) => renderQuestion(question, qIndex))}

                  {/* Save Buttons */}
                  {isEditing && (
                    <div className="pt-4 border-t border-stone-200 flex justify-end gap-3">
                      {/* Save as Draft - Uses new per-user draft system */}
                      <Button
                        variant="outline"
                        onClick={() => saveDraft(disclosure, 'draft')}
                        disabled={saving[disclosure.disclosure_id]}
                        className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                        data-testid={`save-draft-${disclosure.disclosure_id}`}
                      >
                        {saving[disclosure.disclosure_id] ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                        ) : (
                          <><FileEdit className="w-4 h-4 mr-2" /> Save as Draft</>
                        )}
                      </Button>
                      
                      {/* Direct Save - For admins or final save */}
                      <Button
                        onClick={() => saveDisclosure(disclosure, 'saved')}
                        disabled={saving[disclosure.disclosure_id]}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid={`save-${disclosure.disclosure_id}`}
                      >
                        {saving[disclosure.disclosure_id] ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="w-4 h-4 mr-2" /> Save Final</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {/* Version History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={(open) => !open && setHistoryDialog({ open: false, questionKey: null, history: [] })}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              Version History
            </DialogTitle>
            <p className="text-sm text-text-muted">
              Question: <code className="bg-stone-100 px-1 rounded">{historyDialog.questionKey}</code>
            </p>
          </DialogHeader>
          
          {historyDialog.history.length === 0 ? (
            <div className="py-8 text-center">
              <Clock className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p className="text-text-muted">No history available for this question yet.</p>
            </div>
          ) : (
            <div className="space-y-4 mt-4">
              {historyDialog.history.map((entry, idx) => (
                <div key={entry.id || idx} className="border border-stone-200 rounded-lg p-4 bg-stone-50/50">
                  {/* Header with action and timestamp */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getActionIcon(entry.action)}
                      <span className="font-medium text-sm capitalize">
                        {entry.action?.replace('_', ' ')}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={
                          entry.change_details?.new_status === 'saved' 
                            ? 'bg-green-50 text-green-700 border-green-200' 
                            : entry.change_details?.new_status === 'draft'
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-stone-50'
                        }
                      >
                        {entry.change_details?.new_status || 'unknown'}
                      </Badge>
                    </div>
                    <span className="text-xs text-text-muted">
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>
                  
                  {/* User info */}
                  <div className="text-sm text-text-secondary mb-3">
                    <span className="font-medium">{entry.performed_by?.name || 'Unknown'}</span>
                    <span className="text-text-muted ml-1">({entry.performed_by?.email})</span>
                  </div>
                  
                  {/* Field Diffs - computed from version_utils */}
                  {entry.field_diffs && entry.field_diffs.length > 0 ? (
                    <div className="space-y-2">
                      {entry.field_diffs.map((diff, dIdx) => (
                        <div key={dIdx} className="bg-white rounded border border-stone-200 p-2">
                          <p className="text-xs font-medium text-text-primary mb-2">{diff.display_name}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-red-50 p-2 rounded border border-red-100">
                              <span className="text-red-600 font-medium block mb-1">Old</span>
                              <span className="text-red-800 break-words">
                                {diff.old_value === null || diff.old_value === undefined ? '(empty)' : 
                                 typeof diff.old_value === 'object' ? JSON.stringify(diff.old_value) : String(diff.old_value)}
                              </span>
                            </div>
                            <div className="bg-green-50 p-2 rounded border border-green-100">
                              <span className="text-green-600 font-medium block mb-1">New</span>
                              <span className="text-green-800 break-words">
                                {diff.new_value === null || diff.new_value === undefined ? '(empty)' : 
                                 typeof diff.new_value === 'object' ? JSON.stringify(diff.new_value) : String(diff.new_value)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : entry.change_details && (
                    <div className="space-y-2">
                      {entry.change_details.old_value && (
                        <div className="text-xs">
                          <span className="text-red-600 font-medium">Previous:</span>
                          <p className="mt-1 p-2 bg-red-50 rounded border border-red-100 text-text-secondary line-clamp-3">
                            {typeof entry.change_details.old_value === 'object' ? JSON.stringify(entry.change_details.old_value) : entry.change_details.old_value}
                          </p>
                        </div>
                      )}
                      {entry.change_details.new_value && (
                        <div className="text-xs">
                          <span className="text-green-600 font-medium">New:</span>
                          <p className="mt-1 p-2 bg-green-50 rounded border border-green-100 text-text-secondary line-clamp-3">
                            {typeof entry.change_details.new_value === 'object' ? JSON.stringify(entry.change_details.new_value) : entry.change_details.new_value}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
