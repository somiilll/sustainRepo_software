import React from 'react';
import { ChevronRight, Landmark, Leaf, UsersRound } from 'lucide-react';
import { QuestionnaireQuestionRow } from './QuestionnaireQuestionRow';

const pillarIcons = {
  environment: { Icon: Leaf, className: 'text-emerald-700' },
  social: { Icon: UsersRound, className: 'text-sky-700' },
  governance: { Icon: Landmark, className: 'text-amber-700' },
};

export const QuestionnaireQuestionTable = ({
  selectedCategory,
  allQuestions,
  typeLabel,
  evidenceLabel,
  onEdit,
  onDelete,
  onDrop,
  readOnly,
}) => {
  if (!selectedCategory) return <div className="p-12 text-center text-sm text-stone-500" data-testid="question-category-empty-selection">Select a category to view its questions.</div>;
  const { section, category } = selectedCategory;
  const { Icon, className } = pillarIcons[section.value];
  return <div className="min-w-0 p-4 sm:p-5" data-testid="question-category-workspace">
    <div className="mb-5 flex items-center gap-2 border-b border-stone-200 pb-4" data-testid="selected-question-category-heading">
      <Icon className={`h-6 w-6 shrink-0 ${className}`} aria-hidden="true" />
      <h2 className="text-lg font-semibold text-stone-950" data-testid="selected-question-category-title">{section.label}</h2>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
      <p className="min-w-0 break-words text-lg font-semibold text-stone-800" data-testid="selected-question-category-name">{category.groupLabel}</p>
    </div>
    {category.questions.length === 0
      ? <div className="border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center text-sm text-stone-500" data-testid={`question-category-empty-${section.value}-${category.value}`}>No questions in this category.</div>
      : <div className="overflow-hidden border border-stone-200 bg-white" data-testid={`question-table-${section.value}-${category.value}`}>
        <div className="hidden grid-cols-[minmax(29rem,1fr)_11rem_5.5rem_4.5rem] items-center gap-3 bg-stone-100 px-4 py-4 text-xs font-semibold text-stone-600 lg:grid" data-testid={`question-table-header-${section.value}-${category.value}`}>
          <span>Question &amp; description</span><span>Question Type &amp; Evidence</span><span>Max points</span><span className="text-right">Actions</span>
        </div>
        {category.questions.map((question) => <QuestionnaireQuestionRow key={question.id} question={question} index={allQuestions.indexOf(question)} typeLabel={typeLabel(question.response_type)} evidenceLabel={evidenceLabel(question.evidence_requirement)} onEdit={() => onEdit(question)} onDelete={() => onDelete(question)} onDrop={onDrop} readOnly={readOnly} />)}
      </div>}
  </div>;
};