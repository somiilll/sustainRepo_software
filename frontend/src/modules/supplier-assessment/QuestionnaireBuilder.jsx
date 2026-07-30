import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
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
} from '../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Copy,
  GripVertical,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const responseTypes = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'text', label: 'Text' },
  { value: 'dropdown', label: 'Dropdown' },
];

const categories = [
  { value: 'environment', label: 'Environment' },
  { value: 'social', label: 'Social' },
  { value: 'governance', label: 'Governance' },
];

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
    scoring_method: 'question',
    section_weights: { environment: 33.33, social: 33.33, governance: 33.34 },
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
        scoring_method: 'question',
        section_weights: { environment: 33.33, social: 33.33, governance: 33.34 },
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
    });
    setShowQuestionDialog(true);
  };

  const openEditQuestionnaire = (q) => {
    setQuestionnaireForm({
      name: q.name,
      description: q.description || '',
      due_date: q.due_date || '',
      scoring_method: q.scoring_method || 'question',
      section_weights: q.section_weights || { environment: 33.33, social: 33.33, governance: 33.34 },
    });
    setShowEditDialog(true);
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
                    {questions.map((q, index) => (
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
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs">
                                  {categories.find(c => c.value === q.category)?.label || q.category}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {responseTypes.find(r => r.value === q.response_type)?.label || q.response_type}
                                </Badge>
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
                    ))}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Questionnaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                rows={3}
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
            <div className="space-y-2">
              <Label>Scoring Method</Label>
              <Select
                value={questionnaireForm.scoring_method}
                onValueChange={(v) => setQuestionnaireForm({ ...questionnaireForm, scoring_method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">Question-level scoring</SelectItem>
                  <SelectItem value="section">Section-based scoring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {questionnaireForm.scoring_method === 'section' && (
              <div className="space-y-2">
                <Label>Section Weights (%)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Environment</Label>
                    <Input
                      type="number"
                      value={questionnaireForm.section_weights.environment}
                      onChange={(e) => setQuestionnaireForm({
                        ...questionnaireForm,
                        section_weights: {
                          ...questionnaireForm.section_weights,
                          environment: parseFloat(e.target.value) || 0,
                        },
                      })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Social</Label>
                    <Input
                      type="number"
                      value={questionnaireForm.section_weights.social}
                      onChange={(e) => setQuestionnaireForm({
                        ...questionnaireForm,
                        section_weights: {
                          ...questionnaireForm.section_weights,
                          social: parseFloat(e.target.value) || 0,
                        },
                      })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Governance</Label>
                    <Input
                      type="number"
                      value={questionnaireForm.section_weights.governance}
                      onChange={(e) => setQuestionnaireForm({
                        ...questionnaireForm,
                        section_weights: {
                          ...questionnaireForm.section_weights,
                          governance: parseFloat(e.target.value) || 0,
                        },
                      })}
                    />
                  </div>
                </div>
              </div>
            )}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Questionnaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                rows={3}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit Question' : 'Add Question'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
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
                  onValueChange={(v) => setQuestionForm({ ...questionForm, response_type: v })}
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
