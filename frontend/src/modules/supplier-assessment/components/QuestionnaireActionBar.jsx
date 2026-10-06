import React from 'react';
import { ClipboardCheck, Edit2, Plus, ToggleLeft, ToggleRight, UsersRound } from 'lucide-react';
import { Button } from '../../../components/ui/button';

export const QuestionnaireActionBar = ({
  questionnaire,
  onEdit,
  onToggleActive,
  onReviewResponses,
  onManageSuppliers,
  onAddQuestion,
}) => {
  const locked = questionnaire.has_locked_submissions;
  return <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white p-4" data-testid="questionnaire-action-bar">
    <Button variant="outline" className="border-emerald-700 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900" onClick={onEdit} disabled={locked} data-testid="edit-selected-questionnaire">
      <Edit2 className="h-4 w-4" />Edit questionnaire
    </Button>
    <Button variant="outline" className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-950" onClick={onToggleActive} data-testid="toggle-selected-questionnaire-active" aria-label={`${questionnaire.is_active ? 'Deactivate' : 'Activate'} ${questionnaire.name}`}>
      {questionnaire.is_active ? <ToggleRight className="h-4 w-4 text-emerald-700" /> : <ToggleLeft className="h-4 w-4 text-stone-500" />}
      <span data-testid="selected-questionnaire-active-status">{questionnaire.is_active ? 'Active' : 'Inactive'}</span>
    </Button>
    <Button variant="outline" className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-950" onClick={onReviewResponses} data-testid="review-questionnaire-submissions-button">
      <ClipboardCheck className="h-4 w-4" />Review responses
    </Button>
    <Button variant="outline" className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-950" onClick={onManageSuppliers} data-testid="manage-questionnaire-assignments-button">
      <UsersRound className="h-4 w-4" />Manage supplier
    </Button>
    <Button className="bg-emerald-800 text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-emerald-900 hover:shadow-md xl:ml-auto" onClick={onAddQuestion} disabled={locked} data-testid="add-question-btn">
      <Plus className="h-4 w-4" />Add question
    </Button>
  </div>;
};