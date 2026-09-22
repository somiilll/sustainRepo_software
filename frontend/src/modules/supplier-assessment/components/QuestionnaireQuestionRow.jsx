import React from 'react';
import { Edit2, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';

export const QuestionnaireQuestionRow = ({ question, index, sectionLabel, questionCategoryLabel, typeLabel, scoringLabel, importanceClass, onEdit, onDelete, onAddSubquestion, onDrop }) => {
  const beginDrag = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', question.id);
  };
  const isSubquestion = Boolean(question.parent_question_id);
  return <div onDragOver={(event) => !isSubquestion && event.preventDefault()} onDrop={(event) => !isSubquestion && onDrop(event.dataTransfer.getData('text/plain'), question.id)} className={`grid gap-3 border-b border-stone-100/80 py-4 last:border-0 md:grid-cols-[2rem_minmax(11rem,1fr)_6rem_6rem_6rem_7.5rem_6.5rem_10rem] md:items-center ${isSubquestion ? 'ml-5 border-l-2 border-emerald-100 pl-3' : ''}`} data-testid={`question-${question.id}`}>
    {isSubquestion ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700" data-testid={`subquestion-indicator-${question.id}`}>↳</span> : <span draggable onDragStart={beginDrag} className="flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600 active:cursor-grabbing" data-testid={`question-reorder-handle-${question.id}`}><GripVertical className="h-4 w-4" /><span className="sr-only">Drag question {index + 1}</span></span>}
    <div className="min-w-0"><p className="text-sm font-semibold text-stone-950">{question.question_text}{question.required && <span className="ml-1 text-rose-500">*</span>}{isSubquestion && <span className="ml-2 text-xs font-medium text-emerald-700" data-testid={`subquestion-label-${question.id}`}>Subquestion</span>}</p>{question.description && <p className="mt-1 truncate text-xs text-stone-500">{question.description}</p>}</div>
    <Badge variant="outline" className="w-fit border-stone-200 bg-white text-xs font-normal text-stone-500" data-testid={`question-section-${question.id}`}>{sectionLabel}</Badge>
    <Badge variant="outline" className="w-fit border-sky-200 bg-sky-50 text-xs font-normal capitalize text-sky-800" data-testid={`question-category-${question.id}`}>{questionCategoryLabel}</Badge>
    <div className="truncate text-xs text-stone-500" title={typeLabel}>{typeLabel}</div><div className="truncate text-xs text-stone-500" title={scoringLabel}>{scoringLabel}</div><Badge variant="outline" className={`w-fit text-xs font-medium capitalize ${importanceClass}`}>{question.importance || 'medium'}</Badge>
    <div className="flex min-w-0 items-center justify-end gap-1">{!isSubquestion && <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="border-emerald-200 bg-emerald-50 px-2 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950" aria-label={`Add subquestion to question ${index + 1}`} onClick={onAddSubquestion} data-testid={`add-subquestion-${question.id}`}><Plus className="mr-1 h-4 w-4" />Subquestion</Button></TooltipTrigger><TooltipContent>Add subquestion</TooltipContent></Tooltip>}<Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" aria-label={`Edit question ${index + 1}`} onClick={onEdit} data-testid={`edit-question-${question.id}`}><Edit2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit question</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" aria-label={`Delete question ${index + 1}`} onClick={onDelete} data-testid={`delete-question-${question.id}`}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete question</TooltipContent></Tooltip></div>
  </div>;
};