import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group';
import { Badge } from '../../../components/ui/badge';

const evidencePreviewLabel = (question) => {
  if (question.evidence_requirement === 'evidence_scored') return { label: 'Scoring based on evidence', className: 'bg-amber-50 text-amber-800' };
  if (question.evidence_requirement === 'required' || question.assessment_type === 'type_a') return { label: 'Evidence required', className: 'bg-emerald-50 text-emerald-800' };
  if (question.evidence_requirement === 'optional') return { label: 'Evidence optional', className: 'bg-sky-50 text-sky-800' };
  return { label: 'Evidence not required', className: 'bg-stone-100 text-stone-700' };
};

export const SupplierQuestionnairePreviewDialog = ({ open, onOpenChange, questionnaire, questions }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto bg-white" data-testid="supplier-questionnaire-preview-dialog">
      <DialogHeader>
        <DialogTitle data-testid="supplier-questionnaire-preview-title">
          Supplier preview — {questionnaire?.name || 'Questionnaire'}
        </DialogTitle>
        {questionnaire?.reporting_period && <p className="text-sm text-stone-500" data-testid="supplier-questionnaire-preview-reporting-period">Reporting period: {questionnaire.reporting_period}</p>}
      </DialogHeader>
      <div className="space-y-5">
        {questions.length === 0 ? (
          <p className="text-sm text-stone-500" data-testid="supplier-questionnaire-preview-empty">Add questions to preview the supplier experience.</p>
        ) : questions.map((question, index) => {
          const questionId = question.id || index;
          const questionNumber = questions.slice(0, index + 1).filter((item) => !item.parent_question_id).length;
          return (
            <div key={questionId} className={`rounded-lg border border-stone-200 bg-white p-4 ${question.parent_question_id ? 'ml-4 border-l-4 border-l-emerald-200 bg-emerald-50/30 sm:ml-8' : ''}`} data-testid={`supplier-question-preview-question-${questionId}`}>
              <p className="text-sm font-semibold text-stone-900" data-testid={`supplier-question-preview-text-${questionId}`}>
                {question.parent_question_id ? <span className="mr-2 text-xs font-medium text-emerald-700" data-testid={`supplier-question-preview-subquestion-label-${questionId}`}>Follow-up</span> : `${questionNumber}. `}
                {question.question_text}{question.required && <span className="ml-1 text-rose-500">*</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2" data-testid={`supplier-question-preview-requirements-${questionId}`}><Badge className={`${evidencePreviewLabel(question).className} border-0 font-medium`} data-testid={`supplier-question-preview-evidence-requirement-${questionId}`}>{evidencePreviewLabel(question).label}</Badge></div>
              <div className="mt-3">
                {question.response_type === 'yes_no' ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" data-testid={`supplier-question-preview-yes-${questionId}`}>Yes</Button>
                    <Button variant="outline" size="sm" data-testid={`supplier-question-preview-no-${questionId}`}>No</Button>
                  </div>
                ) : question.response_type === 'dropdown' ? (
                  <RadioGroup data-testid={`supplier-question-preview-options-${questionId}`}>{(question.options || []).map((option, optionIndex) => <div key={option.value} className="flex items-center gap-2"><RadioGroupItem value={option.value} id={`preview-${questionId}-${optionIndex}`} data-testid={`supplier-question-preview-option-${questionId}-${optionIndex}`} /><Label htmlFor={`preview-${questionId}-${optionIndex}`}>{option.label || option.value}</Label></div>)}</RadioGroup>
                ) : question.response_type === 'text' ? (
                  <textarea className="min-h-20 w-full rounded-md border border-stone-300 p-3 text-sm" placeholder="Supplier response" data-testid={`supplier-question-preview-textarea-${questionId}`} />
                ) : (
                  <Input type="number" placeholder={question.response_type === 'percentage' ? '0%' : 'Enter a value'} data-testid={`supplier-question-preview-number-${questionId}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-supplier-questionnaire-preview">Close preview</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);