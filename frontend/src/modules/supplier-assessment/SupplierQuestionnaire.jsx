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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
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
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [verificationAccepted, setVerificationAccepted] = useState(false);
  const [uploadingQuestionId, setUploadingQuestionId] = useState('');
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');
  const [highlightedQuestionId, setHighlightedQuestionId] = useState('');

  const fetchQuestionnaire = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}`,
        { headers: getAuthHeader() }
      );
      setQuestionnaire(res.data);
      setQuestions(res.data.questions || []);
      setIsReadOnly(res.data.response_status === 'submitted');
      
      // Load existing answers
      const existingAnswers = {};
      (res.data.questions || []).forEach((q) => {
        if (q.answer !== undefined && q.answer !== null) {
          existingAnswers[q.id] = q.answer;
        }
      });
      setAnswers(existingAnswers);
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

  const uploadEvidence = async (question, file) => {
    if (!file) return;
    setUploadingQuestionId(question.id);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const { data } = await axios.post(`${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/questions/${question.id}/evidence`, payload, { headers: getAuthHeader() });
      setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, evidence_files: [...(item.evidence_files || []), data] } : item));
      toast.success('Evidence attached');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not upload evidence');
    } finally {
      setUploadingQuestionId('');
    }
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
      const answersList = Object.entries(answers).map(([question_id, answer]) => ({
        question_id,
        answer,
      }));
      
      await axios.post(
        `${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/answers`,
        { answers: answersList, is_draft: !isFinal, data_verified: isFinal && verificationAccepted },
        { headers: getAuthHeader() }
      );
      
      if (isFinal) {
        toast.success('Questionnaire submitted successfully');
        setVerificationAccepted(false);
        navigate('/supplier-assessment/supplier');
      } else {
        toast.success('Progress saved');
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
    // Check required questions
    const requiredUnanswered = questions.filter(
      (q) => q.required && (answers[q.id] === undefined || answers[q.id] === '')
    );
    
    if (requiredUnanswered.length > 0) {
      toast.error(`Question ${questions.findIndex((q) => q.id === requiredUnanswered[0].id) + 1} needs a response`);
      focusQuestion(requiredUnanswered[0].id);
      return;
    }
    const requiredEvidenceMissing = questions.filter((q) => q.evidence_requirement === 'required' && !(q.evidence_files || []).length);
    if (requiredEvidenceMissing.length > 0) {
      toast.error(`Please attach evidence for all required questions (${requiredEvidenceMissing.length} remaining)`);
      focusQuestion(requiredEvidenceMissing[0].id);
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

  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100;

  const renderQuestionInput = (question) => {
    const value = answers[question.id];
    
    switch (question.response_type) {
      case 'yes_no':
        return (
          <RadioGroup
            value={value?.toString() || ''}
            onValueChange={(v) => handleAnswer(question.id, v === 'true')}
            disabled={isReadOnly}
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
            disabled={isReadOnly}
            placeholder="Enter a number"
            className="max-w-xs"
            data-testid={`supplier-questionnaire-answer-${question.id}`}
          />
        );
      
      case 'dropdown':
        return (
          <Select
            value={value || ''}
            onValueChange={(v) => handleAnswer(question.id, v)}
            disabled={isReadOnly}
          >
            <SelectTrigger className="max-w-xs" data-testid={`supplier-questionnaire-answer-${question.id}`}>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {(question.options || []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label || opt.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      case 'text':
      default:
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => handleAnswer(question.id, e.target.value)}
            disabled={isReadOnly}
            placeholder="Enter your answer"
            rows={4}
            data-testid={`supplier-questionnaire-answer-${question.id}`}
          />
        );
    }
  };

  const renderQuestionEvidence = (question) => {
    const files = question.evidence_files || [];
    const required = question.evidence_requirement === 'required';
    const optional = question.evidence_requirement === 'optional';
    if (!required && !optional && files.length === 0) return null;
    return <div className="mt-5 border-t border-stone-100 pt-4" data-testid={`supplier-question-evidence-${question.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-stone-800" data-testid={`supplier-question-evidence-label-${question.id}`}>Evidence {required ? <span className="text-rose-600">required</span> : <span className="text-stone-500">optional</span>}</p><p className="mt-1 text-xs text-stone-500">Attach supporting documents for this response.</p></div>{!isReadOnly && <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.csv,.doc,.docx" disabled={uploadingQuestionId === question.id} onChange={(event) => { uploadEvidence(question, event.target.files?.[0]); event.target.value = ''; }} className="max-w-xs cursor-pointer" data-testid={`supplier-question-evidence-upload-${question.id}`} />}</div>
      {uploadingQuestionId === question.id && <p className="mt-2 text-xs text-stone-500" data-testid={`supplier-question-evidence-uploading-${question.id}`}>Uploading evidence…</p>}
      {files.length > 0 && <ul className="mt-3 space-y-2" data-testid={`supplier-question-evidence-list-${question.id}`}>{files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-200 bg-stone-50 px-3 py-2"><span className="flex min-w-0 items-center gap-2 text-sm text-stone-700" data-testid={`supplier-question-evidence-name-${question.id}-${file.id}`}><Paperclip className="h-4 w-4 shrink-0 text-stone-500" /> <span className="truncate">{file.original_filename}</span></span><span className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`View ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-view`} onClick={() => openEvidence(question, file)} data-testid={`view-supplier-question-evidence-${question.id}-${file.id}`}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Download ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-download`} onClick={() => openEvidence(question, file, true)} data-testid={`download-supplier-question-evidence-${question.id}-${file.id}`}><Download className="h-4 w-4" /></Button></span></li>)}</ul>}
    </div>;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8" data-testid="supplier-questionnaire">
      <SupplierPageHeader
        title={questionnaire.name}
        description={questionnaire.description}
        icon={ClipboardCheck}
        iconClassName="border-violet-200 bg-violet-50 text-violet-700"
        testId="supplier-questionnaire"
        leading={<Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="supplier-questionnaire-back-button">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>}
        aside={<>
        {questionnaire.due_date && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900" data-testid="supplier-questionnaire-due-date"><Calendar className="mr-1 h-3 w-3" />Due {new Date(questionnaire.due_date).toLocaleDateString()}</Badge>}
        {isReadOnly && (
          <Badge className="bg-green-100 text-green-800" data-testid="supplier-questionnaire-locked-badge">
            <CheckCircle className="h-3 w-3 mr-1" />
            Submitted
          </Badge>
        )}
        {questionnaire.response_status === 'in_progress' && questionnaire.reopened_at && (
          <Badge className="bg-amber-100 text-amber-800" data-testid="supplier-questionnaire-reopened-badge">Unlocked for resubmission</Badge>
        )}
        </>}
      />

      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-stone-500">
              {questions.length} questions
            </span>
            <span className="text-sm text-stone-500">
              {answeredCount} answered
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
      {questions.map((question, index) => <Card key={question.id} id={`supplier-question-${question.id}`} tabIndex={-1} className={`scroll-mt-24 transition-[box-shadow,border-color] ${highlightedQuestionId === question.id ? 'border-amber-400 ring-2 ring-amber-200' : ''}`} data-testid={`supplier-questionnaire-question-card-${question.id}`}>
        <CardHeader>
          <div className="flex items-start gap-2">
            {answers[question.id] !== undefined ? (
              <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
            ) : (
              <Circle className="h-5 w-5 text-stone-300 mt-0.5" />
            )}
            <div>
              <CardTitle className="text-lg">
                {index + 1}. {question.question_text}
                {question.required && <span className="text-red-500 ml-1">*</span>}
              </CardTitle>
              {question.description && (
                <CardDescription className="mt-2">{question.description}</CardDescription>
              )}
            </div>
          </div>
          <Badge variant="outline" className="w-fit mt-2">
            {question.category}
          </Badge>
        </CardHeader>
        <CardContent>
          {renderQuestionInput(question)}
          {renderQuestionEvidence(question)}
        </CardContent>
      </Card>)}</div>

      {/* Navigation */}
      <div className="flex justify-end border-t border-stone-200 pt-5">
        <div className="flex items-center gap-3" data-testid="supplier-questionnaire-actions">
          {!isReadOnly && (
            <>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} data-testid="save-supplier-questionnaire-draft-button">
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} data-testid="submit-supplier-questionnaire-button">
                <Send className="h-4 w-4 mr-1" />
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
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
            <Button variant="outline" onClick={async () => { await handleSave(false); setShowSubmitConfirm(false); }} disabled={saving} data-testid="save-supplier-questionnaire-draft-button">{saving ? 'Saving...' : 'Save as Draft'}</Button>
            <AlertDialogAction onClick={() => handleSave(true)} disabled={submitting || !verificationAccepted} data-testid="confirm-supplier-questionnaire-submit-button">{submitting ? 'Submitting...' : 'Submit and lock'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
