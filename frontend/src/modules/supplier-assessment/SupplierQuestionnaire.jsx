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
  Circle,
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

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

  const handleSave = async (isFinal = false) => {
    const saveFn = isFinal ? setSubmitting : setSaving;
    saveFn(true);
    
    try {
      const answersList = Object.entries(answers).map(([question_id, answer]) => ({
        question_id,
        answer,
      }));
      
      await axios.post(
        `${API}/supplier-assessment/my-assessment/questionnaires/${questionnaireId}/answers`,
        { answers: answersList, is_draft: !isFinal },
        { headers: getAuthHeader() }
      );
      
      if (isFinal) {
        toast.success('Questionnaire submitted successfully');
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

  const handleSubmit = () => {
    // Check required questions
    const requiredUnanswered = questions.filter(
      (q) => q.required && (answers[q.id] === undefined || answers[q.id] === '')
    );
    
    if (requiredUnanswered.length > 0) {
      toast.error(`Please answer all required questions (${requiredUnanswered.length} remaining)`);
      // Navigate to first unanswered required question
      const firstIndex = questions.findIndex((q) => q.id === requiredUnanswered[0].id);
      if (firstIndex >= 0) setCurrentIndex(firstIndex);
      return;
    }
    
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

  const currentQuestion = questions[currentIndex];
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

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="supplier-questionnaire">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="supplier-questionnaire-back-button">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-xl font-semibold text-stone-900 mt-2">{questionnaire.name}</h1>
          {questionnaire.description && (
            <p className="text-sm text-stone-500 mt-1">{questionnaire.description}</p>
          )}
        </div>
        {isReadOnly && (
          <Badge className="bg-green-100 text-green-800" data-testid="supplier-questionnaire-locked-badge">
            <CheckCircle className="h-3 w-3 mr-1" />
            Submitted
          </Badge>
        )}
        {questionnaire.response_status === 'in_progress' && questionnaire.reopened_at && (
          <Badge className="bg-amber-100 text-amber-800" data-testid="supplier-questionnaire-reopened-badge">Unlocked for resubmission</Badge>
        )}
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-stone-500">
              Question {currentIndex + 1} of {questions.length}
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
          {/* Question dots */}
          <div className="flex flex-wrap gap-1 mt-3">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                data-testid={`supplier-questionnaire-step-${i + 1}`}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${
                  i === currentIndex
                    ? 'bg-emerald-500 text-white'
                    : answers[q.id] !== undefined
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-stone-100 text-stone-400'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Question Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            {answers[currentQuestion.id] !== undefined ? (
              <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
            ) : (
              <Circle className="h-5 w-5 text-stone-300 mt-0.5" />
            )}
            <div>
              <CardTitle className="text-lg">
                {currentQuestion.question_text}
                {currentQuestion.required && <span className="text-red-500 ml-1">*</span>}
              </CardTitle>
              {currentQuestion.description && (
                <CardDescription className="mt-2">{currentQuestion.description}</CardDescription>
              )}
            </div>
          </div>
          <Badge variant="outline" className="w-fit mt-2">
            {currentQuestion.category}
          </Badge>
        </CardHeader>
        <CardContent>
          {renderQuestionInput(currentQuestion)}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          data-testid="supplier-questionnaire-previous-button"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        
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
        
        <Button
          variant="outline"
          onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
          disabled={currentIndex === questions.length - 1}
          data-testid="supplier-questionnaire-next-button"
        >
          Next
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent data-testid="supplier-questionnaire-submit-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="supplier-questionnaire-submit-confirmation-title">Submit and lock this questionnaire?</AlertDialogTitle>
            <AlertDialogDescription data-testid="supplier-questionnaire-submit-confirmation-description">Are you sure you want to submit? Your answers will be locked and cannot be edited unless your customer unlocks the questionnaire.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-supplier-questionnaire-submit-button">Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSave(true)} disabled={submitting} data-testid="confirm-supplier-questionnaire-submit-button">{submitting ? 'Submitting...' : 'Submit and lock'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
