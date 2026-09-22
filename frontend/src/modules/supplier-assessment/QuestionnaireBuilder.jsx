import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { CardTitle } from '../../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Copy,
  GripVertical,
  FileText,
  Settings2,
  ArrowUpRight,
  ArrowDownRight,
  ToggleLeft,
  List,
  Info,
  ClipboardCheck,
  CalendarDays,
  Search,
} from 'lucide-react';
import { SupplierResponseReviewDialog } from './components/SupplierResponseReviewDialog';
import { QuestionLedgerDialog } from './components/QuestionLedgerDialog';
import { SupplierQuestionnairePreviewDialog } from './components/SupplierQuestionnairePreviewDialog';
import { QuestionnaireQuestionRow } from './components/QuestionnaireQuestionRow';
import { SupplierAssignmentManagerDialog } from './components/SupplierAssignmentManagerDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const responseTypes = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'dropdown', label: 'Dropdown' },
];

const sections = [
  { value: 'environment', label: 'Environment' },
  { value: 'social', label: 'Social' },
  { value: 'governance', label: 'Governance' },
];

const questionCategories = [
  { value: 'policy', label: 'Policy', groupLabel: 'Policy' },
  { value: 'reporting', label: 'Reporting', groupLabel: 'Reporting' },
  { value: 'certification', label: 'Certification', groupLabel: 'Certifications' },
];

const sectionStyles = {
  environment: { container: 'border-emerald-200 bg-emerald-50/30', heading: 'text-emerald-950', badge: 'border-emerald-200 bg-emerald-100 text-emerald-800' },
  social: { container: 'border-sky-200 bg-sky-50/30', heading: 'text-sky-950', badge: 'border-sky-200 bg-sky-100 text-sky-800' },
  governance: { container: 'border-amber-200 bg-amber-50/30', heading: 'text-amber-950', badge: 'border-amber-200 bg-amber-100 text-amber-800' },
};

const categoryStyles = {
  policy: { container: 'border-indigo-200 bg-indigo-50/40', heading: 'text-indigo-950', badge: 'border-indigo-200 bg-indigo-100 text-indigo-800' },
  reporting: { container: 'border-rose-200 bg-rose-50/40', heading: 'text-rose-950', badge: 'border-rose-200 bg-rose-100 text-rose-800' },
  certification: { container: 'border-teal-200 bg-teal-50/40', heading: 'text-teal-950', badge: 'border-teal-200 bg-teal-100 text-teal-800' },
};

// Scoring rules with descriptions
const scoringRules = [
  { 
    value: 'higher_is_better', 
    label: 'Higher is Better',
    description: 'Score increases as value increases (e.g., renewable energy %)',
    icon: ArrowUpRight,
    color: 'text-emerald-600',
    fields: ['target', 'min', 'max'],
  },
  { 
    value: 'lower_is_better', 
    label: 'Lower is Better',
    description: 'Score decreases as value increases (e.g., emissions)',
    icon: ArrowDownRight,
    color: 'text-blue-600',
    fields: ['max_acceptable', 'min'],
  },
  { 
    value: 'boolean', 
    label: 'Boolean (Yes/No)',
    description: 'Binary scoring for certifications or policies',
    icon: ToggleLeft,
    color: 'text-purple-600',
    fields: ['true_score', 'false_score'],
  },
  { 
    value: 'choice_mapping', 
    label: 'Choice Mapping',
    description: 'Map each dropdown option to a specific score',
    icon: List,
    color: 'text-amber-600',
    fields: ['choices'],
  },
];

const scoringRulesByResponseType = {
  yes_no: ['boolean'],
  numeric: ['higher_is_better', 'lower_is_better'],
  percentage: ['higher_is_better', 'lower_is_better'],
  dropdown: ['choice_mapping'],
};

const compatibleScoringRules = (responseType) => scoringRules.filter(
  (rule) => (scoringRulesByResponseType[responseType] || []).includes(rule.value),
);
const isSupportedResponseType = (responseType) => responseTypes.some((type) => type.value === responseType);

// Helper to get default scoring config based on response type
const getDefaultScoringConfig = (responseType) => {
  switch (responseType) {
    case 'yes_no':
      return { rule: 'boolean', true_score: 100, false_score: 0 };
    case 'numeric':
    case 'percentage':
      return { rule: 'higher_is_better', target: 100, min: 0, max: 100, max_score: 100 };
    case 'dropdown':
      return { rule: 'choice_mapping', choices: {} };
    default:
      return { rule: 'boolean', true_score: 100, false_score: 0 };
  }
};

const parseNumericInput = (value) => {
  if (value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const isFiniteNumber = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
const isScore = (value) => isFiniteNumber(value) && Number(value) >= 0 && Number(value) <= 100;

const hydrateDropdownOptionScores = (options, scoring) => (options || []).map((option) => ({
  ...option,
  score: option.score ?? scoring?.choices?.[option.value] ?? null,
}));

const questionTypeLabel = (value) => responseTypes.find((type) => type.value === value)?.label || value;
const scoringLabel = (value) => scoringRules.find((rule) => rule.value === value)?.label || 'Not configured';
const questionnaireDeadlinePassed = (questionnaire) => Boolean(questionnaire?.due_date) && new Date(`${questionnaire.due_date}T23:59:59`).getTime() < Date.now();
const importanceClasses = {
  low: 'border-stone-200 bg-stone-50 text-stone-600',
  medium: 'border-stone-200 bg-stone-50 text-stone-600',
  high: 'border-stone-200 bg-stone-50 text-stone-600',
};

export default function QuestionnaireBuilder() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  const [questionnaires, setQuestionnaires] = useState([]);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [questionnaireSearch, setQuestionnaireSearch] = useState('');
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [questionDialogMode, setQuestionDialogMode] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showSubmissionsDialog, setShowSubmissionsDialog] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [reviewResponse, setReviewResponse] = useState(null);
  const [reviewSupplier, setReviewSupplier] = useState(null);
  const [showQuestionPreview, setShowQuestionPreview] = useState(false);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [questionnaireAssignmentRows, setQuestionnaireAssignmentRows] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState('');
  const [unlockingAssignmentId, setUnlockingAssignmentId] = useState('');
  
  // Form states
  const [questionnaireForm, setQuestionnaireForm] = useState({
    name: '',
    description: '',
    due_date: '',
    esg_section_weights: { environment: 33.33, social: 33.33, governance: 33.34 },
    overall_supplier_weights: { esg: 40, ghg: 40, revenue: 20 },
    assignment_mode: 'all',
    supplier_relationship_ids: [],
    assignment_reporting_period: reportingPeriod,
  });
  const [assignmentSuppliers, setAssignmentSuppliers] = useState([]);
  
  const [questionForm, setQuestionForm] = useState({
    question_text: '',
    description: '',
    response_type: 'yes_no',
    options: [],
    required: true,
    evidence_requirement: 'not_required',
    importance: 'medium',
    exact_numerical_weight: null,
    category: 'environment',
    question_category: 'policy',
    order: 0,
    parent_question_id: null,
    scoring: { rule: 'boolean', true_score: 100, false_score: 0 },
  });
  
  const [submitting, setSubmitting] = useState(false);

  const fetchQuestionnaires = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/questionnaires?include_inactive=true`, {
        params: { reporting_period: reportingPeriod },
        headers: getAuthHeader(),
      });
      const periodQuestionnaires = res.data || [];
      setQuestionnaires(periodQuestionnaires);
      setSelectedQuestionnaire((current) => {
        if (!current || periodQuestionnaires.some((questionnaire) => questionnaire.id === current.id)) return current;
        return null;
      });
    } catch (err) {
      toast.error('Failed to load questionnaires');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, reportingPeriod]);

  const fetchQuestions = useCallback(async (questionnaireId) => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/questionnaires/${questionnaireId}`, {
        headers: getAuthHeader(),
      });
      setQuestions(res.data.questions || []);
    } catch (err) {
      toast.error('Failed to load questions');
    }
  }, [getAuthHeader]);

  const groupedQuestions = useMemo(() => sections.map((section) => ({
    ...section,
    categories: questionCategories.map((questionCategory) => ({
      ...questionCategory,
      questions: questions.filter((question) => question.category === section.value
        && (question.question_category || 'policy') === questionCategory.value),
    })),
  })), [questions]);

  const filteredQuestionnaires = useMemo(() => {
    const query = questionnaireSearch.trim().toLowerCase();
    if (!query) return questionnaires;
    return questionnaires.filter((questionnaire) => [questionnaire.name, questionnaire.description]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [questionnaireSearch, questionnaires]);

  const openQuestionnaireAssignments = async () => {
    if (!selectedQuestionnaire) return;
    setShowAssignmentDialog(true); setQuestionnaireAssignmentRows([]); setLoadingAssignments(true);
    try { setQuestionnaireAssignmentRows((await axios.get(`${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}/assignments`, { headers: getAuthHeader() })).data.assignments || []); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not load questionnaire assignments'); setShowAssignmentDialog(false); }
    finally { setLoadingAssignments(false); }
  };
  const toggleQuestionnaireAssignment = async (row, assigned) => {
    if (!selectedQuestionnaire) return;
    setUpdatingAssignmentId(row.supplier_relationship_id);
    try {
      if (assigned) await axios.post(`${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}/assignments/${row.supplier_relationship_id}`, {}, { headers: getAuthHeader() });
      else await axios.delete(`${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}/assignments/${row.supplier_relationship_id}`, { headers: getAuthHeader() });
      setQuestionnaireAssignmentRows((current) => current.map((item) => item.supplier_relationship_id === row.supplier_relationship_id ? { ...item, is_assigned: assigned, can_unassign: assigned, can_unlock: false, status: assigned ? 'not_started' : 'not_assigned' } : item));
      toast.success(assigned ? 'Questionnaire assigned' : 'Questionnaire unassigned'); await fetchQuestionnaires();
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not update questionnaire assignment'); }
    finally { setUpdatingAssignmentId(''); }
  };
  const unlockQuestionnaireAssignment = async (row) => {
    if (!selectedQuestionnaire || !window.confirm(`Unlock ${row.supplier_name}'s questionnaire response for resubmission?`)) return;
    setUnlockingAssignmentId(row.supplier_relationship_id);
    try {
      await axios.post(`${API}/supplier-assessment/suppliers/${row.supplier_relationship_id}/questionnaires/${selectedQuestionnaire.id}/reopen`, {}, { headers: getAuthHeader() });
      setQuestionnaireAssignmentRows((current) => current.map((item) => item.supplier_relationship_id === row.supplier_relationship_id ? { ...item, status: 'in_progress', can_unassign: true, can_unlock: false } : item));
      toast.success('Questionnaire response unlocked');
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not unlock questionnaire response'); }
    finally { setUnlockingAssignmentId(''); }
  };

  useEffect(() => {
    fetchQuestionnaires();
  }, [fetchQuestionnaires]);

  useEffect(() => {
    if (!showCreateDialog) return;
    setQuestionnaireForm((current) => ({ ...current, assignment_reporting_period: reportingPeriod }));
    axios.get(`${API}/supplier-assessment/suppliers`, {
      params: { page: 1, page_size: 100, reporting_period: reportingPeriod },
      headers: getAuthHeader(),
    }).then((response) => {
      setAssignmentSuppliers((response.data.suppliers || []).filter((supplier) => supplier.modules_enabled?.includes('esg')));
    }).catch(() => toast.error('Could not load suppliers for questionnaire assignment'));
  }, [showCreateDialog, getAuthHeader, reportingPeriod]);

  useEffect(() => {
    if (selectedQuestionnaire) {
      fetchQuestions(selectedQuestionnaire.id);
    }
  }, [selectedQuestionnaire, fetchQuestions]);

  const handleCreateQuestionnaire = async () => {
    if (!questionnaireForm.name) {
      toast.error('Please enter a name');
      return;
    }
    if (!validateQuestionnaireWeights()) return;
    if (questionnaireForm.assignment_mode === 'selected' && questionnaireForm.supplier_relationship_ids.length === 0) {
      toast.error('Select at least one supplier');
      return;
    }
    
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/supplier-assessment/questionnaires`, {
        ...questionnaireForm,
        assignment_reporting_period: reportingPeriod,
      }, {
        headers: getAuthHeader(),
      });
      toast.success('Questionnaire created');
      setShowCreateDialog(false);
      setQuestionnaireForm({
        name: '',
        description: '',
        due_date: '',
        esg_section_weights: { environment: 33.33, social: 33.33, governance: 33.34 },
        overall_supplier_weights: { esg: 40, ghg: 40, revenue: 20 },
        assignment_mode: 'all',
        supplier_relationship_ids: [],
        assignment_reporting_period: reportingPeriod,
      });
      fetchQuestionnaires();
      setSelectedQuestionnaire(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create questionnaire');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateQuestionnaire = async () => {
    if (!selectedQuestionnaire) return;
    if (!validateQuestionnaireWeights()) return;
    
    setSubmitting(true);
    try {
      await axios.put(
        `${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}`,
        questionnaireForm,
        { headers: getAuthHeader() }
      );
      toast.success('Questionnaire updated');
      setShowEditDialog(false);
      fetchQuestionnaires();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update questionnaire');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuestionnaire = async (id) => {
    if (!window.confirm('Delete this questionnaire?')) return;
    
    try {
      await axios.delete(`${API}/supplier-assessment/questionnaires/${id}`, {
        headers: getAuthHeader(),
      });
      toast.success('Questionnaire deleted');
      if (selectedQuestionnaire?.id === id) {
        setSelectedQuestionnaire(null);
        setQuestions([]);
      }
      fetchQuestionnaires();
    } catch (err) {
      toast.error('Failed to delete questionnaire');
    }
  };

  const handleQuestionnaireActivation = async (questionnaire) => {
    try {
      const response = await axios.put(
        `${API}/supplier-assessment/questionnaires/${questionnaire.id}`,
        { is_active: !questionnaire.is_active },
        { headers: getAuthHeader() },
      );
      if (selectedQuestionnaire?.id === questionnaire.id) setSelectedQuestionnaire(response.data);
      toast.success(`Questionnaire ${questionnaire.is_active ? 'deactivated' : 'activated'}`);
      fetchQuestionnaires();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not update questionnaire availability');
    }
  };

  const handleDuplicateQuestionnaire = async (id, name) => {
    try {
      await axios.post(
        `${API}/supplier-assessment/questionnaires/${id}/duplicate?new_name=${encodeURIComponent(name + ' (Copy)')}`,
        {},
        { headers: getAuthHeader() }
      );
      toast.success('Questionnaire duplicated');
      fetchQuestionnaires();
    } catch (err) {
      toast.error('Failed to duplicate questionnaire');
    }
  };

  const handleAddLedgerQuestions = async (draftQuestions) => {
    if (!selectedQuestionnaire) return;
    const missingQuestion = draftQuestions.find((question) => !question.question_text.trim());
    if (missingQuestion) { toast.error('Each ledger row needs question text before it can be added.'); return; }
    const invalidDropdown = draftQuestions.find((question) => question.response_type === 'dropdown' && question.options_text.split(',').map((value) => value.trim()).filter(Boolean).length < 2);
    if (invalidDropdown) { toast.error('Dropdown questions need at least two comma-separated options.'); return; }
    const invalidScore = draftQuestions.find((question) => {
      if (question.response_type === 'yes_no') return !isScore(question.yes_score) || !isScore(question.no_score);
      if (question.response_type === 'dropdown') return question.options_text.split(',').map((value) => value.trim()).filter(Boolean).some((value) => !isScore(question.option_scores?.[value]));
      return false;
    });
    if (invalidScore) { toast.error('Enter a score from 0 to 100 for every Yes/No or dropdown option.'); return; }
    setSubmitting(true);
    try {
      const createdIdsByDraftId = {};
      const roots = draftQuestions.filter((question) => !question.parent_draft_id);
      const children = draftQuestions.filter((question) => question.parent_draft_id);
      const rootOrder = questions.filter((question) => !question.parent_question_id).length;
      const createLedgerQuestion = async (question, order, parentQuestionId = null) => {
        const { draft_id, parent_draft_id, options_text, option_scores, scoring_rule, ...questionPayload } = question;
        const values = question.response_type === 'dropdown' ? options_text.split(',').map((value) => value.trim()).filter(Boolean) : [];
        const options = values.map((value) => ({ value, label: value, score: Number(question.option_scores?.[value]) }));
        const scoring = scoring_rule === 'lower_is_better'
          ? { rule: 'lower_is_better', min: 0, max_acceptable: 100, max_score: 100 }
          : { ...getDefaultScoringConfig(question.response_type), rule: scoring_rule };
        if (question.response_type === 'dropdown') scoring.choices = Object.fromEntries(options.map((option) => [option.value, option.score]));
        if (question.response_type === 'yes_no') { scoring.true_score = Number(question.yes_score); scoring.false_score = Number(question.no_score); }
        const response = await axios.post(`${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}/questions`, { ...questionPayload, description: '', importance: question.importance, exact_numerical_weight: null, options, scoring, order, parent_question_id: parentQuestionId }, { headers: getAuthHeader() });
        return response.data;
      };
      for (const [index, question] of roots.entries()) {
        const created = await createLedgerQuestion(question, rootOrder + index);
        createdIdsByDraftId[question.draft_id] = created.id;
      }
      const childOrderByParent = {};
      for (const question of children) {
        const parentQuestionId = createdIdsByDraftId[question.parent_draft_id];
        if (!parentQuestionId) throw new Error('A follow-up question is missing its parent.');
        const childOrder = childOrderByParent[question.parent_draft_id] || 0;
        await createLedgerQuestion(question, childOrder, parentQuestionId);
        childOrderByParent[question.parent_draft_id] = childOrder + 1;
      }
      toast.success(`${draftQuestions.length} question${draftQuestions.length === 1 ? '' : 's'} added`);
      setShowQuestionDialog(false);
      setQuestionDialogMode(null);
      fetchQuestions(selectedQuestionnaire.id);
    } catch (err) {
      toast.error('Failed to add question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion) return;
    if (!validateQuestionScoring()) return;
    
    setSubmitting(true);
    try {
      await axios.put(
        `${API}/supplier-assessment/questions/${editingQuestion.id}`,
        buildQuestionPayload(questionForm.order),
        { headers: getAuthHeader() }
      );
      toast.success('Question updated');
      setShowQuestionDialog(false);
      setQuestionDialogMode(null);
      setEditingQuestion(null);
      resetQuestionForm();
      fetchQuestions(selectedQuestionnaire.id);
    } catch (err) {
      toast.error('Failed to update question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Delete this question?')) return;
    
    try {
      await axios.delete(`${API}/supplier-assessment/questions/${questionId}`, {
        headers: getAuthHeader(),
      });
      toast.success('Question deleted');
      fetchQuestions(selectedQuestionnaire.id);
    } catch (err) {
      toast.error('Failed to delete question');
    }
  };

  const openSubmissions = async () => {
    if (!selectedQuestionnaire) return;
    setShowSubmissionsDialog(true);
    setLoadingSubmissions(true);
    try {
      const response = await axios.get(`${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}/submissions`, {
        params: { reporting_period: reportingPeriod }, headers: getAuthHeader(),
      });
      setSubmissions(response.data.submissions || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not load submitted responses');
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const openSubmissionReview = async (submission) => {
    if (!selectedQuestionnaire) return;
    try {
      const response = await axios.get(`${API}/supplier-assessment/suppliers/${submission.supplier_id}/questionnaires/${selectedQuestionnaire.id}/responses`, { headers: getAuthHeader() });
      setReviewSupplier(submission);
      setReviewResponse(response.data);
      setShowSubmissionsDialog(false);
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not load supplier response'); }
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      question_text: '',
      description: '',
      response_type: 'yes_no',
      options: [],
      required: true,
      evidence_requirement: 'not_required',
        importance: 'medium',
        exact_numerical_weight: null,
      category: 'environment',
      question_category: 'policy',
      order: 0,
      parent_question_id: null,
      scoring: { rule: 'boolean', true_score: 100, false_score: 0 },
    });
  };

  const handleQuestionDialogOpenChange = (open) => {
    setShowQuestionDialog(open);
    if (!open) {
      setQuestionDialogMode(null);
      setEditingQuestion(null);
      resetQuestionForm();
    }
  };

  const validateQuestionnaireWeights = () => {
    const esgTotal = Object.values(questionnaireForm.esg_section_weights || {}).reduce((total, value) => total + Number(value || 0), 0);
    const overallTotal = Object.values(questionnaireForm.overall_supplier_weights || {}).reduce((total, value) => total + Number(value || 0), 0);
    if (Math.abs(esgTotal - 100) > 0.01 || Math.abs(overallTotal - 100) > 0.01) {
      toast.error(`Weight distribution is incomplete, must be 100% currently it is ${esgTotal.toFixed(2)}%.`);
      return false;
    }
    return true;
  };

  const toggleAssignedSupplier = (supplierId) => {
    setQuestionnaireForm((current) => ({
      ...current,
      supplier_relationship_ids: current.supplier_relationship_ids.includes(supplierId)
        ? current.supplier_relationship_ids.filter((id) => id !== supplierId)
        : [...current.supplier_relationship_ids, supplierId],
    }));
  };

  const openEditQuestion = (question) => {
    const responseType = isSupportedResponseType(question.response_type)
      ? question.response_type
      : 'yes_no';
    const existingScoring = question.scoring || getDefaultScoringConfig(responseType);
    const scoring = compatibleScoringRules(responseType).some((rule) => rule.value === existingScoring.rule)
      ? existingScoring
      : getDefaultScoringConfig(responseType);
    setEditingQuestion(question);
    setQuestionForm({
      question_text: question.question_text,
      description: question.description || '',
      response_type: responseType,
      options: hydrateDropdownOptionScores(question.options, scoring),
      required: question.required,
      evidence_requirement: question.evidence_requirement || 'not_required',
      importance: question.importance || 'medium',
      exact_numerical_weight: question.exact_numerical_weight ?? (question.importance ? null : question.weight ?? null),
      category: question.category,
      question_category: question.question_category || 'policy',
      order: question.order,
      parent_question_id: question.parent_question_id || null,
      scoring,
    });
    setQuestionDialogMode('edit');
    setShowQuestionDialog(true);
  };

  const openEditQuestionnaire = (q) => {
    setQuestionnaireForm({
      name: q.name,
      description: q.description || '',
      due_date: q.due_date || '',
      esg_section_weights: q.esg_section_weights || q.section_weights || { environment: 33.33, social: 33.33, governance: 33.34 },
      overall_supplier_weights: q.overall_supplier_weights || { esg: 40, ghg: 40, revenue: 20 },
    });
    setShowEditDialog(true);
  };

  // Update scoring when response type changes
  const handleResponseTypeChange = (newType) => {
    setQuestionForm({ 
      ...questionForm, 
      response_type: newType,
      scoring: getDefaultScoringConfig(newType),
      options: newType === 'dropdown' ? [] : questionForm.options,
    });
  };

  // Update scoring config
  const updateScoringConfig = (field, value) => {
    setQuestionForm({
      ...questionForm,
      scoring: {
        ...questionForm.scoring,
        [field]: value,
      },
    });
  };

  const buildQuestionPayload = (order) => {
    const options = questionForm.options.map((option) => ({
      ...option,
      value: option.value.trim(),
      label: option.label.trim(),
    }));
    const scoring = { ...questionForm.scoring };
    if (scoring.rule === 'choice_mapping') {
      scoring.choices = Object.fromEntries(options.map((option) => [option.value, Number(option.score)]));
    }
    return { ...questionForm, options, scoring, order };
  };

  const validateQuestionScoring = () => {
    const scoring = questionForm.scoring || {};
    const { rule } = scoring;
    const requireNumber = (value, label) => {
      if (!isFiniteNumber(value)) {
        toast.error(`${label} must be a number.`);
        return false;
      }
      return true;
    };
    const requireScore = (value, label) => {
      if (!isScore(value)) {
        toast.error(`${label} must be between 0 and 100.`);
        return false;
      }
      return true;
    };

    if (['higher_is_better', 'lower_is_better'].includes(rule)
      && !requireScore(scoring.max_score, 'Score cap')) return false;

    if (rule === 'higher_is_better') {
      if (!requireNumber(scoring.min, 'Lowest value') || !requireNumber(scoring.target, 'Target value')) return false;
      if (Number(scoring.target) <= Number(scoring.min)) {
        toast.error('Target value must be greater than the lowest value.');
        return false;
      }
    }
    if (rule === 'lower_is_better') {
      if (!requireNumber(scoring.min, 'Best value') || !requireNumber(scoring.max_acceptable, 'Zero-score threshold')) return false;
      if (Number(scoring.max_acceptable) <= Number(scoring.min)) {
        toast.error('Zero-score threshold must be greater than the best value.');
        return false;
      }
    }
    if (rule === 'boolean' && (!requireScore(scoring.true_score, 'Yes score') || !requireScore(scoring.false_score, 'No score'))) return false;
    if (rule === 'choice_mapping') {
      if (questionForm.response_type !== 'dropdown') {
        toast.error('Choice Mapping is only available for dropdown questions.');
        return false;
      }
      if (questionForm.options.length < 2) {
        toast.error('Dropdown questions need at least two options so suppliers can make a meaningful selection.');
        return false;
      }
      const values = questionForm.options.map((option) => option.value.trim());
      if (values.some((value) => !value) || new Set(values).size !== values.length) {
        toast.error('Each dropdown option needs a unique value.');
        return false;
      }
      if (questionForm.options.some((option) => !isScore(option.score))) {
        toast.error('Each dropdown option score must be between 0 and 100.');
        return false;
      }
    }
    return true;
  };

  const addOption = () => {
    setQuestionForm({
      ...questionForm,
      options: [...questionForm.options, { value: '', label: '', score: null }],
    });
  };

  const updateOption = (index, field, value) => {
    const newOptions = [...questionForm.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setQuestionForm({ ...questionForm, options: newOptions });
  };

  const removeOption = (index) => {
    setQuestionForm({
      ...questionForm,
      options: questionForm.options.filter((_, i) => i !== index),
    });
  };

  const handleQuestionDrop = async (draggedQuestionId, targetQuestionId) => {
    if (!draggedQuestionId || draggedQuestionId === targetQuestionId || !selectedQuestionnaire) return;
    const roots = questions.filter((question) => !question.parent_question_id);
    const currentIndex = roots.findIndex((question) => question.id === draggedQuestionId);
    const targetIndex = roots.findIndex((question) => question.id === targetQuestionId);
    if (currentIndex < 0 || targetIndex < 0) return;
    const reorderedRoots = [...roots];
    const [moved] = reorderedRoots.splice(currentIndex, 1);
    reorderedRoots.splice(targetIndex, 0, moved);
    const childrenByParent = questions.reduce((grouped, question) => {
      if (question.parent_question_id) grouped[question.parent_question_id] = [...(grouped[question.parent_question_id] || []), question];
      return grouped;
    }, {});
    const reordered = reorderedRoots.flatMap((question) => [question, ...(childrenByParent[question.id] || [])]);
    setQuestions(reordered);
    try {
      await axios.post(`${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}/reorder`, reorderedRoots.map((question, index) => ({ id: question.id, order: index })), { headers: getAuthHeader() });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not reorder questions');
      fetchQuestions(selectedQuestionnaire.id);
    }
  };

  return (
    <TooltipProvider><div className="space-y-7" data-testid="questionnaire-builder">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5" data-testid="questionnaire-builder-header">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-purple-700 shadow-sm" data-testid="questionnaire-builder-heading-icon">
            <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold text-emerald-950" data-testid="questionnaire-builder-heading">ESG Questionnaires</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-[0_4px_18px_rgba(28,55,43,0.06)] xl:flex-row xl:items-center" data-testid="questionnaire-builder-controls">
        <div className="relative w-full xl:w-64 xl:shrink-0" data-testid="questionnaire-search-control"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" /><Input value={questionnaireSearch} onChange={(event) => setQuestionnaireSearch(event.target.value)} placeholder="Search questionnaires..." className="h-10 border-stone-200 bg-white pl-10 shadow-none transition-[border-color,box-shadow] focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-100" aria-label="Search questionnaires" data-testid="questionnaire-search-input" /></div>
        <Button className="h-10 shrink-0 bg-emerald-800 text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-emerald-900 hover:shadow-md" onClick={() => setShowCreateDialog(true)} data-testid="create-questionnaire-btn"><Plus className="h-4 w-4" />Add Questionnaire</Button>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" data-testid="questionnaire-selection-control">
          <Label htmlFor="questionnaire-builder-selector" className="shrink-0 text-sm font-medium text-stone-600" data-testid="questionnaire-selector-label">Questionnaire</Label>
          <Select value={selectedQuestionnaire?.id || ''} onValueChange={(questionnaireId) => setSelectedQuestionnaire(questionnaires.find((questionnaire) => questionnaire.id === questionnaireId) || null)} disabled={loading || questionnaires.length === 0}>
            <SelectTrigger id="questionnaire-builder-selector" className="h-10 w-full border-stone-200 bg-stone-50 font-medium text-stone-800 shadow-none transition-[border-color,box-shadow] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:max-w-md" data-testid="questionnaire-selector"><SelectValue placeholder={loading ? 'Loading questionnaires…' : 'Select questionnaire'} /></SelectTrigger>
            <SelectContent data-testid="questionnaire-selector-menu">{filteredQuestionnaires.length === 0 ? <div className="px-2 py-4 text-sm text-stone-500" data-testid="questionnaire-selector-empty">No questionnaires match this search.</div> : filteredQuestionnaires.map((questionnaire) => <SelectItem key={questionnaire.id} value={questionnaire.id} data-testid={`questionnaire-selector-option-${questionnaire.id}`}>{questionnaire.name}{!questionnaire.is_active ? ' · Inactive' : ''}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" data-testid="questionnaire-builder-period-control">
          <Label htmlFor="questionnaire-builder-reporting-period" className="flex shrink-0 items-center gap-2 text-sm font-medium text-stone-600" data-testid="questionnaire-builder-period-label"><CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" />Reporting period</Label>
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}><SelectTrigger id="questionnaire-builder-reporting-period" className="h-10 w-full border-stone-200 bg-stone-50 font-medium text-stone-800 shadow-none transition-[border-color,box-shadow] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:w-44" data-testid="questionnaire-builder-period-selector"><SelectValue /></SelectTrigger><SelectContent data-testid="questionnaire-builder-period-menu">{periods.map((period) => <SelectItem key={period} value={period} data-testid={`questionnaire-builder-period-option-${period}`}>{period}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>

      <main>
          {selectedQuestionnaire ? (
            <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-[0_5px_20px_rgba(28,55,43,0.06)]" data-testid="selected-questionnaire-panel">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 px-5 py-5">
                <div><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-2xl font-bold text-stone-950">{selectedQuestionnaire.name}</CardTitle><Badge variant="outline" className={!selectedQuestionnaire.is_active ? 'border-stone-200 bg-stone-50 text-xs font-medium text-stone-600' : questionnaireDeadlinePassed(selectedQuestionnaire) ? 'border-amber-200 bg-amber-50 text-xs font-medium text-amber-800' : 'border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-700'} data-testid="selected-questionnaire-active-status">{!selectedQuestionnaire.is_active ? 'Inactive' : questionnaireDeadlinePassed(selectedQuestionnaire) ? 'Deadline passed' : 'Active'}</Badge></div><p className="mt-2 text-sm text-stone-500">{selectedQuestionnaire.question_count || questions.length} questions{selectedQuestionnaire.due_date ? ` · Due ${new Date(selectedQuestionnaire.due_date).toLocaleDateString()}` : ''}</p></div>
                <div className="flex flex-wrap items-center justify-end gap-2"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`Edit ${selectedQuestionnaire.name}`} onClick={() => openEditQuestionnaire(selectedQuestionnaire)} data-testid="edit-selected-questionnaire"><Edit2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit questionnaire</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`Duplicate ${selectedQuestionnaire.name}`} onClick={() => handleDuplicateQuestionnaire(selectedQuestionnaire.id, selectedQuestionnaire.name)} data-testid="duplicate-selected-questionnaire"><Copy className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Duplicate questionnaire</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`${selectedQuestionnaire.is_active ? 'Deactivate' : 'Activate'} ${selectedQuestionnaire.name}`} onClick={() => handleQuestionnaireActivation(selectedQuestionnaire)} data-testid="toggle-selected-questionnaire-active"><ToggleLeft className={`h-4 w-4 ${selectedQuestionnaire.is_active ? 'text-emerald-700' : 'text-stone-500'}`} /></Button></TooltipTrigger><TooltipContent>{selectedQuestionnaire.is_active ? 'Deactivate questionnaire' : 'Activate questionnaire'}</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" aria-label={`Delete ${selectedQuestionnaire.name}`} onClick={() => handleDeleteQuestionnaire(selectedQuestionnaire.id)} data-testid="delete-selected-questionnaire"><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete questionnaire</TooltipContent></Tooltip><Button variant="outline" className="border-stone-200 bg-white text-stone-700 hover:!bg-stone-50 hover:!text-stone-900" onClick={openSubmissions} data-testid="review-questionnaire-submissions-button"><ClipboardCheck className="h-4 w-4 text-stone-600" />Review responses</Button><Button variant="outline" className="border-stone-200 bg-white text-stone-700 hover:!bg-stone-50 hover:!text-stone-900" onClick={openQuestionnaireAssignments} data-testid="manage-questionnaire-assignments-button">Manage suppliers</Button><Button variant="outline" className="border-stone-200 bg-white text-stone-700 hover:!bg-stone-50 hover:!text-stone-900" onClick={() => setShowQuestionPreview(true)} data-testid="preview-questionnaire-button">Preview</Button><Button className="bg-emerald-800 text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-emerald-900 hover:shadow-md" onClick={() => {
                  resetQuestionForm();
                  setEditingQuestion(null);
                  setQuestionDialogMode('create');
                  setShowQuestionDialog(true);
                }} data-testid="add-question-btn"><Plus className="mr-2 h-4 w-4" />Add Questions</Button></div>
              </div>
              <div className="px-5 py-4" data-testid="question-table">
                <Accordion type="multiple" defaultValue={sections.map((section) => `section-${section.value}`)} className="w-full space-y-3" data-testid="question-section-groups">
                  {groupedQuestions.map((section) => {
                    const sectionCount = section.categories.reduce((total, category) => total + category.questions.length, 0);
                    const sectionStyle = sectionStyles[section.value];
                    return <AccordionItem key={section.value} value={`section-${section.value}`} className={`border px-4 ${sectionStyle.container}`} data-testid={`question-section-group-${section.value}`}>
                      <AccordionTrigger className={`py-4 text-base font-semibold hover:no-underline ${sectionStyle.heading}`} data-testid={`question-section-toggle-${section.value}`}><span>{section.label}</span><Badge variant="outline" className={`mr-3 ${sectionStyle.badge}`} data-testid={`question-section-count-${section.value}`}>{sectionCount}</Badge></AccordionTrigger>
                      <AccordionContent className="pb-4 pt-1">
                        <Accordion type="multiple" defaultValue={section.categories.map((category) => `category-${section.value}-${category.value}`)} className="space-y-2" data-testid={`question-category-groups-${section.value}`}>
                          {section.categories.map((category) => {
                            const categoryStyle = categoryStyles[category.value];
                            return <AccordionItem key={category.value} value={`category-${section.value}-${category.value}`} className={`border px-4 ${categoryStyle.container}`} data-testid={`question-category-group-${section.value}-${category.value}`}>
                            <AccordionTrigger className={`py-3 text-sm font-semibold hover:no-underline ${categoryStyle.heading}`} data-testid={`question-category-toggle-${section.value}-${category.value}`}><span>{category.groupLabel}</span><Badge variant="outline" className={`mr-3 ${categoryStyle.badge}`} data-testid={`question-category-count-${section.value}-${category.value}`}>{category.questions.length}</Badge></AccordionTrigger>
                            <AccordionContent className="pb-2 pt-1"><h3 className="pb-2 text-sm font-medium text-stone-600" data-testid={`question-category-heading-${section.value}-${category.value}`}>{category.label} Questions</h3>{category.questions.length === 0 ? <p className="py-5 text-sm text-stone-400" data-testid={`question-category-empty-${section.value}-${category.value}`}>No {category.label.toLowerCase()} questions.</p> : <div><div className="hidden grid-cols-[2rem_minmax(11rem,1fr)_6rem_6rem_6rem_7.5rem_6.5rem_7.5rem] items-center gap-3 border-b border-stone-100 pb-3 text-[11px] font-medium uppercase tracking-wide text-stone-500 md:grid" data-testid={`question-table-header-${section.value}-${category.value}`}><span>#</span><span>Question</span><span>Section</span><span>Category</span><span>Type</span><span>Field type</span><span>Importance</span><span className="text-right">Actions</span></div>{category.questions.map((question) => <QuestionnaireQuestionRow key={question.id} question={question} index={questions.indexOf(question)} sectionLabel={section.label} questionCategoryLabel={category.label} typeLabel={questionTypeLabel(question.response_type)} scoringLabel={scoringLabel(question.scoring?.rule)} importanceClass={importanceClasses[question.importance] || importanceClasses.medium} onEdit={() => openEditQuestion(question)} onDelete={() => handleDeleteQuestion(question.id)} onDrop={handleQuestionDrop} />)}</div>}</AccordionContent>
                          </AccordionItem>;
                          })}
                        </Accordion>
                      </AccordionContent>
                    </AccordionItem>;
                  })}
                </Accordion>
              </div>
            </section>
          ) : (
            <div className="border border-dashed border-stone-300 bg-stone-50 px-6 py-20 text-center text-stone-500" data-testid="questionnaire-empty-selection"><FileText className="mx-auto mb-3 h-10 w-10 text-stone-300" /><p className="text-sm">{loading ? 'Loading questionnaires…' : questionnaires.length === 0 ? 'No questionnaires yet. Create a questionnaire to begin.' : 'Select a questionnaire to view and edit its questions.'}</p></div>
          )}
      </main>

      <Dialog open={showSubmissionsDialog} onOpenChange={setShowSubmissionsDialog}>
        <DialogContent className="max-w-2xl" data-testid="questionnaire-submissions-dialog"><DialogHeader><DialogTitle data-testid="questionnaire-submissions-title">Submitted responses — {selectedQuestionnaire?.name}</DialogTitle></DialogHeader><div className="max-h-96 space-y-2 overflow-y-auto" data-testid="questionnaire-submissions-list">{loadingSubmissions ? <p className="text-sm text-stone-500" data-testid="questionnaire-submissions-loading">Loading submitted responses…</p> : submissions.length === 0 ? <p className="text-sm text-stone-500" data-testid="questionnaire-submissions-empty">No suppliers have submitted this questionnaire for the selected reporting period.</p> : submissions.map((submission) => <div key={submission.supplier_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-3" data-testid={`questionnaire-submission-${submission.supplier_id}`}><div><p className="font-medium text-stone-900" data-testid={`questionnaire-submission-supplier-${submission.supplier_id}`}>{submission.supplier_name}</p><p className="text-xs text-stone-500" data-testid={`questionnaire-submission-score-${submission.supplier_id}`}>Questionnaire score: {submission.calculated_score ?? 'Pending'} · Manual questions scored: {submission.manual_question_count}</p></div><Button variant="outline" size="sm" className="border-stone-200 bg-white text-stone-700 hover:!bg-stone-50 hover:!text-stone-900" onClick={() => openSubmissionReview(submission)} data-testid={`review-questionnaire-submission-${submission.supplier_id}`}>Review response</Button></div>)}</div><DialogFooter><Button variant="outline" onClick={() => setShowSubmissionsDialog(false)} data-testid="close-questionnaire-submissions-button">Close</Button></DialogFooter></DialogContent>
      </Dialog>
      <SupplierResponseReviewDialog open={Boolean(reviewResponse)} onOpenChange={(open) => !open && setReviewResponse(null)} response={reviewResponse} supplierId={reviewSupplier?.supplier_id} getAuthHeader={getAuthHeader} onScoreSaved={() => { if (reviewSupplier) openSubmissionReview(reviewSupplier); }} />
      <SupplierAssignmentManagerDialog open={showAssignmentDialog} onOpenChange={setShowAssignmentDialog} title={selectedQuestionnaire?.name || ''} rows={questionnaireAssignmentRows} loading={loadingAssignments} updatingId={updatingAssignmentId} unlockingId={unlockingAssignmentId} onToggle={toggleQuestionnaireAssignment} onUnlock={unlockQuestionnaireAssignment} testIdPrefix="questionnaire" />

      {/* Create Questionnaire Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Questionnaire</DialogTitle>
            <DialogDescription>
              Configure the assessment and its score components
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={questionnaireForm.name}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, name: e.target.value })}
                placeholder="Enter questionnaire name"
                data-testid="questionnaire-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={questionnaireForm.due_date}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, due_date: e.target.value })}
                data-testid="new-questionnaire-due-date-input"
              />
            </div>

            <div className="space-y-3 border-t pt-4" data-testid="questionnaire-assignment-controls">
              <Label className="text-sm font-medium">Assign questionnaire to</Label>
              <Select
                value={questionnaireForm.assignment_mode}
                onValueChange={(assignmentMode) => setQuestionnaireForm({
                  ...questionnaireForm,
                  assignment_mode: assignmentMode,
                  supplier_relationship_ids: assignmentMode === 'all' ? [] : questionnaireForm.supplier_relationship_ids,
                })}
              >
                <SelectTrigger data-testid="questionnaire-assignment-mode-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  <SelectItem value="selected">Selected suppliers</SelectItem>
                </SelectContent>
              </Select>
              {questionnaireForm.assignment_mode === 'all' ? (
                <p className="text-xs text-stone-500" data-testid="questionnaire-assignment-all-status">
                  This questionnaire will be assigned to every supplier with ESG enabled for {reportingPeriod}.
                </p>
              ) : (
                <div className="space-y-2" data-testid="questionnaire-assignment-supplier-list">
                  {assignmentSuppliers.length === 0 ? (
                    <p className="text-xs text-stone-500" data-testid="questionnaire-assignment-empty-state">No suppliers are available for {reportingPeriod}.</p>
                  ) : (
                    <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                      {assignmentSuppliers.map((supplier) => (
                        <label key={supplier.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={questionnaireForm.supplier_relationship_ids.includes(supplier.id)}
                            onCheckedChange={() => toggleAssignedSupplier(supplier.id)}
                            data-testid={`questionnaire-assignment-supplier-${supplier.id}`}
                          />
                          <span>{supplier.company_name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="esg-weights">
                <AccordionTrigger className="text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    ESG Section Weight
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2 space-y-3">
                    <p className="text-xs text-stone-500">
                      Set how Environment, Social, and Governance contribute to ESG (total 100%).
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Environment</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={questionnaireForm.esg_section_weights?.environment ?? 33.33}
                          data-testid="esg-category-environment-weight-input"
                          onChange={(e) => setQuestionnaireForm({
                            ...questionnaireForm,
                            esg_section_weights: {
                              ...questionnaireForm.esg_section_weights,
                              environment: parseFloat(e.target.value) || 0,
                            },
                          })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Social</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={questionnaireForm.esg_section_weights?.social ?? 33.33}
                          data-testid="esg-category-social-weight-input"
                          onChange={(e) => setQuestionnaireForm({
                            ...questionnaireForm,
                            esg_section_weights: {
                              ...questionnaireForm.esg_section_weights,
                              social: parseFloat(e.target.value) || 0,
                            },
                          })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Governance</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={questionnaireForm.esg_section_weights?.governance ?? 33.34}
                          data-testid="esg-category-governance-weight-input"
                          onChange={(e) => setQuestionnaireForm({
                            ...questionnaireForm,
                            esg_section_weights: {
                              ...questionnaireForm.esg_section_weights,
                              governance: parseFloat(e.target.value) || 0,
                            },
                          })}
                        />
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
              
            </Accordion>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateQuestionnaire} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Questionnaire Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Questionnaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={questionnaireForm.name}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={questionnaireForm.due_date}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, due_date: e.target.value })}
                data-testid="edit-questionnaire-due-date-input"
              />
            </div>
            
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="esg-weights">
                <AccordionTrigger className="text-sm font-medium">
                  ESG Section Weight
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div>
                      <Label className="text-xs">Environment</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={questionnaireForm.esg_section_weights?.environment ?? 33.33}
                        onChange={(e) => setQuestionnaireForm({
                          ...questionnaireForm,
                          esg_section_weights: {
                            ...questionnaireForm.esg_section_weights,
                            environment: parseFloat(e.target.value) || 0,
                          },
                        })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Social</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={questionnaireForm.esg_section_weights?.social ?? 33.33}
                        onChange={(e) => setQuestionnaireForm({
                          ...questionnaireForm,
                          esg_section_weights: {
                            ...questionnaireForm.esg_section_weights,
                            social: parseFloat(e.target.value) || 0,
                          },
                        })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Governance</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={questionnaireForm.esg_section_weights?.governance ?? 33.34}
                        onChange={(e) => setQuestionnaireForm({
                          ...questionnaireForm,
                          esg_section_weights: {
                            ...questionnaireForm.esg_section_weights,
                            governance: parseFloat(e.target.value) || 0,
                          },
                        })}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="overall-weights">
                <AccordionTrigger className="text-sm font-medium">
                  Overall Component Weight
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div>
                      <Label className="text-xs">ESG Score</Label>
                      <Input
                        type="number"
                        value={questionnaireForm.overall_supplier_weights?.esg ?? 40}
                        onChange={(e) => setQuestionnaireForm({
                          ...questionnaireForm,
                          overall_supplier_weights: {
                            ...questionnaireForm.overall_supplier_weights,
                            esg: parseFloat(e.target.value) || 0,
                          },
                        })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">GHG Intensity</Label>
                      <Input
                        type="number"
                        value={questionnaireForm.overall_supplier_weights?.ghg ?? 40}
                        onChange={(e) => setQuestionnaireForm({
                          ...questionnaireForm,
                          overall_supplier_weights: {
                            ...questionnaireForm.overall_supplier_weights,
                            ghg: parseFloat(e.target.value) || 0,
                          },
                        })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Revenue</Label>
                      <Input
                        type="number"
                        value={questionnaireForm.overall_supplier_weights?.revenue ?? 20}
                        onChange={(e) => setQuestionnaireForm({
                          ...questionnaireForm,
                          overall_supplier_weights: {
                            ...questionnaireForm.overall_supplier_weights,
                            revenue: parseFloat(e.target.value) || 0,
                          },
                        })}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateQuestionnaire} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question Dialog */}
      <Dialog open={showQuestionDialog && questionDialogMode === 'edit'} onOpenChange={handleQuestionDialogOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit Question' : 'Add Question'}</DialogTitle>
            <DialogDescription>
              Configure the question, response type, and scoring behavior
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto">
            {/* Basic Question Info */}
            <div className="space-y-2">
              <Label>Question Text *</Label>
              <Textarea
                value={questionForm.question_text}
                onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })}
                placeholder="Enter your question"
                rows={2}
                data-testid="question-text"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={questionForm.description}
                onChange={(e) => setQuestionForm({ ...questionForm, description: e.target.value })}
                placeholder="Additional context or instructions"
                rows={2}
              />
            </div>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Response Type</Label>
                <Select
                  value={questionForm.response_type}
                  onValueChange={handleResponseTypeChange}
                >
                  <SelectTrigger data-testid="response-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {responseTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select
                  value={questionForm.category}
                  onValueChange={(v) => setQuestionForm({ ...questionForm, category: v })}
                >
                  <SelectTrigger data-testid="question-section-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-testid="question-section-options">
                    {sections.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={questionForm.question_category} onValueChange={(question_category) => setQuestionForm({ ...questionForm, question_category })}>
                  <SelectTrigger data-testid="question-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent data-testid="question-category-options">
                    {questionCategories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">Question Importance<Tooltip><TooltipTrigger asChild><button type="button" className="inline-flex text-sky-700 transition-colors hover:text-sky-900" aria-label="View question importance score share" data-testid="question-importance-share-info"><Info className="h-4 w-4" aria-hidden="true" /></button></TooltipTrigger><TooltipContent className="max-w-xs" data-testid="question-importance-share-tooltip"><p>Score share is calculated within each ESG section. Low = 1, Medium = 2, High = 3. With one of each, shares are 16.67%, 33.33%, and 50% respectively. Shares adjust based on all answered questions.</p></TooltipContent></Tooltip></Label>
                <Select
                  value={questionForm.importance}
                  onValueChange={(importance) => setQuestionForm({ ...questionForm, importance })}
                >
                  <SelectTrigger data-testid="question-importance-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Required</Label>
                <Select
                  value={questionForm.required ? 'yes' : 'no'}
                  onValueChange={(v) => setQuestionForm({ ...questionForm, required: v === 'yes' })}
                >
                  <SelectTrigger data-testid="question-required-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Evidence</Label>
                <Select value={questionForm.evidence_requirement} onValueChange={(evidence_requirement) => setQuestionForm({ ...questionForm, evidence_requirement })}>
                  <SelectTrigger data-testid="question-evidence-requirement-select"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="not_required">Not required</SelectItem><SelectItem value="optional">Optional</SelectItem><SelectItem value="required">Required for submission</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            
            {/* Dropdown Options */}
            {questionForm.response_type === 'dropdown' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Options</Label>
                  <Button variant="outline" size="sm" onClick={addOption} data-testid="add-dropdown-option-button">
                    <Plus className="h-3 w-3 mr-1" />
                    Add Option
                  </Button>
                </div>
                <div className="space-y-2">
                  {questionForm.options.map((opt, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Value"
                        value={opt.value}
                        onChange={(e) => updateOption(index, 'value', e.target.value)}
                        className="w-1/3"
                        data-testid={`dropdown-option-value-${index}`}
                      />
                      <Input
                        placeholder="Label"
                        value={opt.label}
                        onChange={(e) => updateOption(index, 'label', e.target.value)}
                        className="w-1/3"
                        data-testid={`dropdown-option-label-${index}`}
                      />
                      <Input
                        type="number"
                        placeholder="Score"
                        min="0"
                        max="100"
                        value={opt.score ?? ''}
                        onChange={(e) => updateOption(index, 'score', parseNumericInput(e.target.value))}
                        className="w-1/4"
                        data-testid={`dropdown-option-score-${index}`}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => removeOption(index)}
                        data-testid={`remove-dropdown-option-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Scoring Configuration */}
            <div className="border rounded-lg p-4 bg-stone-50/50 space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-stone-600" />
                <Label className="text-base font-medium">Scoring Method</Label>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">How should this answer become a 0–100 score?</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {compatibleScoringRules(questionForm.response_type).map((rule) => {
                    const Icon = rule.icon;
                    const isSelected = questionForm.scoring?.rule === rule.value;
                    return (
                      <button
                        key={rule.value}
                        type="button"
                        onClick={() => {
                          const newScoring = { ...questionForm.scoring, rule: rule.value };
                          // Reset rule-specific fields
                          if (rule.value === 'boolean') {
                            newScoring.true_score = 100;
                            newScoring.false_score = 0;
                          } else if (rule.value === 'higher_is_better') {
                            newScoring.target = 100;
                            newScoring.min = 0;
                            newScoring.max = 100;
                            newScoring.max_score = 100;
                          } else if (rule.value === 'lower_is_better') {
                            newScoring.max_acceptable = 100;
                            newScoring.min = 0;
                            newScoring.max_score = 100;
                          } else if (rule.value === 'choice_mapping') {
                            newScoring.choices = {};
                          }
                          setQuestionForm({ ...questionForm, scoring: newScoring });
                        }}
                        className={`flex flex-col items-start p-3 rounded-lg border transition-all text-left ${
                          isSelected 
                            ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' 
                            : 'border-stone-200 hover:border-stone-300 hover:bg-white'
                        }`}
                        data-testid={`question-scoring-method-${rule.value}`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${isSelected ? 'text-emerald-600' : rule.color}`} />
                          <span className={`text-sm font-medium ${isSelected ? 'text-emerald-900' : 'text-stone-700'}`}>
                            {rule.label}
                          </span>
                        </div>
                        <span className="text-xs text-stone-500 mt-1">{rule.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Rule-specific configuration fields */}
              {questionForm.scoring?.rule === 'higher_is_better' && (
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Lowest value (0 score)</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.min ?? 0}
                      onChange={(e) => updateScoringConfig('min', parseNumericInput(e.target.value))}
                      placeholder="0"
                      data-testid="higher-is-better-min-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Target value (full score)</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.target ?? 100}
                      onChange={(e) => updateScoringConfig('target', parseNumericInput(e.target.value))}
                      placeholder="100"
                      data-testid="higher-is-better-target-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Score cap</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={questionForm.scoring.max_score ?? 100}
                      onChange={(e) => updateScoringConfig('max_score', parseNumericInput(e.target.value))}
                      placeholder="100"
                      data-testid="higher-is-better-score-cap-input"
                    />
                  </div>
                </div>
              )}
              
              {questionForm.scoring?.rule === 'lower_is_better' && (
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Best value (full score)</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.min ?? 0}
                      onChange={(e) => updateScoringConfig('min', parseNumericInput(e.target.value))}
                      placeholder="0"
                      data-testid="lower-is-better-best-value-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Zero-score threshold</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.max_acceptable ?? 100}
                      onChange={(e) => updateScoringConfig('max_acceptable', parseNumericInput(e.target.value))}
                      placeholder="100"
                      data-testid="lower-is-better-zero-score-threshold-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Score cap</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={questionForm.scoring.max_score ?? 100}
                      onChange={(e) => updateScoringConfig('max_score', parseNumericInput(e.target.value))}
                      placeholder="100"
                      data-testid="lower-is-better-score-cap-input"
                    />
                  </div>
                </div>
              )}
              
              {questionForm.scoring?.rule === 'boolean' && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Yes/True Score</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={questionForm.scoring.true_score ?? 100}
                      onChange={(e) => updateScoringConfig('true_score', parseNumericInput(e.target.value))}
                      placeholder="100"
                      data-testid="boolean-true-score-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">No/False Score</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={questionForm.scoring.false_score ?? 0}
                      onChange={(e) => updateScoringConfig('false_score', parseNumericInput(e.target.value))}
                      placeholder="0"
                      data-testid="boolean-false-score-input"
                    />
                  </div>
                </div>
              )}
              
              {questionForm.scoring?.rule === 'choice_mapping' && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <Info className="h-3 w-3 text-stone-400" />
                    <span className="text-xs text-stone-500">
                      Set one 0–100 score for each dropdown option above.
                    </span>
                  </div>
                </div>
              )}
              
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              handleQuestionDialogOpenChange(false);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateQuestion}
              disabled={submitting}
              data-testid="save-question-btn"
            >
              {submitting ? 'Saving...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QuestionLedgerDialog open={showQuestionDialog && questionDialogMode === 'create'} onOpenChange={handleQuestionDialogOpenChange} onSave={handleAddLedgerQuestions} saving={submitting} />
      <SupplierQuestionnairePreviewDialog open={showQuestionPreview} onOpenChange={setShowQuestionPreview} questionnaire={selectedQuestionnaire} questions={questions} />
    </div></TooltipProvider>
  );
}
