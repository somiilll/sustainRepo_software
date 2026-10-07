import { CheckCircle2, Landmark, Leaf, UsersRound } from 'lucide-react';

const PILLARS = {
  environment: { label: 'Environment', Icon: Leaf, className: 'text-emerald-700', active: 'bg-emerald-50 text-emerald-950' },
  social: { label: 'Social', Icon: UsersRound, className: 'text-sky-700', active: 'bg-sky-50 text-sky-950' },
  governance: { label: 'Governance', Icon: Landmark, className: 'text-violet-700', active: 'bg-violet-50 text-violet-950' },
};

export const ResponseReviewSidebar = ({ groups, activeCategoryKey, onCategorySelect }) => (
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
              {group.categories.map((category) => {
                const reviewedCount = category.questions.filter((question) => Boolean(question.review?.status)).length;
                const selected = activeCategoryKey === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => onCategorySelect(category.key)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-[background-color,color] ${selected ? config.active : 'text-stone-600 hover:bg-white hover:text-stone-950'}`}
                    data-testid={`response-review-category-button-${category.key}`}
                    aria-current={selected ? 'page' : undefined}
                  >
                    <span className="min-w-0 flex-1 break-words text-xs font-semibold uppercase tracking-wide">{category.label}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums" data-testid={`response-review-category-reviewed-count-${category.key}`}>
                      {reviewedCount === category.questions.length && category.questions.length > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      {reviewedCount}/{category.questions.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  </aside>
);
