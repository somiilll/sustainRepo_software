import React from 'react';
import { Edit2, GripVertical, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';

export const QuestionnaireQuestionRow = ({ question, index, categoryLabel, typeLabel, scoringLabel, importanceClass, onEdit, onDelete, onDrop }) => {
  const beginDrag = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', question.id);
  };
  return <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event.dataTransfer.getData('text/plain'), question.id)} className="grid gap-2 border-b border-stone-100 py-3 last:border-0 lg:grid-cols-[2.5rem_minmax(12rem,1fr)_7rem_7rem_9rem_7rem_10rem] lg:items-center lg:gap-3" data-testid={`question-${question.id}`}>
    <span draggable onDragStart={beginDrag} className="flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600 active:cursor-grabbing" data-testid={`question-reorder-handle-${question.id}`}><GripVertical className="h-4 w-4" /><span className="sr-only">Drag question {index + 1}</span></span>
    <div className="min-w-0"><p className="text-sm font-medium text-stone-900">{question.question_text}{question.required && <span className="ml-1 text-rose-500">*</span>}</p>{question.description && <p className="mt-0.5 truncate text-xs text-stone-500">{question.description}</p>}</div>
    <Badge variant="outline" className="w-fit text-xs">{categoryLabel}</Badge>
    <div className="text-xs text-stone-600">{typeLabel}</div><div className="text-xs text-stone-600">{scoringLabel}</div><Badge variant="outline" className={`w-fit text-xs ${importanceClass}`}>{question.importance || 'medium'}</Badge>
    <div className="flex min-w-0 flex-wrap items-center justify-start gap-1 lg:justify-end"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" aria-label={`Edit question ${index + 1}`} onClick={onEdit} data-testid={`edit-question-${question.id}`}><Edit2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit question</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" aria-label={`Delete question ${index + 1}`} onClick={onDelete} data-testid={`delete-question-${question.id}`}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete question</TooltipContent></Tooltip></div>
  </div>;
};