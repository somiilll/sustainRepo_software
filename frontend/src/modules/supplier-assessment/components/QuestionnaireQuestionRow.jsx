import React from 'react';
import { Edit2, GripVertical, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';

export const QuestionnaireQuestionRow = ({ question, index, typeLabel, evidenceLabel, onEdit, onDelete, onDrop, readOnly = false }) => {
  const beginDrag = (event) => {
    if (readOnly) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', question.id);
  };
  const typeClass = typeLabel === 'Yes / No' ? 'bg-sky-50 text-sky-700 hover:bg-sky-50' : typeLabel === 'Numeric' ? 'bg-violet-50 text-violet-700 hover:bg-violet-50' : 'bg-stone-100 text-stone-700 hover:bg-stone-100';
  const evidenceClass = ['Required', 'Scoring based'].includes(evidenceLabel) ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50' : 'bg-stone-100 text-stone-600 hover:bg-stone-100';
  return <div onDragOver={(event) => !readOnly && event.preventDefault()} onDrop={(event) => !readOnly && onDrop(event.dataTransfer.getData('text/plain'), question.id)} className="border-b border-stone-100 px-4 py-5 last:border-0 lg:grid lg:grid-cols-[minmax(29rem,1fr)_11rem_5.5rem_4.5rem] lg:items-center lg:gap-3" data-testid={`question-${question.id}`}>
    <div className="mb-5 flex min-w-0 items-start gap-2 lg:mb-0">
      <span draggable={!readOnly} onDragStart={beginDrag} className={`mt-1 flex h-6 w-5 shrink-0 items-center justify-center text-stone-300 ${readOnly ? 'cursor-not-allowed opacity-50' : 'cursor-grab hover:text-stone-500 active:cursor-grabbing'}`} data-testid={`question-reorder-handle-${question.id}`}><GripVertical className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Reorder question</span></span>
      <div className="min-w-0"><p className="break-words text-sm font-medium leading-6 text-stone-950" data-testid={`question-text-${question.id}`}>{question.question_text}{question.required && <span className="ml-1 text-rose-500">*</span>}</p>{question.description && <p className="mt-2 break-words text-xs leading-5 text-stone-500" data-testid={`question-description-${question.id}`}>{question.description}</p>}</div>
    </div>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:contents">
      <div className="min-w-0"><span className="mb-1 block text-[11px] font-medium text-stone-400 lg:hidden">Question Type &amp; Evidence</span><div className="flex flex-col items-start gap-1.5"><Badge className={`${typeClass} border-0 font-medium`} data-testid={`question-type-${question.id}`}>{typeLabel}</Badge><Badge className={`${evidenceClass} border-0 font-medium`} data-testid={`question-evidence-${question.id}`}>{evidenceLabel}</Badge></div></div>
      <div><span className="mb-1 block text-[11px] font-medium text-stone-400 lg:hidden">Max points</span><span className="text-sm font-medium text-stone-700" data-testid={`question-max-points-${question.id}`}>{question.max_points ?? '—'}</span></div>
      <div className="col-span-2 flex min-w-0 items-center justify-end gap-1 sm:col-span-1"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`Edit question`} onClick={onEdit} disabled={readOnly} data-testid={`edit-question-${question.id}`}><Edit2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{readOnly ? 'Unlock submitted responses before editing' : 'Edit question'}</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="text-rose-600 hover:text-rose-700" aria-label="Delete question" onClick={onDelete} disabled={readOnly} data-testid={`delete-question-${question.id}`}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{readOnly ? 'Unlock submitted responses before deleting' : 'Delete question'}</TooltipContent></Tooltip></div>
    </div>
  </div>;
};