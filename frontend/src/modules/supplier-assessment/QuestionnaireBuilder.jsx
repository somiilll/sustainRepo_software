import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
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
  Target,
  Pencil,
  Info,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const responseTypes = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'text', label: 'Text' },
  { value: 'dropdown', label: 'Dropdown' },
];

const categories = [
  { value: 'environment', label: 'Environment' },
  { value: 'social', label: 'Social' },
  { value: 'governance', label: 'Governance' },
];

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
  { 
    value: 'target_based', 
    label: 'Target Based',
    description: 'Score based on percentage of target achieved',
    icon: Target,
    color: 'text-rose-600',
    fields: ['target'],
  },
  { 
    value: 'manual', 
    label: 'Manual Review',
    description: 'Requires human review to assign score',
    icon: Pencil,
    color: 'text-stone-600',
    fields: [],
  },
];

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
    case 'text':
    default:
      return { rule: 'manual', requires_manual_review: true };
  }
};

export default function QuestionnaireBuilder() {
  const { getAuthHeader } = useAuth();
  const [questionnaires, setQuestionnaires] = useState([]);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  
  // Form states
  const [questionnaireForm, setQuestionnaireForm] = useState({
    name: '',
    description: '',
    due_date: '',
    esg_section_weights: { environment: 33.33, social: 33.33, governance: 33.34 },
    overall_supplier_weights: { esg: 40, ghg: 40, revenue: 20 },
  });
  
  const [questionForm, setQuestionForm] = useState({
    question_text: '',
    description: '',
    response_type: 'yes_no',
    options: [],
    required: true,
    weight: 1,
    category: 'environment',
    order: 0,
    scoring: { rule: 'boolean', true_score: 100, false_score: 0 },
  });
  
  const [submitting, setSubmitting] = useState(false);

  const fetchQuestionnaires = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/questionnaires`, {
        headers: getAuthHeader(),
      });
      setQuestionnaires(res.data || []);
    } catch (err) {
      toast.error('Failed to load questionnaires');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

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

  useEffect(() => {
    fetchQuestionnaires();
  }, [fetchQuestionnaires]);

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
    
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/supplier-assessment/questionnaires`, questionnaireForm, {
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
      });
      fetchQuestionnaires();
      setSelectedQuestionnaire(res.data);
    } catch (err) {
      toast.error('Failed to create questionnaire');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateQuestionnaire = async () => {
    if (!selectedQuestionnaire) return;
    
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
      toast.error('Failed to update questionnaire');
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

  const handleAddQuestion = async () => {
    if (!questionForm.question_text || !selectedQuestionnaire) {
      toast.error('Please enter question text');
      return;
    }
    
    setSubmitting(true);
    try {
      const payload = {
        ...questionForm,
        order: questions.length,
      };
      
      await axios.post(
        `${API}/supplier-assessment/questionnaires/${selectedQuestionnaire.id}/questions`,
        payload,
        { headers: getAuthHeader() }
      );
      toast.success('Question added');
      setShowQuestionDialog(false);
      resetQuestionForm();
      fetchQuestions(selectedQuestionnaire.id);
    } catch (err) {
      toast.error('Failed to add question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion) return;
    
    setSubmitting(true);
    try {
      await axios.put(
        `${API}/supplier-assessment/questions/${editingQuestion.id}`,
        questionForm,
        { headers: getAuthHeader() }
      );
      toast.success('Question updated');
      setShowQuestionDialog(false);
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

  const resetQuestionForm = () => {
    setQuestionForm({
      question_text: '',
      description: '',
      response_type: 'yes_no',
      options: [],
      required: true,
      weight: 1,
      category: 'environment',
      order: 0,
      scoring: { rule: 'boolean', true_score: 100, false_score: 0 },
    });
  };

  const openEditQuestion = (question) => {
    setEditingQuestion(question);
    setQuestionForm({
      question_text: question.question_text,
      description: question.description || '',
      response_type: question.response_type,
      options: question.options || [],
      required: question.required,
      weight: question.weight,
      category: question.category,
      order: question.order,
      scoring: question.scoring || getDefaultScoringConfig(question.response_type),
    });
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

  return (
    <div className="space-y-6" data-testid="questionnaire-builder">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">ESG Questionnaires</h1>
          <p className="text-sm text-stone-500 mt-1">Build and manage supplier assessment questionnaires</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-questionnaire-btn">
          <Plus className="h-4 w-4 mr-2" />
          New Questionnaire
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Questionnaire List */}
        <div className="col-span-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Questionnaires</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 text-center text-stone-500">Loading...</div>
              ) : questionnaires.length === 0 ? (
                <div className="p-4 text-center text-stone-500">
                  No questionnaires yet. Create your first one.
                </div>
              ) : (
                <div className="divide-y">
                  {questionnaires.map((q) => (
                    <div
                      key={q.id}
                      className={`p-4 cursor-pointer hover:bg-stone-50 transition-colors ${
                        selectedQuestionnaire?.id === q.id ? 'bg-emerald-50 border-l-2 border-emerald-500' : ''
                      }`}
                      onClick={() => setSelectedQuestionnaire(q)}
                      data-testid={`questionnaire-${q.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium text-stone-900">{q.name}</h3>
                          <p className="text-sm text-stone-500 mt-1">
                            {q.question_count} questions
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditQuestionnaire(q);
                              setSelectedQuestionnaire(q);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateQuestionnaire(q.id, q.name);
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteQuestionnaire(q.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Question Builder */}
        <div className="col-span-8">
          {selectedQuestionnaire ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{selectedQuestionnaire.name}</CardTitle>
                  <p className="text-sm text-stone-500 mt-1">
                    {selectedQuestionnaire.description || 'No description'}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    resetQuestionForm();
                    setEditingQuestion(null);
                    setShowQuestionDialog(true);
                  }}
                  data-testid="add-question-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </CardHeader>
              <CardContent>
                {questions.length === 0 ? (
                  <div className="text-center py-12 text-stone-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-stone-300" />
                    <p>No questions yet. Add your first question.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questions.map((q, index) => {
                      const scoringRule = scoringRules.find(r => r.value === q.scoring?.rule);
                      return (
                        <div
                          key={q.id}
                          className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                          data-testid={`question-${q.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-stone-400 cursor-grab">
                              <GripVertical className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="text-sm text-stone-400 mr-2">Q{index + 1}.</span>
                                  <span className="font-medium">{q.question_text}</span>
                                  {q.required && <span className="text-red-500 ml-1">*</span>}
                                </div>
                                <div className="flex items-center gap-1 flex-wrap justify-end">
                                  <Badge variant="outline" className="text-xs">
                                    {categories.find(c => c.value === q.category)?.label || q.category}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {responseTypes.find(r => r.value === q.response_type)?.label || q.response_type}
                                  </Badge>
                                  {scoringRule && (
                                    <Badge variant="secondary" className="text-xs">
                                      {scoringRule.label}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {q.description && (
                                <p className="text-sm text-stone-500 mt-1">{q.description}</p>
                              )}
                              {q.options && q.options.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {q.options.map((opt, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {opt.label || opt.value}
                                      {opt.score != null && <span className="ml-1 text-stone-400">({opt.score})</span>}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditQuestion(q)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => handleDeleteQuestion(q.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-stone-500">
                <FileText className="h-12 w-12 mx-auto mb-4 text-stone-300" />
                <p>Select a questionnaire to view and edit questions</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create Questionnaire Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Questionnaire</DialogTitle>
            <DialogDescription>
              Configure questionnaire settings and scoring weights
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
              <Label>Description</Label>
              <Textarea
                value={questionnaireForm.description}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, description: e.target.value })}
                placeholder="Enter description"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={questionnaireForm.due_date}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, due_date: e.target.value })}
              />
            </div>
            
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="esg-weights">
                <AccordionTrigger className="text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    ESG Section Weights
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2 space-y-3">
                    <p className="text-xs text-stone-500">
                      Configure how much each ESG section contributes to the overall ESG score (must total 100%)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Environment</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={questionnaireForm.esg_section_weights?.environment || 33.33}
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
                          value={questionnaireForm.esg_section_weights?.social || 33.33}
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
                          value={questionnaireForm.esg_section_weights?.governance || 33.34}
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
              
              <AccordionItem value="overall-weights">
                <AccordionTrigger className="text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Overall Supplier Score Weights
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2 space-y-3">
                    <p className="text-xs text-stone-500">
                      Configure how ESG, GHG emissions, and revenue contribution impact the final supplier score (must total 100%)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">ESG Score</Label>
                        <Input
                          type="number"
                          value={questionnaireForm.overall_supplier_weights?.esg || 40}
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
                        <Label className="text-xs">GHG Score</Label>
                        <Input
                          type="number"
                          value={questionnaireForm.overall_supplier_weights?.ghg || 40}
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
                          value={questionnaireForm.overall_supplier_weights?.revenue || 20}
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
              <Label>Description</Label>
              <Textarea
                value={questionnaireForm.description}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={questionnaireForm.due_date}
                onChange={(e) => setQuestionnaireForm({ ...questionnaireForm, due_date: e.target.value })}
              />
            </div>
            
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="esg-weights">
                <AccordionTrigger className="text-sm font-medium">
                  ESG Section Weights
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div>
                      <Label className="text-xs">Environment</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={questionnaireForm.esg_section_weights?.environment || 33.33}
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
                        value={questionnaireForm.esg_section_weights?.social || 33.33}
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
                        value={questionnaireForm.esg_section_weights?.governance || 33.34}
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
                  Overall Supplier Score Weights
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div>
                      <Label className="text-xs">ESG Score</Label>
                      <Input
                        type="number"
                        value={questionnaireForm.overall_supplier_weights?.esg || 40}
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
                      <Label className="text-xs">GHG Score</Label>
                      <Input
                        type="number"
                        value={questionnaireForm.overall_supplier_weights?.ghg || 40}
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
                        value={questionnaireForm.overall_supplier_weights?.revenue || 20}
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
      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
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
            
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Category</Label>
                <Select
                  value={questionForm.category}
                  onValueChange={(v) => setQuestionForm({ ...questionForm, category: v })}
                >
                  <SelectTrigger data-testid="question-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weight</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={questionForm.weight}
                  onChange={(e) => setQuestionForm({ ...questionForm, weight: parseFloat(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Required</Label>
                <Select
                  value={questionForm.required ? 'yes' : 'no'}
                  onValueChange={(v) => setQuestionForm({ ...questionForm, required: v === 'yes' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Dropdown Options */}
            {questionForm.response_type === 'dropdown' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Options</Label>
                  <Button variant="outline" size="sm" onClick={addOption}>
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
                      />
                      <Input
                        placeholder="Label"
                        value={opt.label}
                        onChange={(e) => updateOption(index, 'label', e.target.value)}
                        className="w-1/3"
                      />
                      <Input
                        type="number"
                        placeholder="Score"
                        value={opt.score || ''}
                        onChange={(e) => updateOption(index, 'score', e.target.value ? parseFloat(e.target.value) : null)}
                        className="w-1/4"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => removeOption(index)}
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
                <Label className="text-base font-medium">Scoring Configuration</Label>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">Scoring Rule</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {scoringRules.map((rule) => {
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
                          } else if (rule.value === 'lower_is_better') {
                            newScoring.max_acceptable = 100;
                            newScoring.min = 0;
                          } else if (rule.value === 'target_based') {
                            newScoring.target = 100;
                          } else if (rule.value === 'choice_mapping') {
                            // Build choices from options if available
                            const choices = {};
                            questionForm.options?.forEach(opt => {
                              if (opt.value) {
                                choices[opt.value] = opt.score || 0;
                              }
                            });
                            newScoring.choices = choices;
                          }
                          setQuestionForm({ ...questionForm, scoring: newScoring });
                        }}
                        className={`flex flex-col items-start p-3 rounded-lg border transition-all text-left ${
                          isSelected 
                            ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' 
                            : 'border-stone-200 hover:border-stone-300 hover:bg-white'
                        }`}
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
                    <Label className="text-xs">Min Value</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.min ?? 0}
                      onChange={(e) => updateScoringConfig('min', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Target (100% score)</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.target ?? 100}
                      onChange={(e) => updateScoringConfig('target', parseFloat(e.target.value) || 100)}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Score</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.max_score ?? 100}
                      onChange={(e) => updateScoringConfig('max_score', parseFloat(e.target.value) || 100)}
                      placeholder="100"
                    />
                  </div>
                </div>
              )}
              
              {questionForm.scoring?.rule === 'lower_is_better' && (
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Best Value (100% score)</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.min ?? 0}
                      onChange={(e) => updateScoringConfig('min', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Acceptable (0% score)</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.max_acceptable ?? 100}
                      onChange={(e) => updateScoringConfig('max_acceptable', parseFloat(e.target.value) || 100)}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Score</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.max_score ?? 100}
                      onChange={(e) => updateScoringConfig('max_score', parseFloat(e.target.value) || 100)}
                      placeholder="100"
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
                      value={questionForm.scoring.true_score ?? 100}
                      onChange={(e) => updateScoringConfig('true_score', parseFloat(e.target.value) || 100)}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">No/False Score</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.false_score ?? 0}
                      onChange={(e) => updateScoringConfig('false_score', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
              
              {questionForm.scoring?.rule === 'target_based' && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Target Value</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.target ?? 100}
                      onChange={(e) => updateScoringConfig('target', parseFloat(e.target.value) || 100)}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Score</Label>
                    <Input
                      type="number"
                      value={questionForm.scoring.max_score ?? 100}
                      onChange={(e) => updateScoringConfig('max_score', parseFloat(e.target.value) || 100)}
                      placeholder="100"
                    />
                  </div>
                </div>
              )}
              
              {questionForm.scoring?.rule === 'choice_mapping' && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <Info className="h-3 w-3 text-stone-400" />
                    <span className="text-xs text-stone-500">
                      Set scores in the Options section above, or configure them below
                    </span>
                  </div>
                  {questionForm.options?.length > 0 && (
                    <div className="space-y-2">
                      {questionForm.options.map((opt, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-sm text-stone-600 w-1/2 truncate">
                            {opt.label || opt.value || `Option ${index + 1}`}
                          </span>
                          <Input
                            type="number"
                            placeholder="Score"
                            value={questionForm.scoring.choices?.[opt.value] ?? opt.score ?? ''}
                            onChange={(e) => {
                              const newChoices = { ...questionForm.scoring.choices };
                              newChoices[opt.value] = parseFloat(e.target.value) || 0;
                              updateScoringConfig('choices', newChoices);
                            }}
                            className="w-1/2"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {questionForm.scoring?.rule === 'manual' && (
                <div className="flex items-center gap-2 pt-2 text-sm text-stone-500">
                  <Info className="h-4 w-4" />
                  <span>This question requires manual review to assign a score</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowQuestionDialog(false);
              setEditingQuestion(null);
              resetQuestionForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={editingQuestion ? handleUpdateQuestion : handleAddQuestion}
              disabled={submitting}
              data-testid="save-question-btn"
            >
              {submitting ? 'Saving...' : (editingQuestion ? 'Update' : 'Add Question')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
