import React from 'react';
import { Landmark, Leaf, UsersRound } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../components/ui/accordion';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const pillarIcons = {
  environment: { Icon: Leaf, className: 'text-emerald-700' },
  social: { Icon: UsersRound, className: 'text-sky-700' },
  governance: { Icon: Landmark, className: 'text-amber-700' },
};

export const QuestionnaireTaxonomySidebar = ({
  questionnaires,
  selectedQuestionnaire,
  onQuestionnaireChange,
  loading,
  groupedQuestions,
  activeCategoryKey,
  onCategoryChange,
}) => (
  <aside className="border-b border-stone-200 bg-stone-50/70 xl:border-b-0 xl:border-r" data-testid="questionnaire-taxonomy-sidebar">
    <div className="border-b border-stone-200 bg-white p-4">
      <Label htmlFor="questionnaire-builder-selector" className="mb-2 block text-sm font-semibold text-stone-800" data-testid="questionnaire-selector-label">Questionnaire</Label>
      <Select value={selectedQuestionnaire?.id || ''} onValueChange={onQuestionnaireChange} disabled={loading || questionnaires.length === 0}>
        <SelectTrigger id="questionnaire-builder-selector" className="h-11 w-full border-stone-200 bg-white font-medium text-stone-900 shadow-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" data-testid="questionnaire-selector">
          <SelectValue placeholder={loading ? 'Loading questionnaires…' : 'Select questionnaire'} />
        </SelectTrigger>
        <SelectContent data-testid="questionnaire-selector-menu">
          {questionnaires.length === 0
            ? <div className="px-2 py-4 text-sm text-stone-500" data-testid="questionnaire-selector-empty">No questionnaires are available.</div>
            : questionnaires.map((questionnaire) => <SelectItem key={questionnaire.id} value={questionnaire.id} data-testid={`questionnaire-selector-option-${questionnaire.id}`}>{questionnaire.name}{!questionnaire.is_active ? ' · Inactive' : ''}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <Accordion type="multiple" defaultValue={groupedQuestions.map((section) => section.value)} className="px-3 py-3" data-testid="questionnaire-taxonomy-pillars">
      {groupedQuestions.map((section) => {
        const { Icon, className } = pillarIcons[section.value];
        return <AccordionItem key={section.value} value={section.value} className="border-b border-stone-200 last:border-0" data-testid={`questionnaire-taxonomy-pillar-${section.value}`}>
          <AccordionTrigger className="px-2 py-3 text-base font-semibold text-stone-900 hover:no-underline" data-testid={`questionnaire-taxonomy-pillar-toggle-${section.value}`}>
            <span className="flex items-center gap-3"><Icon className={`h-5 w-5 ${className}`} aria-hidden="true" />{section.label}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-3">
            <nav className="space-y-1" aria-label={`${section.label} questionnaire categories`} data-testid={`questionnaire-taxonomy-categories-${section.value}`}>
              {section.categories.map((category) => {
                const categoryKey = `${section.value}:${category.value}`;
                const selected = categoryKey === activeCategoryKey;
                return <button key={category.value} type="button" onClick={() => onCategoryChange(categoryKey)} className={`flex w-full items-center justify-between gap-3 border-l-2 px-3 py-2 text-left text-sm transition-[background-color,color,border-color] ${selected ? 'border-emerald-700 bg-emerald-100/70 font-semibold text-emerald-900' : 'border-transparent text-stone-600 hover:border-stone-300 hover:bg-white hover:text-stone-950'}`} data-testid={`questionnaire-taxonomy-category-${section.value}-${category.value}`} aria-current={selected ? 'page' : undefined}>
                  <span className="min-w-0 break-words">{category.groupLabel}</span>
                  <span className="shrink-0 text-xs tabular-nums text-stone-400" data-testid={`questionnaire-taxonomy-category-count-${section.value}-${category.value}`}>{category.questions.length}</span>
                </button>;
              })}
            </nav>
          </AccordionContent>
        </AccordionItem>;
      })}
    </Accordion>
  </aside>
);