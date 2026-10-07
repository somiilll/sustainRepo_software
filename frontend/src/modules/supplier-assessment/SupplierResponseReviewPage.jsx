import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Filter,
  HelpCircle,
  Paperclip,
  RotateCcw,
  Search,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatScore = (val) => {
  const num = Number(val);
  return Number.isFinite(num) ? num.toFixed(2) : '-';
};

export default function SupplierResponseReviewPage() {
  const { supplierId, questionnaireId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAuthHeader } = useAuth();

  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [questions, setQuestions] = useState([]);
  
  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('all'); // all, environment, social, governance
  const [activeStatusFilter, setActiveStatusFilter] = useState('all'); // all, accepted, rejected, clarification, pending

  // Action states
  const [reviewingQuestionId, setReviewingQuestionId] = useState('');
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');

  // Reject / Clarification Dialog state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [targetQuestion, setTargetQuestion] = useState(null);
  const [needsResubmission, setNeedsResubmission] = useState(true);
  const [reviewerScore, setReviewerScore] = useState('0');
  const [reviewerNote, setReviewerNote] = useState('');

  const fetchResponseData = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/responses`,
        { headers: getAuthHeader() }
      );
      setResponse(res.data);
      setQuestions(res.data.questions || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load questionnaire response');
    }
  }, [supplierId, questionnaireId, getAuthHeader]);

  const fetchSupplierAndQuestionnaire = useCallback(async () => {
    try {
      const [supplierRes, qnRes] = await Promise.allSettled([
        axios.get(`${API}/supplier-assessment/suppliers/${supplierId}`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/questionnaires/${questionnaireId}`, { headers: getAuthHeader() }),
      ]);
      if (supplierRes.status === 'fulfilled') setSupplier(supplierRes.value.data);
      if (qnRes.status === 'fulfilled') setQuestionnaire(qnRes.value.data);
    } catch {
      // Non-critical, response doc holds core fields
    }
  }, [supplierId, questionnaireId, getAuthHeader]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchResponseData(), fetchSupplierAndQuestionnaire()]).finally(() => {
      setLoading(false);
    });
  }, [fetchResponseData, fetchSupplierAndQuestionnaire]);

  const calculatedScores = useMemo(() => {
    return Object.fromEntries(
      (response?.score_breakdown?.question_scores || []).map((item) => [item.question_id, item])
    );
  }, [response]);

  const esgScore = response?.score_breakdown?.esg_score || {};
  const overallScore = response?.calculated_score ?? esgScore.overall_score;

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (activeSection !== 'all' && (q.section || q.category) !== activeSection) {
        return false;
      }
      const review = q.review || {};
      const status = review.status;
      if (activeStatusFilter === 'accepted' && status !== 'accepted') return false;
      if (activeStatusFilter === 'rejected' && (status !== 'rejected' || review.needs_resubmission)) return false;
      if (activeStatusFilter === 'clarification' && (status !== 'rejected' || !review.needs_resubmission)) return false;
      if (activeStatusFilter === 'pending' && Boolean(status)) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const textMatch = (q.question_text || '').toLowerCase().includes(query);
        const codeMatch = (q.id || '').toLowerCase().includes(query);
        const categoryMatch = (q.question_category || q.category || '').toLowerCase().includes(query);
        if (!textMatch && !codeMatch && !categoryMatch) return false;
      }
      return true;
    });
  }, [questions, activeSection, activeStatusFilter, searchQuery]);

  // Review Actions
  const handleReviewSubmit = async (questionId, reviewPayload) => {
    setReviewingQuestionId(questionId);
    try {
      const { data } = await axios.put(
        `${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/questions/${questionId}/review`,
        reviewPayload,
        { headers: getAuthHeader() }
      );
      toast.success(
        reviewPayload.status === 'accepted'
          ? 'Question response accepted'
          : reviewPayload.needs_resubmission
          ? 'Clarification requested & question unlocked for supplier'
          : 'Question rejected with approved score'
      );
      await fetchResponseData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not submit review decision');
    } finally {
      setReviewingQuestionId('');
    }
  };

  const openRejectModalForQuestion = (q) => {
    setTargetQuestion(q);
    const existing = q.review || {};
    setNeedsResubmission(existing.needs_resubmission ?? true);
    setReviewerScore(existing.reviewer_score !== undefined && existing.reviewer_score !== null ? String(existing.reviewer_score) : '0');
    setReviewerNote(existing.reviewer_note || '');
    setRejectModalOpen(true);
  };

  const handleConfirmRejectModal = async () => {
    if (!targetQuestion) return;
    if (needsResubmission) {
      if (!reviewerNote.trim()) {
        toast.error('Instructions or feedback for supplier is required');
        return;
      }
      await handleReviewSubmit(targetQuestion.id, {
        status: 'rejected',
        needs_resubmission: true,
        reviewer_note: reviewerNote.trim(),
      });
    } else {
      const scoreVal = Number(reviewerScore);
      if (Number.isNaN(scoreVal) || scoreVal < 0) {
        toast.error('Please enter a valid non-negative approved score');
        return;
      }
      if (!reviewerNote.trim()) {
        toast.error('Review rationale or comment is required');
        return;
      }
      await handleReviewSubmit(targetQuestion.id, {
        status: 'rejected',
        needs_resubmission: false,
        reviewer_score: scoreVal,
        reviewer_note: reviewerNote.trim(),
      });
    }
    setRejectModalOpen(false);
    setTargetQuestion(null);
  };

  const openEvidence = async (question, file, download = false) => {
    const key = `${question.id}-${file.id}-${download ? 'download' : 'view'}`;
    setOpeningEvidenceKey(key);
    try {
      const { data } = await axios.get(
        `${API}/files/${file.id}/view`,
        { headers: getAuthHeader() }
      );
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open evidence file');
    } finally {
      setOpeningEvidenceKey('');
    }
  };

  // Helper score counts
  const totalQuestions = questions.length;
  const acceptedCount = questions.filter((q) => q.review?.status === 'accepted').length;
  const rejectedCount = questions.filter((q) => q.review?.status === 'rejected' && !q.review?.needs_resubmission).length;
  const clarificationCount = questions.filter((q) => q.review?.status === 'rejected' && q.review?.needs_resubmission).length;
  const pendingCount = questions.filter((q) => !q.review?.status).length;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="mt-3 text-sm text-stone-500">Loading submission review...</p>
        </div>
      </div>
    );
  }

  const supplierName = supplier?.company_name || response?.company_name || 'Supplier';
  const questionnaireName = questionnaire?.name || response?.questionnaire_name || response?.name || 'ESG Questionnaire';
  const period = supplier?.reporting_period || response?.reporting_period || 'Current Period';

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-7xl space-y-6 pb-16" data-testid="supplier-response-review-page">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 py-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/supplier-assessment/esg')}
              className="text-stone-600 hover:text-stone-900"
              data-testid="back-to-questionnaires-button"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <div className="h-6 w-px bg-stone-200" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-stone-900" data-testid="review-page-title">
                  {supplierName}
                </h1>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-xs">
                  {questionnaireName}
                </Badge>
                <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-700 text-xs">
                  <Calendar className="mr-1 h-3 w-3" />
                  {period}
                </Badge>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Submitted on {response?.submitted_at ? new Date(response.submitted_at).toLocaleString() : 'N/A'} · Revision {response?.revision || 1}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-4 py-2 text-right">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">ESG Score</span>
              <p className="text-xl font-bold text-emerald-900" data-testid="review-page-overall-score">
                {formatScore(overallScore)} <span className="text-xs font-normal text-emerald-700">/ 100</span>
              </p>
            </div>
          </div>
        </div>

        {/* Overview Stats Bar matching screenshot design */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Card className="border-stone-200 shadow-sm bg-white">
            <CardContent className="p-3.5">
              <span className="text-xs font-medium text-stone-500">Total Questions</span>
              <p className="mt-1 text-2xl font-bold text-stone-900" data-testid="stat-total-questions">{totalQuestions}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 shadow-sm bg-emerald-50/40">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-800">Accepted</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-1 text-2xl font-bold text-emerald-900" data-testid="stat-accepted-questions">{acceptedCount}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 shadow-sm bg-amber-50/40">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-amber-800">Needs Clarification</span>
                <RotateCcw className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-1 text-2xl font-bold text-amber-900" data-testid="stat-clarification-questions">{clarificationCount}</p>
            </CardContent>
          </Card>
          <Card className="border-rose-200 shadow-sm bg-rose-50/40">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-rose-800">Rejected (Scored)</span>
                <XCircle className="h-4 w-4 text-rose-600" />
              </div>
              <p className="mt-1 text-2xl font-bold text-rose-900" data-testid="stat-rejected-questions">{rejectedCount}</p>
            </CardContent>
          </Card>
          <Card className="border-stone-200 shadow-sm bg-stone-50">
            <CardContent className="p-3.5">
              <span className="text-xs font-medium text-stone-600">Pending Review</span>
              <p className="mt-1 text-2xl font-bold text-stone-700" data-testid="stat-pending-questions">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="border-stone-200 shadow-sm bg-white">
            <CardContent className="p-3.5">
              <span className="text-xs font-medium text-stone-500">Section Breakdown</span>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-700">
                <span title="Environment">E: {formatScore(esgScore.environment?.score)}</span> ·
                <span title="Social">S: {formatScore(esgScore.social?.score)}</span> ·
                <span title="Governance">G: {formatScore(esgScore.governance?.score)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section Tabs & Search Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
          {/* Section Pills */}
          <div className="flex flex-wrap items-center gap-1.5" data-testid="section-filter-tabs">
            {[
              { id: 'all', label: 'All Sections' },
              { id: 'environment', label: 'Environment' },
              { id: 'social', label: 'Social' },
              { id: 'governance', label: 'Governance' },
            ].map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeSection === sec.id
                    ? 'bg-emerald-800 text-white shadow-sm'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
                data-testid={`section-filter-tab-${sec.id}`}
              >
                {sec.label}
              </button>
            ))}
          </div>

          {/* Status Filter & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search questions or keywords..."
                className="h-8 pl-8 text-xs bg-white"
                data-testid="question-search-input"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-0.5 text-xs">
              <Filter className="ml-2 h-3.5 w-3.5 text-stone-400" />
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'accepted', label: 'Accepted' },
                { id: 'clarification', label: 'Clarification' },
                { id: 'rejected', label: 'Rejected' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveStatusFilter(filter.id)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeStatusFilter === filter.id
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                  data-testid={`status-filter-${filter.id}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Questions Review List */}
        {filteredQuestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-12 text-center" data-testid="review-no-questions-found">
            <HelpCircle className="mx-auto h-8 w-8 text-stone-400" />
            <h3 className="mt-2 text-sm font-semibold text-stone-800">No questions match filter</h3>
            <p className="mt-1 text-xs text-stone-500">Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <div className="space-y-4" data-testid="review-questions-list">
            {filteredQuestions.map((q, idx) => {
              const scoreData = calculatedScores[q.id];
              const review = q.review || {};
              const currentStatus = review.status;
              const isClarification = currentStatus === 'rejected' && review.needs_resubmission;
              const isRejectedFinal = currentStatus === 'rejected' && !review.needs_resubmission;
              const isAccepted = currentStatus === 'accepted';
              const isSavingThis = reviewingQuestionId === q.id;

              const pointsEarned = scoreData?.points_earned ?? (q.answer === true ? q.point_scores?.yes_score : 0);
              const maxPoints = q.max_points ?? 100;
              const files = q.evidence_files || [];
              const answerText = typeof q.answer === 'boolean' ? (q.answer ? 'Yes' : 'No') : (q.answer !== undefined && q.answer !== null ? String(q.answer) : 'Not Answered');
              const answerColor = q.answer === true || (typeof q.answer === 'string' && q.answer.trim()) ? 'text-stone-900 font-semibold' : 'text-stone-400 italic';

              const timestamps = q.timestamps || {};
              const submittedTime = timestamps.submitted_at
                ? new Date(timestamps.submitted_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;

              return (
                <div
                  key={q.id}
                  className={`rounded-xl border bg-white p-5 shadow-sm transition-[border-color,box-shadow] hover:shadow ${
                    isClarification
                      ? 'border-amber-300 ring-1 ring-amber-100'
                      : isRejectedFinal
                      ? 'border-rose-300 ring-1 ring-rose-100'
                      : isAccepted
                      ? 'border-emerald-300'
                      : 'border-stone-200'
                  }`}
                  data-testid={`review-question-row-${q.id}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {/* Left: Question detail & Response */}
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[11px] font-bold text-stone-700">
                          {idx + 1}
                        </span>
                        <Badge variant="outline" className="capitalize text-xs border-stone-200 bg-stone-50 text-stone-700">
                          {q.section || q.category}
                        </Badge>
                        {q.question_category && (
                          <span className="text-xs text-stone-500 font-medium">
                            · {q.question_category}
                          </span>
                        )}
                        {submittedTime && (
                          <span className="text-[11px] text-stone-400 ml-auto sm:ml-0" data-testid={`question-submitted-at-${q.id}`}>
                            Submitted: {submittedTime}
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-semibold text-stone-900" data-testid={`question-text-${q.id}`}>
                        {q.question_text}
                      </h4>

                      {q.description && (
                        <p className="text-xs text-stone-500">{q.description}</p>
                      )}

                      {/* Supplier Submitted Answer Box */}
                      <div className="rounded-lg border border-stone-100 bg-stone-50/70 p-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Supplier Response</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`text-sm ${answerColor}`} data-testid={`supplier-answer-${q.id}`}>
                            {answerText}
                          </span>
                        </div>

                        {/* Evidence Files if any */}
                        {files.length > 0 && (
                          <div className="mt-3 border-t border-stone-200/60 pt-2.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Evidence Attached ({files.length}):</span>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              {files.map((file) => (
                                <div
                                  key={file.id}
                                  className="flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700 shadow-2xs"
                                  data-testid={`evidence-item-${file.id}`}
                                >
                                  <Paperclip className="h-3 w-3 text-stone-400 shrink-0" />
                                  <span className="max-w-[200px] truncate" title={file.original_filename}>
                                    {file.original_filename}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openEvidence(q, file)}
                                    className="text-stone-400 hover:text-emerald-700 ml-1"
                                    title="View"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEvidence(q, file, true)}
                                    className="text-stone-400 hover:text-emerald-700"
                                    title="Download"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Existing Reviewer Note / Feedback */}
                      {review.reviewer_note && (
                        <div
                          className={`rounded-lg border p-3 text-xs ${
                            isClarification
                              ? 'border-amber-200 bg-amber-50/70 text-amber-950'
                              : 'border-rose-200 bg-rose-50/70 text-rose-950'
                          }`}
                          data-testid={`reviewer-note-display-${q.id}`}
                        >
                          <span className="font-bold">
                            {isClarification ? 'Reviewer Instruction to Supplier: ' : 'Reviewer Rationale: '}
                          </span>
                          {review.reviewer_note}
                        </div>
                      )}
                    </div>

                    {/* Right: Score badge & Action Controls */}
                    <div className="flex flex-col items-end gap-3 lg:w-64 shrink-0 border-t border-stone-100 pt-3 lg:border-t-0 lg:pt-0">
                      {/* Score Display Card */}
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-semibold text-stone-500">Points Earned</span>
                          <p className="text-lg font-bold text-stone-900" data-testid={`question-points-${q.id}`}>
                            {formatScore(isRejectedFinal ? review.reviewer_score ?? 0 : pointsEarned)}
                            <span className="text-xs font-normal text-stone-500"> / {formatScore(maxPoints)}</span>
                          </p>
                        </div>
                      </div>

                      {/* Status Indicator Badge */}
                      <div className="flex items-center gap-1.5">
                        {isAccepted && (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" data-testid={`status-badge-accepted-${q.id}`}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Accepted
                          </Badge>
                        )}
                        {isClarification && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100" data-testid={`status-badge-clarification-${q.id}`}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Clarification (Unlocked)
                          </Badge>
                        )}
                        {isRejectedFinal && (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100" data-testid={`status-badge-rejected-${q.id}`}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Rejected
                          </Badge>
                        )}
                        {!currentStatus && (
                          <Badge variant="outline" className="border-stone-300 text-stone-600" data-testid={`status-badge-pending-${q.id}`}>
                            Pending Review
                          </Badge>
                        )}
                      </div>

                      {/* Action Buttons: Accept / Reject */}
                      <div className="flex items-center gap-2 mt-1">
                        <Button
                          size="sm"
                          variant={isAccepted ? 'default' : 'outline'}
                          className={`h-8 text-xs font-semibold ${
                            isAccepted
                              ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                              : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                          }`}
                          disabled={isSavingThis}
                          onClick={() => handleReviewSubmit(q.id, { status: 'accepted', needs_resubmission: false })}
                          data-testid={`action-accept-${q.id}`}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant={isClarification || isRejectedFinal ? 'default' : 'outline'}
                          className={`h-8 text-xs font-semibold ${
                            isClarification || isRejectedFinal
                              ? 'bg-rose-700 text-white hover:bg-rose-800'
                              : 'border-rose-300 text-rose-800 hover:bg-rose-50'
                          }`}
                          disabled={isSavingThis}
                          onClick={() => openRejectModalForQuestion(q)}
                          data-testid={`action-reject-${q.id}`}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Rejection & Resubmission Choice */}
        <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
          <DialogContent className="max-w-md" data-testid="reject-clarification-dialog">
            <DialogHeader>
              <DialogTitle data-testid="reject-dialog-title">Reject Question Response</DialogTitle>
              <DialogDescription>
                Choose whether the supplier needs to submit their answer again, or assign an approved score directly.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <p className="text-xs font-medium text-stone-700 line-clamp-2">
                  <span className="font-bold text-stone-900">Question: </span>
                  {targetQuestion?.question_text}
                </p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-stone-900">
                  Does supplier need to submit answer again? *
                </Label>
                <RadioGroup
                  value={needsResubmission ? 'yes' : 'no'}
                  onValueChange={(val) => setNeedsResubmission(val === 'yes')}
                  className="mt-2.5 flex flex-col gap-2"
                  data-testid="reject-resubmit-radio-group"
                >
                  <label
                    htmlFor="reject-choice-yes"
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      needsResubmission
                        ? 'border-amber-400 bg-amber-50/50'
                        : 'border-stone-200 bg-white hover:bg-stone-50'
                    }`}
                  >
                    <RadioGroupItem value="yes" id="reject-choice-yes" className="mt-0.5" data-testid="reject-radio-yes" />
                    <div>
                      <span className="text-xs font-semibold text-stone-900">Yes (Request Clarification / Unlock Question)</span>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        Only this question unlocks for the supplier to update answers or evidence. An email notification will be sent.
                      </p>
                    </div>
                  </label>

                  <label
                    htmlFor="reject-choice-no"
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      !needsResubmission
                        ? 'border-rose-400 bg-rose-50/50'
                        : 'border-stone-200 bg-white hover:bg-stone-50'
                    }`}
                  >
                    <RadioGroupItem value="no" id="reject-choice-no" className="mt-0.5" data-testid="reject-radio-no" />
                    <div>
                      <span className="text-xs font-semibold text-stone-900">No (Award Approved Score directly)</span>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        Does not unlock for the supplier. You assign an approved score (e.g. 0 or partial points) with your review rationale.
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {!needsResubmission && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="approved-score-input" className="text-xs font-semibold text-stone-900">
                      Approved Score (Points) *
                    </Label>
                    <span className="text-[11px] text-stone-500">Max: {targetQuestion?.max_points ?? 100} pts</span>
                  </div>
                  <Input
                    id="approved-score-input"
                    type="number"
                    min="0"
                    max={targetQuestion?.max_points ?? 100}
                    step="0.1"
                    value={reviewerScore}
                    onChange={(e) => setReviewerScore(e.target.value)}
                    placeholder="0"
                    data-testid="reviewer-approved-score-input"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="reviewer-note-textarea" className="text-xs font-semibold text-stone-900">
                  {needsResubmission ? 'Instructions / Feedback for Supplier *' : 'Review Rationale / Comment *'}
                </Label>
                <Textarea
                  id="reviewer-note-textarea"
                  rows={3}
                  value={reviewerNote}
                  onChange={(e) => setReviewerNote(e.target.value)}
                  placeholder={
                    needsResubmission
                      ? 'Specify why clarification is needed or what document is missing...'
                      : 'Provide justification for the rejected score...'
                  }
                  data-testid="reviewer-feedback-textarea"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRejectModalOpen(false)} data-testid="cancel-reject-button">
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!reviewerNote.trim()}
                onClick={handleConfirmRejectModal}
                data-testid="confirm-reject-button"
              >
                Confirm Decision
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
