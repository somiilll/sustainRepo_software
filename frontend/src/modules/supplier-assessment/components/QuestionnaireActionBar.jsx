import React from 'react';
import { ClipboardCheck, ClipboardList, Edit2, Plus, UsersRound } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';

export const QuestionnaireActionBar = ({
  questionnaire,
  onEdit,
  onPreview,
  onReviewResponses,
  onManageSuppliers,
  onAddQuestion,
}) => {
  const locked = questionnaire.has_locked_submissions;
  const reviewable = questionnaire.has_reviewable_submissions;
  return <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white p-4" data-testid="questionnaire-action-bar">
    <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="border-emerald-700 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900" onClick={onEdit} disabled={locked} aria-label="Edit questionnaire" data-testid="edit-selected-questionnaire"><Edit2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{locked ? 'Unlock submitted responses before editing' : 'Edit questionnaire'}</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-950" onClick={onPreview} aria-label="Preview questionnaire" data-testid="preview-selected-questionnaire"><ClipboardList className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Preview questionnaire</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="outline" className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-950" onClick={onReviewResponses} disabled={!reviewable} data-testid="review-questionnaire-submissions-button">
      <ClipboardCheck className="h-4 w-4" />Review responses
    </Button></TooltipTrigger><TooltipContent>{reviewable ? 'Review locked supplier responses' : 'Review is available after a supplier submits and locks a response'}</TooltipContent></Tooltip>
    <Button variant="outline" className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-950" onClick={onManageSuppliers} data-testid="manage-questionnaire-assignments-button">
      <UsersRound className="h-4 w-4" />Manage Suppliers
    </Button>
    <Button className="bg-emerald-800 text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-emerald-900 hover:shadow-md xl:ml-auto" onClick={onAddQuestion} disabled={locked} data-testid="add-question-btn">
      <Plus className="h-4 w-4" />Add question
    </Button>
  </div>;
};