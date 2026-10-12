import { CheckCircle2, Landmark, Leaf, UsersRound } from 'lucide-react';

const PILLARS = {
  environment: { label: 'Environment', Icon: Leaf, className: 'text-emerald-800', icon: 'bg-emerald-600', active: 'border-emerald-500 bg-emerald-50 text-emerald-950' },
  social: { label: 'Social', Icon: UsersRound, className: 'text-sky-800', icon: 'bg-sky-600', active: 'border-sky-500 bg-sky-50 text-sky-950' },
  governance: { label: 'Governance', Icon: Landmark, className: 'text-violet-800', icon: 'bg-violet-600', active: 'border-violet-500 bg-violet-50 text-violet-950' },
};

export const ResponseReviewSidebar = ({ groups, activeCategoryKey, onCategorySelect }) => (
  <aside className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] xl:sticky xl:top-4" data-testid="response-review-taxonomy-sidebar">
    <div className="border-b border-stone-200 bg-white px-5 py-4">
      <p className="text-sm font-semibold text-stone-900" data-testid="response-review-sidebar-title">Questionnaire</p>
      <p className="mt-1 text-xs text-stone-500" data-testid="response-review-sidebar-caption">Review progress by topic</p>
    </div>
    <nav className="max-h-[calc(100vh-13rem)] overflow-y-auto bg-slate-50/60 p-3" aria-label="Questionnaire categories" data-testid="response-review-sidebar-navigation">
      {Object.entries(PILLARS).map(([pillar, config]) => {
        const group = groups[pillar];
        if (!group?.categories?.length) return null;
        const { Icon } = config;
        return (
          <section key={pillar} className="mb-4 overflow-hidden rounded-md border border-slate-200 bg-white last:mb-0" data-testid={`response-review-pillar-${pillar}`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
              <span className={`flex items-center gap-2 text-sm font-semibold ${config.className}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-md text-white ${config.icon}`}><Icon className="h-3.5 w-3.5" /></span>{config.label}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600" data-testid={`response-review-pillar-count-${pillar}`}>{group.questionCount}</span>
            </div>
            <div className="space-y-1 p-2">
              {group.categories.map((category) => {
                const reviewedCount = category.questions.filter((question) => {
                  const status = question.review?.status;
                  const needsResubmission = question.review?.needs_resubmission;
                  // If sent for clarification (status is rejected and needs_resubmission is true), it is awaiting supplier response, so not counted as evaluated/reviewed
                  if (status === 'rejected' && needsResubmission) return false;
                  return Boolean(status);
                }).length;
                const clarificationCount = category.questions.filter((question) => {
                  return question.review?.status === 'rejected' && question.review?.needs_resubmission;
                }).length;
                const selected = activeCategoryKey === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => onCategorySelect(category.key)}
                    className={`flex w-full items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-left transition-[background-color,border-color,color,transform] hover:translate-x-0.5 ${selected ? config.active : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                    data-testid={`response-review-category-button-${category.key}`}
                    aria-current={selected ? 'page' : undefined}
                  >
                    <span className="min-w-0 flex-1 break-words text-xs font-semibold">{category.label}</span>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold tabular-nums shadow-sm" data-testid={`response-review-category-reviewed-count-${category.key}`}>
                      {clarificationCount > 0 && <span className="inline-block h-2 w-2 rounded-full bg-amber-500" title={`${clarificationCount} clarification pending`} />}
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
