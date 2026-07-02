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
  ChevronDown, 
  ChevronRight, 
  Save, 
  Loader2, 
  CheckCircle2,
  Circle,
  FileText,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentReportingYear } from '../utils/reportingYearUtils';

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
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [disclosures, setDisclosures] = useState([]);
  const [responses, setResponses] = useState({});
  const [openDisclosures, setOpenDisclosures] = useState({});
  const [reportingPeriod] = useState(() => getCurrentReportingYear('financial_year'));

  // Fetch GRI disclosures for this section
  const fetchDisclosures = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${API}/api/esg-questionnaire/gri/${section}`,
        { 
          headers: getAuthHeader(),
          params: { reporting_period: reportingPeriod }
        }
      );
      
      // Group questions by disclosure
      const grouped = groupByDisclosure(res.data.questions || []);
      setDisclosures(grouped);
      
      // Set responses (including sub-question responses)
      const initialResponses = {};
      (res.data.questions || []).forEach(q => {
        if (q.sub_questions && q.sub_questions.length > 0) {
          // Question has sub-parts
          q.sub_questions.forEach(sub => {
            if (sub.response_value !== undefined && sub.response_value !== null) {
              initialResponses[sub.response_key] = sub.response_value;
            }
          });
        } else {
          // Simple question
          if (q.response_value !== undefined && q.response_value !== null) {
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

  // Save single response
  const saveResponse = async (responseKey) => {
    setSaving(prev => ({ ...prev, [responseKey]: true }));
    try {
      await axios.post(
        `${API}/api/esg-questionnaire/response`,
        {
          question_key: responseKey,
          value: responses[responseKey] || '',
          reporting_period: reportingPeriod
        },
        { headers: getAuthHeader() }
      );
      toast.success('Response saved');
    } catch (error) {
      console.error('Failed to save response:', error);
      toast.error('Failed to save response');
    } finally {
      setSaving(prev => ({ ...prev, [responseKey]: false }));
    }
  };

  // Save all responses for a disclosure
  const saveDisclosure = async (disclosure) => {
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
                  reporting_period: reportingPeriod
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
                reporting_period: reportingPeriod
              },
              { headers: getAuthHeader() }
            )
          );
        }
      });
      await Promise.all(savePromises);
      toast.success(`Saved ${disclosure.disclosure_id} responses`);
    } catch (error) {
      console.error('Failed to save disclosure:', error);
      toast.error('Failed to save responses');
    } finally {
      setSaving(prev => ({ ...prev, [disclosure.disclosure_id]: false }));
    }
  };

  // Calculate completion status for a disclosure
  const getDisclosureCompletion = (disclosure) => {
    let total = 0;
    let completed = 0;
    
    disclosure.questions.forEach(q => {
      if (q.sub_questions && q.sub_questions.length > 0) {
        total += q.sub_questions.length;
        completed += q.sub_questions.filter(sub => 
          responses[sub.response_key] && responses[sub.response_key].trim() !== ''
        ).length;
      } else {
        total += 1;
        if (responses[q.question_key] && responses[q.question_key].trim() !== '') {
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
        {/* Question Label */}
        <Label className="text-sm font-medium text-text-primary flex items-start gap-2">
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-mono shrink-0">
            Q{qIndex + 1}
          </span>
          <span className="leading-relaxed">{question.description}</span>
          {question.is_required && (
            <span className="text-red-500 shrink-0">*</span>
          )}
        </Label>
        
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
                      <span className="text-xs text-text-muted">
                        {(responses[sub.response_key] || '').length} / {question.validation_rules?.max_length || 10000} characters
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => saveResponse(sub.response_key)}
                        disabled={saving[sub.response_key]}
                        className="h-7 text-xs"
                      >
                        {saving[sub.response_key] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <><Save className="w-3 h-3 mr-1" /> Save</>
                        )}
                      </Button>
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
                <span className="text-xs text-text-muted">
                  {(responses[question.question_key] || '').length} / {question.validation_rules?.max_length || 10000} characters
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveResponse(question.question_key)}
                  disabled={saving[question.question_key]}
                >
                  {saving[question.question_key] ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <><Save className="w-3 h-3 mr-1" /> Save</>
                  )}
                </Button>
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

  if (loading) {
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
      {/* Header Info */}
      <Card className="p-4 bg-blue-50/50 border-blue-100">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-blue-800">
              <strong>GRI Standards:</strong> Complete the disclosures below based on your organization&apos;s material topics.
              Click on each disclosure to expand and fill in the required information.
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Reporting Period: {reportingPeriod}
            </p>
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
                  {disclosure.questions.map((question, qIndex) => renderQuestion(question, qIndex))}

                  {/* Save All Button */}
                  {isEditing && (
                    <div className="pt-4 border-t border-stone-200 flex justify-end">
                      <Button
                        onClick={() => saveDisclosure(disclosure)}
                        disabled={saving[disclosure.disclosure_id]}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {saving[disclosure.disclosure_id] ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="w-4 h-4 mr-2" /> Save All Responses</>
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
    </div>
  );
}
