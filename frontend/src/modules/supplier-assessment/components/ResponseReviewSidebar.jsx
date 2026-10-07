import React from 'react';
import { CheckCircle2, ChevronRight, Circle, Landmark, Leaf, RotateCcw, UsersRound, XCircle } from 'lucide-react';

const PILLARS = {
  environment: { label: 'Environment', Icon: Leaf, className: 'text-emerald-700', active: 'bg-emerald-50 text-emerald-950' },
  social: { label: 'Social', Icon: UsersRound, className: 'text-sky-700', active: 'bg-sky-50 text-sky-950' },
  governance: { label: 'Governance', Icon: Landmark, className: 'text-violet-700', active: 'bg-violet-50 text-violet-950' },
};

const reviewIcon = (question) => {
  if (question.review?.status === 'accepted') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (question.review?.status === 'rejected' && question.review?.needs_resubmission) return <RotateCcw className="h-4 w-4 text-amber-500" />;
  if (question.review?.status === 'rejected') return <XCircle className="h-4 w-4 text-rose-600" />;
  return <Circle className="h-3.5 w-3.5 text-stone-300" />;
};

export const ResponseReviewSidebar = ({ groups, activeQuestionId, activeCategoryKey, onQuestionSelect, onCategorySelect }) => (
  <aside className="min-w-0 border-b border-stone-200 bg-[#f8fbfa] xl:border-b-0 xl:border-r" data-testid="response-review-taxonomy-sidebar">
    <div className="border-b border-stone-200 bg-white px-5 py-4">
      <p className="text-sm font-semibold text-stone-900" data-testid="response-review-sidebar-title">Questionnaire</p>
      <p className="mt-1 text-xs text-stone-500" data-testid="response-review-sidebar-caption">Review each supplier response</p>
    </div>
    <nav className="max-h-[calc(100vh-13rem)] overflow-y-auto p-3" aria-label="Questionnaire categories" data-testid="response-review-sidebar-navigation">
      {Object.entries(PILLARS).map(([pillar, config]) => {
        const group = groups[pillar];
        if (!group?.categories?.length) return null;
        const { Icon } = config;
        return (
          <section key={pillar} className="mb-4 last:mb-0" data-testid={`response-review-pillar-${pillar}`}>
            <div className="flex items-center justify-between px-2 py-2">
              <span className={`flex items-center gap-2 text-sm font-semibold ${config.className}`}>
                <Icon className="h-4 w-4" />{config.label}
              </span>
              <span className="text-xs tabular-nums text-stone-500" data-testid={`response-review-pillar-count-${pillar}`}>{group.questionCount}</span>
            </div>
            <div className="space-y-1">
              {group.categories.map((category) => (
                <React.Fragment key={category.key}>
                  <button
                    type="button"
                    onClick={() => onCategorySelect(category.key)}
                    className={`w-full px-2 pt-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors ${activeCategoryKey === category.key ? 'text-emerald-800' : 'text-stone-400 hover:text-stone-700'}`}
                    data-testid={`response-review-category-button-${category.key}`}
                  >
                    {category.label}
                  </button>
                  {category.questions.map((question, index) => {
                    const selected = question.id === activeQuestionId;
                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => onQuestionSelect(question.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-[background-color,color] ${selected ? config.active : 'text-stone-600 hover:bg-white hover:text-stone-950'}`}
                        data-testid={`response-review-sidebar-question-${question.id}`}
                        aria-current={selected ? 'page' : undefined}
                      >
                        <span className="w-4 shrink-0 text-right tabular-nums text-stone-400">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{question.question_text}</span>
                        <span className="shrink-0" data-testid={`response-review-sidebar-question-status-${question.id}`}>{reviewIcon(question)}</span>
                        {selected && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  </aside>
);
