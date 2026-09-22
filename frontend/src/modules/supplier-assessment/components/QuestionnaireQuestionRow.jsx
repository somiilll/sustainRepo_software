import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';

export const QuestionnaireQuestionRow = ({ question, index, sectionLabel, questionCategoryLabel, typeLabel, scoringLabel, importanceClass, onEdit, onDelete, onDrop }) => {
  const beginDrag = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', question.id);
  };
  const isSubquestion = Boolean(question.parent_question_id);
  return <div onDragOver={(event) => !isSubquestion && event.preventDefault()} onDrop={(event) => !isSubquestion && onDrop(event.dataTransfer.getData('text/plain'), question.id)} className={`grid gap-3 border-b border-stone-100/80 py-4 last:border-0 md:grid-cols-[2rem_minmax(11rem,1fr)_6rem_6rem_6rem_7.5rem_6.5rem_7.5rem] md:items-center ${isSubquestion ? 'ml-5 border-l-2 border-emerald-100 pl-3' : ''}`} data-testid={`question-${question.id}`}>
    {isSubquestion ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700" data-testid={`subquestion-indicator-${question.id}`}>↳</span> : <span draggable onDragStart={beginDrag} className="flex h-7 w-7 cursor-grab items-center justify-center text-sm font-medium text-stone-500 active:cursor-grabbing" data-testid={`question-reorder-handle-${question.id}`}>{index + 1}<span className="sr-only">Drag question {index + 1}</span></span>}
    <div className="min-w-0"><p className="text-sm font-semibold text-stone-950">{question.question_text}{question.required && <span className="ml-1 text-rose-500">*</span>}{isSubquestion && <span className="ml-2 text-xs font-medium text-emerald-700" data-testid={`subquestion-label-${question.id}`}>Subquestion</span>}</p>{question.description && <p className="mt-1 truncate text-xs text-stone-500">{question.description}</p>}</div>
    <Badge variant="outline" className="w-fit border-stone-200 bg-stone-100 text-xs font-normal text-stone-700" data-testid={`question-section-${question.id}`}>{sectionLabel}</Badge>
    <Badge variant="outline" className="w-fit border-stone-200 bg-stone-100 text-xs font-normal capitalize text-stone-700" data-testid={`question-category-${question.id}`}>{questionCategoryLabel}</Badge>
    <div className="truncate text-xs text-stone-500" title={typeLabel}>{typeLabel}</div><div className="truncate text-xs text-stone-500" title={scoringLabel}>{scoringLabel}</div><Badge variant="outline" className={`w-fit text-xs font-medium capitalize ${importanceClass}`}>{question.importance || 'medium'}</Badge>
    <div className="flex min-w-0 items-center justify-end gap-1"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" aria-label={`Edit question ${index + 1}`} onClick={onEdit} data-testid={`edit-question-${question.id}`}><Edit2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit question</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" aria-label={`Delete question ${index + 1}`} onClick={onDelete} data-testid={`delete-question-${question.id}`}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete question</TooltipContent></Tooltip></div>
  </div>;
};