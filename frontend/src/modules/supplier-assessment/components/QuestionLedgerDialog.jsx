import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const groups = [
  { value: 'environment', label: 'Environment' },
  { value: 'social', label: 'Social' },
  { value: 'governance', label: 'Governance' },
];

const categories = [
  { value: 'policy', label: 'Policy' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'certification', label: 'Certification' },
];

let draftQuestionSequence = 0;
const blankQuestion = (category, questionCategory) => ({
  draft_id: `draft-question-${++draftQuestionSequence}`,
  parent_draft_id: null,
  existing_parent_question_id: null,
  question_text: '',
  category,
  question_category: questionCategory,
  response_type: 'yes_no',
  importance: 'medium',
  scoring_rule: 'boolean',
  required: true,
  evidence_requirement: 'not_required',
  options_text: '',
  option_scores: {},
  yes_score: 100,
  no_score: 0,
});

const responseLabels = { yes_no: 'Yes / No', numeric: 'Numeric', percentage: 'Percentage', dropdown: 'Dropdown' };
const defaultRule = (responseType) => responseType === 'yes_no' ? 'boolean' : responseType === 'dropdown' ? 'choice_mapping' : 'higher_is_better';
const scoringOptions = {
  yes_no: [{ value: 'boolean', label: 'Boolean (Yes/No)' }],
  numeric: [{ value: 'higher_is_better', label: 'Higher is better' }, { value: 'lower_is_better', label: 'Lower is better' }],
  percentage: [{ value: 'higher_is_better', label: 'Higher is better' }, { value: 'lower_is_better', label: 'Lower is better' }],
  dropdown: [{ value: 'choice_mapping', label: 'Choice mapping' }],
};
const dropdownValues = (draft) => draft.options_text.split(',').map((value) => value.trim()).filter(Boolean);

export const QuestionLedgerDialog = ({ open, onOpenChange, onSave, saving, questions = [] }) => {
  const [activeSection, setActiveSection] = useState('environment');
  const [activeCategory, setActiveCategory] = useState('policy');
  const [draft, setDraft] = useState(blankQuestion('environment', 'policy'));

  const selectGroup = (section, category) => {
    setActiveSection(section);
    setActiveCategory(category);
    setDraft(blankQuestion(section, category));
  };

  useEffect(() => {
    if (open) selectGroup('environment', 'policy');
  }, [open]);

  const configuredQuestions = useMemo(() => questions.filter((question) => question.category === activeSection
    && (question.question_category || 'policy') === activeCategory), [activeCategory, activeSection, questions]);
  const parentQuestions = configuredQuestions.filter((question) => !question.parent_question_id);
  const currentDropdownValues = dropdownValues(draft);

  const saveDraft = async () => {
    const saved = await onSave([draft], { keepOpen: true });
    if (saved) setDraft(blankQuestion(activeSection, activeCategory));
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[min(760px,calc(100dvh-2rem))] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden bg-white p-0" data-testid="question-ledger-dialog">
      <DialogHeader className="border-b border-emerald-100 bg-emerald-50 px-6 py-5"><DialogTitle>Add questions</DialogTitle><DialogDescription>Select a section and category, then add a question directly to that group.</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="w-full shrink-0 border-b border-stone-200 bg-stone-50 p-3 md:w-56 md:border-b-0 md:border-r" aria-label="Question section navigation" data-testid="question-ledger-navigation">
          <div className="space-y-4">{groups.map((section) => <div key={section.value} data-testid={`question-ledger-section-${section.value}`}><p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-stone-950">{section.label}</p><div className="space-y-1">{categories.map((category) => {
            const active = activeSection === section.value && activeCategory === category.value;
            return <Button key={category.value} variant="ghost" className={`w-full justify-start ${active ? 'bg-emerald-100 text-emerald-950 hover:bg-emerald-100 hover:text-emerald-950' : 'text-stone-600 hover:bg-white hover:text-stone-950'}`} onClick={() => selectGroup(section.value, category.value)} data-testid={`question-ledger-nav-${section.value}-${category.value}`}>{category.label}</Button>;
          })}</div></div>)}</div>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6" data-testid="question-ledger-question-area">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4"><div><h2 className="text-lg font-semibold text-stone-950" data-testid="question-ledger-active-group">{groups.find((section) => section.value === activeSection)?.label} · {categories.find((category) => category.value === activeCategory)?.label}</h2><p className="mt-1 text-sm text-stone-500" data-testid="question-ledger-existing-count">{configuredQuestions.length} configured question{configuredQuestions.length === 1 ? '' : 's'}</p></div><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800" data-testid="question-ledger-active-category">{categories.find((category) => category.value === activeCategory)?.label}</Badge></div>
          <div className="mt-5 border border-emerald-200 bg-emerald-50/40 p-4" data-testid="question-ledger-new-question-row">
            <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_minmax(12rem,0.8fr)_9rem_10rem_8rem_9rem] xl:items-end"><div className="space-y-1.5"><Label htmlFor="question-ledger-new-question" className="text-xs font-medium text-stone-600">New question</Label><Input id="question-ledger-new-question" value={draft.question_text} onChange={(event) => setDraft((current) => ({ ...current, question_text: event.target.value }))} placeholder="Enter question" data-testid="question-ledger-new-question-input" /></div><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Parent question / subquestion</Label><Select value={draft.existing_parent_question_id || 'top-level'} onValueChange={(existing_parent_question_id) => setDraft((current) => ({ ...current, existing_parent_question_id: existing_parent_question_id === 'top-level' ? null : existing_parent_question_id }))}><SelectTrigger data-testid="question-ledger-new-parent-question"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="top-level">Top-level question</SelectItem>{parentQuestions.map((question) => <SelectItem key={question.id} value={question.id} data-testid={`question-ledger-parent-option-${question.id}`}>{question.question_text}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Response type</Label><Select value={draft.response_type} onValueChange={(response_type) => setDraft((current) => ({ ...current, response_type, scoring_rule: defaultRule(response_type), options_text: '', option_scores: {} }))}><SelectTrigger data-testid="question-ledger-new-response-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes_no">Yes / No</SelectItem><SelectItem value="numeric">Numeric</SelectItem><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="dropdown">Dropdown</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Scoring type</Label><Select value={draft.scoring_rule} onValueChange={(scoring_rule) => setDraft((current) => ({ ...current, scoring_rule }))}><SelectTrigger data-testid="question-ledger-new-scoring-type"><SelectValue /></SelectTrigger><SelectContent>{(scoringOptions[draft.response_type] || scoringOptions.yes_no).map((option) => <SelectItem key={option.value} value={option.value} data-testid={`question-ledger-new-scoring-option-${option.value}`}>{option.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Importance</Label><Select value={draft.importance} onValueChange={(importance) => setDraft((current) => ({ ...current, importance }))}><SelectTrigger data-testid="question-ledger-new-importance"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Evidence</Label><Select value={draft.evidence_requirement} onValueChange={(evidence_requirement) => setDraft((current) => ({ ...current, evidence_requirement }))}><SelectTrigger data-testid="question-ledger-new-evidence"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_required">No evidence</SelectItem><SelectItem value="optional">Optional</SelectItem><SelectItem value="required">Required</SelectItem></SelectContent></Select></div></div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><label className="flex h-10 items-center gap-2 text-sm text-stone-700"><Checkbox checked={draft.required} onCheckedChange={(required) => setDraft((current) => ({ ...current, required: Boolean(required) }))} data-testid="question-ledger-new-required" />Required</label><Button className="bg-emerald-800 text-white hover:bg-emerald-900" onClick={saveDraft} disabled={saving} data-testid="question-ledger-add-question">{saving ? 'Adding…' : <><Plus className="mr-1 h-4 w-4" />Add question</>}</Button></div>
            {draft.response_type === 'yes_no' && <div className="mt-3 grid gap-3 border-t border-emerald-100 pt-3 sm:grid-cols-2" data-testid="question-ledger-new-yes-no-scores"><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Yes score</Label><Input type="number" min="0" max="100" value={draft.yes_score} onChange={(event) => setDraft((current) => ({ ...current, yes_score: event.target.value }))} data-testid="question-ledger-new-yes-score" /></div><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">No score</Label><Input type="number" min="0" max="100" value={draft.no_score} onChange={(event) => setDraft((current) => ({ ...current, no_score: event.target.value }))} data-testid="question-ledger-new-no-score" /></div></div>}
            {draft.response_type === 'dropdown' && <div className="mt-3 space-y-3 border-t border-emerald-100 pt-3" data-testid="question-ledger-new-dropdown-scores"><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Options</Label><Input value={draft.options_text} onChange={(event) => setDraft((current) => ({ ...current, options_text: event.target.value }))} placeholder="Option A, Option B" data-testid="question-ledger-new-options" /></div>{currentDropdownValues.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{currentDropdownValues.map((option) => <div key={option} className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">{option} score</Label><Input type="number" min="0" max="100" value={draft.option_scores[option] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, option_scores: { ...current.option_scores, [option]: event.target.value } }))} data-testid={`question-ledger-new-option-score-${option}`} /></div>)}</div>}</div>}
          </div>
          <div className="mt-6" data-testid="question-ledger-existing-questions"><h3 className="text-sm font-semibold text-stone-700">Configured questions</h3>{configuredQuestions.length === 0 ? <div className="py-12 text-center text-stone-400" data-testid="question-ledger-existing-empty"><FileText className="mx-auto mb-2 h-8 w-8 text-stone-300" /><p className="text-sm">No questions in this group yet.</p></div> : <div className="mt-3 divide-y divide-stone-100 border-y border-stone-100">{configuredQuestions.map((question, index) => <div key={question.id} className={`flex items-center justify-between gap-3 py-3 ${question.parent_question_id ? 'pl-5' : ''}`} data-testid={`question-ledger-existing-question-${question.id}`}><div className="min-w-0"><p className="text-sm font-medium text-stone-900">{question.parent_question_id ? '↳ ' : ''}{question.question_text}</p><p className="mt-1 text-xs text-stone-500">{responseLabels[question.response_type] || question.response_type} · {question.importance} importance{question.required ? ' · Required' : ''}</p></div><span className="shrink-0 text-xs text-stone-400">{index + 1}</span></div>)}</div>}</div>
        </div>
      </div>
      <DialogFooter className="border-t border-stone-200 px-6 py-4"><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="cancel-question-ledger">Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};