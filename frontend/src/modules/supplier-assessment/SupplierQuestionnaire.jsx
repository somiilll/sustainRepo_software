import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { SupplierDataVerificationAcknowledgement } from './components/SupplierDataVerificationAcknowledgement';
import { SupplierPageHeader } from './components/SupplierPageHeader';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { 
  ArrowLeft, 
  ArrowRight,
  Save,
  Send,
  CheckCircle,
  ClipboardCheck,
  Calendar,
  Circle,
  Download,
  Eye,
  Paperclip,
  RotateCcw,
  LockKeyhole,
  Trash2,
  Upload,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierQuestionnaire() {
  const { questionnaireId } = useParams();
  const navigate = useNavigate();
  const { getAuthHeader } = useAuth();
  
  const [questionnaire, setQuestionnaire] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [hasUnlockedQuestions, setHasUnlockedQuestions] = useState(false);
  const [unlockedQuestionIds, setUnlockedQuestionIds] = useState([]);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [verificationAccepted, setVerificationAccepted] = useState(false);
  const [uploadingQuestionId, setUploadingQuestionId] = useState('');
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');
  const [highlightedQuestionId, setHighlightedQuestionId] = useState('');
  const [clarificationReplies, setClarificationReplies] = useState({});
  const [pendingEvidenceReuse, setPendingEvidenceReuse] = useState(null);
  const [activeCategory, setActiveCategory] = useState('');
  const submissionDeadlinePassed = Boolean(questionnaire?.submission_deadline_passed);

  const fetchQuestionnaire = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}`,
        { headers: getAuthHeader() }
      );
      setQuestionnaire(res.data);
      setQuestions(res.data.questions || []);
      const isSubmitted = res.data.response_status === 'submitted';
      const partiallyUnlocked = Boolean(res.data.has_unlocked_questions && (res.data.unlocked_question_ids || []).length > 0);
      setIsReadOnly(isSubmitted && !partiallyUnlocked);
      setHasUnlockedQuestions(partiallyUnlocked);
      setUnlockedQuestionIds(res.data.unlocked_question_ids || []);
      
      // Load existing answers
      const existingAnswers = {};
      (res.data.questions || []).forEach((q) => {
        if (q.answer !== undefined && q.answer !== null) {
          existingAnswers[q.id] = q.answer;
        }
      });
      setAnswers(existingAnswers);
      const existingReplies = {};
      (res.data.questions || []).forEach((q) => {
        if (q.clarification_reply?.message) existingReplies[q.id] = q.clarification_reply.message;
      });
      setClarificationReplies(existingReplies);
    } catch (err) {
      toast.error('Failed to load questionnaire');
      navigate('/supplier-assessment/supplier');
    } finally {
      setLoading(false);
    }
  }, [questionnaireId, getAuthHeader, navigate]);

  useEffect(() => {
    fetchQuestionnaire();
  }, [fetchQuestionnaire]);

  const handleAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleClarificationReply = (questionId, value) => {
    setClarificationReplies((prev) => ({ ...prev, [questionId]: value }));
  };

  const buildAnswersPayload = (questionIds) => questionIds.map((questionId) => ({
    question_id: questionId,
    answer: answers[questionId],
    clarification_reply: clarificationReplies[questionId] ?? null,
  }));

  const persistDraftAnswers = async () => {
    const questionIds = hasUnlockedQuestions ? unlockedQuestionIds : Object.keys(answers);
    const answersList = buildAnswersPayload(questionIds);
    await axios.post(
      `${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/answers`,
      { answers: answersList, is_draft: true, data_verified: false },
      { headers: getAuthHeader() },
    );
  };

  const sha256 = async (file) => {
    const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const uploadEvidence = async (question, selectedFiles, hash = '') => {
    const filesToUpload = Array.from(selectedFiles || []).filter(Boolean);
    if (!filesToUpload.length) return;
    setUploadingQuestionId(question.id);
    try {
      const uploaded = await Promise.all(filesToUpload.map(async (file) => { const payload = new FormData(); payload.append('file', file); if (hash) payload.append('sha256_hash', hash); return (await axios.post(`${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/questions/${question.id}/evidence`, payload, { headers: getAuthHeader() })).data; }));
      setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, evidence_files: [...(item.evidence_files || []), ...uploaded] } : item));
      toast.success(`${uploaded.length} evidence file${uploaded.length === 1 ? '' : 's'} attached`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not upload evidence');
    } finally {
      setUploadingQuestionId('');
    }
  };

  const processEvidenceFiles = async (question, files) => {
    const [file, ...remainingFiles] = files;
    if (!file) return;
    try {
      if (question.response_type === 'yes_no' && answers[question.id] === true) await persistDraftAnswers();
      const hash = await sha256(file);
      const { data } = await axios.post(`${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/questions/${question.id}/evidence/duplicates`, { sha256_hash: hash, filename: file.name }, { headers: getAuthHeader() });
      const candidate = data.exact_match;
      if (candidate) {
        setPendingEvidenceReuse({ question, file, hash, remainingFiles, candidate, exact: Boolean(data.exact_match) });
        return;
      }
      await uploadEvidence(question, [file], hash);
      await processEvidenceFiles(question, remainingFiles);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not prepare evidence upload');
    }
  };

  const resolveEvidenceReuse = async (reuse) => {
    const pending = pendingEvidenceReuse;
    if (!pending) return;
    setPendingEvidenceReuse(null);
    try {
      if (reuse) {
        const { data } = await axios.post(`${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/questions/${pending.question.id}/evidence/reuse`, { evidence_id: pending.candidate.id }, { headers: getAuthHeader() });
        setQuestions((current) => current.map((item) => item.id === pending.question.id ? { ...item, evidence_files: (item.evidence_files || []).some((evidence) => evidence.id === data.id) ? item.evidence_files : [...(item.evidence_files || []), data] } : item));
        toast.success('Existing evidence reused');
      } else {
        await uploadEvidence(pending.question, [pending.file], pending.hash);
      }
      await processEvidenceFiles(pending.question, pending.remainingFiles);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not attach evidence');
    }
  };

  const removeEvidence = async (question, file) => {
    try {
      await axios.delete(`${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/questions/${question.id}/evidence/${file.id}`, { headers: getAuthHeader() });
      setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, evidence_files: (item.evidence_files || []).filter((evidence) => evidence.id !== file.id) } : item));
      toast.success('Evidence removed');
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not remove evidence'); }
  };

  const openEvidence = async (question, file, download = false) => {
    const key = `${question.id}-${file.id}-${download ? 'download' : 'view'}`;
    setOpeningEvidenceKey(key);
    try {
      const { data } = await axios.get(`${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/questions/${question.id}/evidence/${file.id}`, { params: { download }, headers: getAuthHeader() });
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not open evidence');
    } finally {
      setOpeningEvidenceKey('');
    }
  };

  const handleSave = async (isFinal = false) => {
    if (isFinal && !verificationAccepted) return;
    const saveFn = isFinal ? setSubmitting : setSaving;
    saveFn(true);
    
    try {
      if (isFinal) {
        let answersList;
        if (hasUnlockedQuestions) {
          answersList = buildAnswersPayload(unlockedQuestionIds);
        } else {
          answersList = buildAnswersPayload(Object.keys(answers));
        }
        await axios.post(
          `${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/answers`,
          { answers: answersList, is_draft: false, data_verified: verificationAccepted },
          { headers: getAuthHeader() }
        );
      } else {
        await persistDraftAnswers();
      }
      
      if (isFinal) {
        toast.success('Questionnaire submitted successfully');
        setVerificationAccepted(false);
        navigate('/supplier-assessment/supplier');
      } else {
        toast.success('Progress saved');
        await fetchQuestionnaire();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      saveFn(false);
    }
  };

  const focusQuestion = (questionId) => {
    setHighlightedQuestionId(questionId);
    window.requestAnimationFrame(() => {
      const question = document.getElementById(`supplier-question-${questionId}`);
      question?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => question?.focus({ preventScroll: true }), 400);
    });
    window.setTimeout(() => setHighlightedQuestionId((current) => current === questionId ? '' : current), 2200);
  };

  const handleSubmit = () => {
    if (submissionDeadlinePassed) {
      toast.error('Submission deadline has passed. Ask your parent organization to extend the due date.');
      return;
    }
    if (hasUnlockedQuestions) {
      const questionWithoutReply = questions.find((question) => unlockedQuestionIds.includes(question.id) && !(clarificationReplies[question.id] || '').trim());
      if (questionWithoutReply) {
        toast.error('Add a reply to the reviewer before resubmitting this clarification');
        focusQuestion(questionWithoutReply.id);
        return;
      }
    }
    // Check required questions
    const questionsToSubmit = hasUnlockedQuestions ? questions.filter((question) => unlockedQuestionIds.includes(question.id)) : questions;
    const requiredUnanswered = questionsToSubmit.filter(
      (q) => q.required && (answers[q.id] === undefined || answers[q.id] === '')
    );
    
    if (requiredUnanswered.length > 0) {
      toast.error(`Question ${questions.findIndex((q) => q.id === requiredUnanswered[0].id) + 1} needs a response`);
      focusQuestion(requiredUnanswered[0].id);
      return;
    }
    const missingRequiredEvidence = questionsToSubmit.filter((question) => (
      (question.evidence_requirement === 'required' || question.assessment_type === 'type_a')
      && (question.response_type !== 'yes_no' || answers[question.id] === true)
      && !(question.evidence_files || []).length
    ));
    if (missingRequiredEvidence.length > 0) {
      toast.error(`Question ${questions.findIndex((q) => q.id === missingRequiredEvidence[0].id) + 1} needs evidence for its Yes response`);
      focusQuestion(missingRequiredEvidence[0].id);
      return;
    }
    setVerificationAccepted(false);
    setShowSubmitConfirm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-500">Loading questionnaire...</div>
      </div>
    );
  }

  if (!questionnaire || questions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">No questions found in this questionnaire.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)} data-testid="supplier-questionnaire-empty-back-button">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const displayedQuestions = hasUnlockedQuestions ? questions.filter((question) => unlockedQuestionIds.includes(question.id)) : questions;
  const isQuestionComplete = (question) => {
    const hasAnswer = answers[question.id] !== undefined && answers[question.id] !== null && answers[question.id] !== '';
    const evidenceRequired = question.evidence_requirement === 'required' || question.assessment_type === 'type_a';
    const evidenceNeededForAnswer = question.response_type !== 'yes_no' || answers[question.id] === true;
    return hasAnswer && (!evidenceRequired || !evidenceNeededForAnswer || (question.evidence_files || []).length > 0);
  };
  const completedCount = displayedQuestions.filter(isQuestionComplete).length;
  const progress = displayedQuestions.length ? (completedCount / displayedQuestions.length) * 100 : 0;
  const categoryMatches = (question, category) => String(question.category || '').toLowerCase() === category.toLowerCase();
  const categories = ['Environment', 'Social', 'Governance'].filter((category) => displayedQuestions.some((question) => categoryMatches(question, category)));
  const focusCategory = (category) => {
    setActiveCategory(category);
    const firstQuestion = displayedQuestions.find((question) => categoryMatches(question, category));
    if (firstQuestion) focusQuestion(firstQuestion.id);
  };

  const isQuestionReadOnly = (question) => {
    if (hasUnlockedQuestions) {
      return !unlockedQuestionIds.includes(question.id);
    }
    return isReadOnly;
  };

  const renderQuestionInput = (question) => {
    const qReadOnly = isQuestionReadOnly(question);
    const value = answers[question.id];
    
    switch (question.response_type) {
      case 'yes_no':
        return (
          <RadioGroup
            value={value?.toString() || ''}
            onValueChange={(v) => handleAnswer(question.id, v === 'true')}
            disabled={qReadOnly}
            className="flex gap-4"
            data-testid={`supplier-questionnaire-answer-${question.id}`}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id={`${question.id}-yes`} data-testid={`supplier-questionnaire-answer-${question.id}-yes`} />
              <Label htmlFor={`${question.id}-yes`}>Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id={`${question.id}-no`} data-testid={`supplier-questionnaire-answer-${question.id}-no`} />
              <Label htmlFor={`${question.id}-no`}>No</Label>
            </div>
          </RadioGroup>
        );
      
      case 'numeric':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => handleAnswer(question.id, e.target.value ? parseFloat(e.target.value) : '')}
            disabled={qReadOnly}
            placeholder="Enter a number"
            className="max-w-xs"
            data-testid={`supplier-questionnaire-answer-${question.id}`}
          />
        );
      
      case 'dropdown':
        return (
          <RadioGroup
            value={value || ''}
            onValueChange={(v) => handleAnswer(question.id, v)}
            disabled={qReadOnly}
            className="space-y-2"
            data-testid={`supplier-questionnaire-answer-${question.id}`}
          >
            {(question.options || []).map((option, optionIndex) => <label key={option.value} htmlFor={`${question.id}-option-${optionIndex}`} className="flex cursor-pointer items-start gap-3 border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800 transition-[border-color,background-color] hover:border-emerald-300 hover:bg-emerald-50/40" data-testid={`supplier-questionnaire-option-${question.id}-${optionIndex}`}><RadioGroupItem value={option.value} id={`${question.id}-option-${optionIndex}`} className="mt-0.5" data-testid={`supplier-questionnaire-answer-${question.id}-option-${optionIndex}`} /><span className="break-words">{option.label || option.value}</span></label>)}
          </RadioGroup>
        );
      
      case 'text':
      default:
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => handleAnswer(question.id, e.target.value)}
            disabled={qReadOnly}
            placeholder="Enter your answer"
            rows={4}
            data-testid={`supplier-questionnaire-answer-${question.id}`}
          />
        );
    }
  };

  const renderQuestionEvidence = (question) => {
    const qReadOnly = isQuestionReadOnly(question);
    const files = question.evidence_files || [];
    const evidenceScored = question.evidence_requirement === 'evidence_scored';
    const evidenceRequired = question.evidence_requirement === 'required' || question.assessment_type === 'type_a';
    const evidenceEnabled = ['required', 'optional', 'not_required', 'evidence_scored'].includes(question.evidence_requirement);
    const answerAllowsUpload = question.response_type !== 'yes_no' || answers[question.id] === true;
    const showUpload = evidenceEnabled && answerAllowsUpload;
    if (!showUpload && files.length === 0) return null;
    return <div className="mt-5 border-t border-stone-100 pt-4" data-testid={`supplier-question-evidence-${question.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-stone-800" data-testid={`supplier-question-evidence-label-${question.id}`}>Evidence <span className={evidenceScored ? 'text-sm font-medium text-stone-800' : 'text-stone-500'}>{evidenceRequired ? 'required for a Yes response' : evidenceScored ? 'affects scoring for response' : 'is optional'}</span></p>{evidenceScored && <p className="mt-1 text-xs font-semibold text-stone-950">Missing evidence reduces the points earned for the response.</p>}</div>{showUpload && !qReadOnly && <label htmlFor={`supplier-question-evidence-input-${question.id}`} className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white shadow-sm transition-[background-color,opacity] hover:bg-emerald-900 ${uploadingQuestionId === question.id ? 'pointer-events-none opacity-60' : ''}`} data-testid={`supplier-question-evidence-upload-${question.id}`}><Upload className="h-4 w-4" aria-hidden="true" />{files.length ? 'Upload more files' : 'Choose files'}<Input id={`supplier-question-evidence-input-${question.id}`} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.csv,.doc,.docx" disabled={uploadingQuestionId === question.id} onChange={(event) => { processEvidenceFiles(question, Array.from(event.target.files || [])); event.target.value = ''; }} className="sr-only" data-testid={`supplier-question-evidence-upload-input-${question.id}`} /></label>}</div>
      {uploadingQuestionId === question.id && <p className="mt-2 text-xs text-stone-500" data-testid={`supplier-question-evidence-uploading-${question.id}`}>Uploading evidence…</p>}
      {files.length > 0 && <ul className="mt-3 space-y-2" data-testid={`supplier-question-evidence-list-${question.id}`}>{files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-200 bg-stone-50 px-3 py-2"><span className="min-w-0"><span className="flex items-center gap-2 text-sm text-stone-700" data-testid={`supplier-question-evidence-name-${question.id}-${file.id}`}><Paperclip className="h-4 w-4 shrink-0 text-stone-500" /> <span className="truncate">{file.original_filename}</span></span>{file.reused && <span className="mt-1 block text-xs font-medium text-emerald-700" data-testid={`supplier-question-evidence-reused-${question.id}-${file.id}`}>Existing evidence reused</span>}</span><span className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`View ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-view`} onClick={() => openEvidence(question, file)} data-testid={`view-supplier-question-evidence-${question.id}-${file.id}`}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Download ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-download`} onClick={() => openEvidence(question, file, true)} data-testid={`download-supplier-question-evidence-${question.id}-${file.id}`}><Download className="h-4 w-4" /></Button>{!qReadOnly && <Button variant="ghost" size="icon" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${file.original_filename}`} onClick={() => removeEvidence(question, file)} data-testid={`remove-supplier-question-evidence-${question.id}-${file.id}`}><Trash2 className="h-4 w-4" /></Button>}</span></li>)}</ul>}
    </div>;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8" data-testid="supplier-questionnaire">
      <SupplierPageHeader
        title={questionnaire.name}
        icon={ClipboardCheck}
        iconClassName="border-violet-200 bg-violet-50 text-violet-700"
        testId="supplier-questionnaire"
        leading={<Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="supplier-questionnaire-back-button">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>}
        aside={<>
        {questionnaire.reporting_period && <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-700" data-testid="supplier-questionnaire-reporting-period">Reporting period: {questionnaire.reporting_period}</Badge>}
        {questionnaire.due_date && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900" data-testid="supplier-questionnaire-due-date"><Calendar className="mr-1 h-3 w-3" />Due {new Date(questionnaire.due_date).toLocaleDateString()}</Badge>}{!isReadOnly && submissionDeadlinePassed && <Badge className="bg-rose-100 text-rose-800" data-testid="supplier-questionnaire-overdue-badge">Submission overdue</Badge>}
        {isReadOnly && (
          <Badge className="bg-green-100 text-green-800" data-testid="supplier-questionnaire-locked-badge">
            <CheckCircle className="h-3 w-3 mr-1" />
            Submitted
          </Badge>
        )}
        {questionnaire.response_status === 'in_progress' && questionnaire.reopened_at && (
          <Badge className="bg-amber-100 text-amber-800" data-testid="supplier-questionnaire-reopened-badge">Unlocked for resubmission</Badge>
        )}
        {hasUnlockedQuestions && (
          <Badge className="bg-amber-100 text-amber-900 border-amber-300" data-testid="supplier-questionnaire-clarification-badge">
            <RotateCcw className="mr-1 h-3 w-3" />
            Clarification requested ({unlockedQuestionIds.length} question{unlockedQuestionIds.length > 1 ? 's' : ''})
          </Badge>
        )}
        </>}
      />

      {categories.length > 0 && <nav className="flex flex-wrap gap-2" aria-label="Questionnaire sections" data-testid="supplier-questionnaire-category-tags">{categories.map((category) => <Button key={category} type="button" variant="outline" size="sm" onClick={() => focusCategory(category)} className={activeCategory === category ? 'border-emerald-700 bg-emerald-800 text-white hover:bg-emerald-900 hover:text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-emerald-300 hover:bg-emerald-50'} data-testid={`supplier-questionnaire-category-${category.toLowerCase()}`}>{category}</Button>)}</nav>}

      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-stone-500">
              {displayedQuestions.length} questions
            </span>
            <span className="text-sm text-stone-500">
              {completedCount} completed
            </span>
          </div>
          <div className="w-full bg-stone-200 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4" data-testid="supplier-questionnaire-all-questions">
      {displayedQuestions.map((question, index) => {
        const isQuestionUnlocked = hasUnlockedQuestions && unlockedQuestionIds.includes(question.id);
        const review = question.review || {};
        const isClarificationRequest = review.status === 'rejected' && review.needs_resubmission;
        const isFinalRejection = review.status === 'rejected' && !review.needs_resubmission;
        return (
          <Card
            key={question.id}
            id={`supplier-question-${question.id}`}
            tabIndex={-1}
            className={`scroll-mt-24 transition-[box-shadow,border-color] ${
              question.parent_question_id
                ? 'ml-4 border-l-4 border-l-emerald-200 bg-emerald-50/30 sm:ml-8'
                : ''
            } ${
              highlightedQuestionId === question.id
                ? 'border-amber-400 ring-2 ring-amber-200'
                : isQuestionUnlocked
                ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/20'
                : ''
            }`}
            data-testid={`supplier-questionnaire-question-card-${question.id}`}
          >
            <CardHeader>
              <div className="flex items-start gap-2">
                {isQuestionComplete(question) ? (
                  <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
                ) : (
                  <Circle className="h-5 w-5 text-stone-300 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {question.parent_question_id ? (
                        <span className="mr-2 text-sm font-medium text-emerald-700" data-testid={`supplier-subquestion-label-${question.id}`}>Follow-up</span>
                      ) : (
                        `${displayedQuestions.slice(0, index + 1).filter((item) => !item.parent_question_id).length}. `
                      )}
                      {question.question_text}
                      {question.required && <span className="text-red-500 ml-1">*</span>}
                    </CardTitle>
                  </div>
                  {question.description && (
                    <CardDescription className="mt-2">{question.description}</CardDescription>
                  )}
                </div>
              </div>

              {/* Reviewer Comment / Clarification Instruction Banner */}
              {review.reviewer_note && (
                <div
                  className={`mt-3 rounded-md border p-3 text-xs ${isClarificationRequest ? 'border-amber-300 bg-amber-50 text-amber-950' : isFinalRejection ? 'border-rose-300 bg-rose-50 text-rose-950' : 'border-sky-300 bg-sky-50 text-sky-950'}`}
                  data-testid={`supplier-question-reviewer-note-${question.id}`}
                >
                  <p className="font-semibold">
                    {isClarificationRequest ? 'Reviewer Feedback / Clarification Request:' : isFinalRejection ? 'Reviewer Rejection Rationale:' : 'Reviewer Feedback:'}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{review.reviewer_note}</p>
                </div>
              )}

              <Badge variant="outline" className="w-fit mt-2">
                {question.category}
              </Badge>
            </CardHeader>
            <CardContent>
              {isQuestionUnlocked && (
                <div className="mb-5 border border-sky-200 bg-sky-50 p-4" data-testid={`supplier-question-clarification-reply-${question.id}`}>
                  <Label htmlFor={`supplier-question-clarification-reply-input-${question.id}`} className="text-sm font-semibold text-sky-950">Reply to reviewer</Label>
                  <Textarea id={`supplier-question-clarification-reply-input-${question.id}`} value={clarificationReplies[question.id] || ''} onChange={(event) => handleClarificationReply(question.id, event.target.value)} className="mt-2 bg-white" rows={3} placeholder="Explain your clarification, correction, or evidence update." data-testid={`supplier-question-clarification-reply-input-${question.id}`} />
                </div>
              )}
              {renderQuestionInput(question)}
              {renderQuestionEvidence(question)}
            </CardContent>
          </Card>
        );
      })}
      </div>

      {/* Navigation */}
      <div className="flex justify-end border-t border-stone-200 pt-5">
        <div className="flex items-center gap-3" data-testid="supplier-questionnaire-actions">
          {!isReadOnly && (
            <>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} data-testid="save-supplier-questionnaire-draft-button">
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={submissionDeadlinePassed ? 0 : undefined} data-testid="submit-supplier-questionnaire-tooltip-trigger">
                      <Button onClick={handleSubmit} disabled={submitting || submissionDeadlinePassed} aria-label={submissionDeadlinePassed ? 'Submit unavailable because the due date has passed' : undefined} data-testid="submit-supplier-questionnaire-button">
                        {submissionDeadlinePassed ? <LockKeyhole className="h-4 w-4 mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                        {submitting ? 'Submitting...' : hasUnlockedQuestions ? 'Resubmit Clarifications' : 'Submit'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {submissionDeadlinePassed && <TooltipContent data-testid="submit-supplier-questionnaire-overdue-tooltip">Your due date is passed, contact your customer to change the due date.</TooltipContent>}
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>
      <AlertDialog open={showSubmitConfirm} onOpenChange={(open) => { setShowSubmitConfirm(open); if (!open) setVerificationAccepted(false); }}>
        <AlertDialogContent data-testid="supplier-questionnaire-submit-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="supplier-questionnaire-submit-confirmation-title">Submit and lock this questionnaire?</AlertDialogTitle>
            <AlertDialogDescription data-testid="supplier-questionnaire-submit-confirmation-description">Are you sure you want to submit? Your answers will be locked and cannot be edited.</AlertDialogDescription>
          </AlertDialogHeader>
          <SupplierDataVerificationAcknowledgement
            checked={verificationAccepted}
            onCheckedChange={setVerificationAccepted}
            testIdPrefix="supplier-esg-data-verification"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-supplier-questionnaire-submit-button">Keep editing</AlertDialogCancel>
            <Button variant="outline" onClick={async () => { await handleSave(false); setShowSubmitConfirm(false); }} disabled={saving} data-testid="save-supplier-questionnaire-draft-from-submit-dialog-button">{saving ? 'Saving...' : 'Save as Draft'}</Button>
            <AlertDialogAction onClick={() => handleSave(true)} disabled={submitting || !verificationAccepted} data-testid="confirm-supplier-questionnaire-submit-button">{submitting ? 'Submitting...' : 'Submit and lock'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(pendingEvidenceReuse)} onOpenChange={(open) => !open && setPendingEvidenceReuse(null)}>
        <AlertDialogContent data-testid="supplier-evidence-reuse-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="supplier-evidence-reuse-title">{pendingEvidenceReuse?.exact ? 'This file has already been uploaded.' : 'A file with this name has already been uploaded.'}</AlertDialogTitle>
            <AlertDialogDescription data-testid="supplier-evidence-reuse-description">{pendingEvidenceReuse?.candidate?.original_filename}{pendingEvidenceReuse && !pendingEvidenceReuse.exact ? ' — the selected file appears different from the existing upload.' : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border border-stone-300 bg-white text-stone-800 hover:bg-stone-100" data-testid="cancel-supplier-evidence-reuse-button">Cancel</AlertDialogCancel>
            <Button variant="outline" className="border-emerald-700 bg-white text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900" onClick={() => resolveEvidenceReuse(true)} data-testid="use-existing-supplier-evidence-button">Use Existing File</Button>
            <AlertDialogAction onClick={() => resolveEvidenceReuse(false)} data-testid="upload-new-supplier-evidence-button">{pendingEvidenceReuse?.exact ? 'Upload Anyway' : 'Upload New File'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
