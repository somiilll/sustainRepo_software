import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { DEFAULT_SUPPLIER_ESG_TAXONOMY, ESG_SECTIONS, cloneSupplierEsgTaxonomy } from '../esgTaxonomy';

const groups = ESG_SECTIONS;
const responseLabels = { yes_no: 'Yes / No', numeric: 'Numeric', percentage: 'Percentage', dropdown: 'Dropdown' };
const defaultRule = (responseType) => responseType === 'yes_no' ? 'boolean' : responseType === 'dropdown' ? 'choice_mapping' : 'higher_is_better';
const scoringOptions = {
  yes_no: [{ value: 'boolean', label: 'Boolean (Yes/No)' }, { value: 'manual', label: 'Manual evidence review' }],
  numeric: [{ value: 'higher_is_better', label: 'Higher is better' }, { value: 'lower_is_better', label: 'Lower is better' }, { value: 'manual', label: 'Manual evidence review' }],
  percentage: [{ value: 'higher_is_better', label: 'Higher is better' }, { value: 'lower_is_better', label: 'Lower is better' }, { value: 'manual', label: 'Manual evidence review' }],
  dropdown: [{ value: 'choice_mapping', label: 'Choice mapping' }, { value: 'manual', label: 'Manual evidence review' }],
};

let draftQuestionSequence = 0;
const createDraft = (section, category) => ({
  draft_id: `draft-question-${++draftQuestionSequence}`,
  question_text: '',
  category: section,
  question_category: category,
  response_type: 'yes_no',
  scoring_rule: 'boolean',
  required: true,
  evidence_requirement: 'not_required',
  options_text: '',
  option_scores: {},
  yes_score: 100,
  no_score: 0,
});
const dropdownValues = (draft) => draft.options_text.split(',').map((value) => value.trim()).filter(Boolean);

const QuestionAuthoringRow = ({ draft, index, onChange, onRemove, canRemove }) => {
  const options = dropdownValues(draft);
  const setField = (patch) => onChange({ ...draft, ...patch });
  return <div className="border border-stone-200 bg-white p-4" data-testid={`question-ledger-draft-row-${index}`}>
    <div className="grid gap-3 xl:grid-cols-[minmax(13rem,1.3fr)_8rem_9rem_7rem_9rem_8rem_7rem] xl:items-end">
      <div className="space-y-1.5"><Label htmlFor={`question-ledger-draft-question-${index}`} className="text-xs font-medium text-stone-600 xl:sr-only">Question</Label><Input id={`question-ledger-draft-question-${index}`} value={draft.question_text} onChange={(event) => setField({ question_text: event.target.value })} placeholder="Enter question" data-testid={`question-ledger-draft-question-${index}`} /></div>
      <div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600 xl:sr-only">Response type</Label><Select value={draft.response_type} onValueChange={(response_type) => setField({ response_type, scoring_rule: defaultRule(response_type), options_text: '', option_scores: {} })}><SelectTrigger data-testid={`question-ledger-draft-response-type-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes_no">Yes / No</SelectItem><SelectItem value="numeric">Numeric</SelectItem><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="dropdown">Dropdown</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600 xl:sr-only">Scoring type</Label><Select value={draft.scoring_rule} onValueChange={(scoring_rule) => setField({ scoring_rule })}><SelectTrigger data-testid={`question-ledger-draft-scoring-type-${index}`}><SelectValue /></SelectTrigger><SelectContent>{(scoringOptions[draft.response_type] || scoringOptions.yes_no).map((option) => <SelectItem key={option.value} value={option.value} data-testid={`question-ledger-draft-scoring-option-${index}-${option.value}`}>{option.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600 xl:sr-only">Question Mandatory</Label><Select value={draft.required ? 'yes' : 'no'} onValueChange={(value) => setField({ required: value === 'yes' })}><SelectTrigger data-testid={`question-ledger-draft-question-mandatory-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600 xl:sr-only">Evidence</Label><Select value={draft.evidence_requirement} onValueChange={(evidence_requirement) => setField({ evidence_requirement, ...(evidence_requirement === 'evidence_scored' ? { assessment_type: 'type_c', scoring_rule: 'boolean' } : {}) })}><SelectTrigger data-testid={`question-ledger-draft-evidence-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">Required</SelectItem><SelectItem value="not_required">Not Required</SelectItem><SelectItem value="evidence_scored">Scoring based on evidence</SelectItem></SelectContent></Select></div>
      <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={onRemove} disabled={!canRemove} data-testid={`question-ledger-remove-draft-${index}`}><Trash2 className="mr-1 h-4 w-4" />Remove</Button>
    </div>
    {draft.response_type === 'yes_no' && <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2" data-testid={`question-ledger-draft-yes-no-scores-${index}`}><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Yes score</Label><Input type="number" min="0" max="100" value={draft.yes_score} onChange={(event) => setField({ yes_score: event.target.value })} data-testid={`question-ledger-draft-yes-score-${index}`} /></div><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">No score</Label><Input type="number" min="0" max="100" value={draft.no_score} onChange={(event) => setField({ no_score: event.target.value })} data-testid={`question-ledger-draft-no-score-${index}`} /></div></div>}
    {draft.response_type === 'dropdown' && <div className="mt-3 space-y-3 border-t border-stone-100 pt-3" data-testid={`question-ledger-draft-dropdown-scores-${index}`}><div className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">Options</Label><Input value={draft.options_text} onChange={(event) => setField({ options_text: event.target.value })} placeholder="Option A, Option B" data-testid={`question-ledger-draft-options-${index}`} /></div>{options.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{options.map((option) => <div key={option} className="space-y-1.5"><Label className="text-xs font-medium text-stone-600">{option} score</Label><Input type="number" min="0" max="100" value={draft.option_scores[option] ?? ''} onChange={(event) => setField({ option_scores: { ...draft.option_scores, [option]: event.target.value } })} data-testid={`question-ledger-draft-option-score-${index}-${option}`} /></div>)}</div>}</div>}
  </div>;
};

export const QuestionLedgerDialog = ({ open, onOpenChange, onSave, saving, questions = [], taxonomy = DEFAULT_SUPPLIER_ESG_TAXONOMY }) => {
  const configuredTaxonomy = useMemo(() => cloneSupplierEsgTaxonomy(taxonomy), [taxonomy]);
  const categoriesFor = (section) => (configuredTaxonomy[section] || []).filter((category) => category.enabled);
  const firstCategory = (section) => categoriesFor(section)[0]?.code || '';
  const [activeSection, setActiveSection] = useState('environment');
  const [activeCategory, setActiveCategory] = useState(() => firstCategory('environment'));
  const [expandedSections, setExpandedSections] = useState({ environment: true, social: false, governance: false });
  const [drafts, setDrafts] = useState([createDraft('environment', DEFAULT_SUPPLIER_ESG_TAXONOMY.environment[0].code)]);
  const resetDrafts = (section, category) => setDrafts([createDraft(section, category)]);
  const selectGroup = (section, category) => { setActiveSection(section); setActiveCategory(category); setExpandedSections((current) => ({ ...current, [section]: true })); resetDrafts(section, category); };
  useEffect(() => { if (open) { setExpandedSections({ environment: true, social: false, governance: false }); selectGroup('environment', firstCategory('environment')); } }, [open, taxonomy]);
  const configuredQuestions = useMemo(() => questions.filter((question) => question.category === activeSection
    && (question.question_category || 'policy') === activeCategory), [activeCategory, activeSection, questions]);
  const updateDraft = (index, draft) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? draft : item));
  const removeDraft = (index) => setDrafts((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index));
  const saveAll = async () => { await onSave(drafts); };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[min(820px,calc(100dvh-2rem))] w-[96vw] max-w-7xl flex-col gap-0 overflow-hidden bg-white p-0" data-testid="question-ledger-dialog">
      <DialogHeader className="border-b border-stone-200 bg-white px-6 py-5"><DialogTitle>Add questions</DialogTitle><DialogDescription>Select a Section and Category, then add one or more questions before saving.</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="max-h-56 w-full shrink-0 overflow-y-auto border-b border-stone-200 bg-stone-50 p-3 md:max-h-none md:w-64 md:border-b-0 md:border-r" aria-label="Question section navigation" data-testid="question-ledger-navigation"><div className="space-y-2">{groups.map((section) => <div key={section.value} className="border-b border-stone-200 pb-2 last:border-0" data-testid={`question-ledger-section-${section.value}`}><Button variant="ghost" className="flex w-full justify-between px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-950 hover:bg-stone-100" onClick={() => setExpandedSections((current) => ({ ...current, [section.value]: !current[section.value] }))} aria-expanded={Boolean(expandedSections[section.value])} data-testid={`question-ledger-section-${section.value}-toggle`}><span>{section.label}</span><ChevronDown className={`h-4 w-4 transition-transform ${expandedSections[section.value] ? '' : '-rotate-90'}`} /></Button>{expandedSections[section.value] && <div className="mt-1 space-y-1">{categoriesFor(section.value).map((category) => { const active = activeSection === section.value && activeCategory === category.code; return <Button key={category.code} variant="ghost" className={`h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-xs ${active ? 'bg-stone-200 text-stone-950 hover:bg-stone-200 hover:text-stone-950' : 'text-stone-600 hover:bg-white hover:text-stone-950'}`} onClick={() => selectGroup(section.value, category.code)} data-testid={`question-ledger-nav-${section.value}-${category.code}`}>{category.name}</Button>; })}{categoriesFor(section.value).length === 0 && <p className="px-2 py-1 text-xs text-stone-400" data-testid={`question-ledger-section-${section.value}-empty`}>No enabled subcategories</p>}</div>}</div>)}</div></nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6" data-testid="question-ledger-question-area">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4"><div><h2 className="text-lg font-semibold text-stone-950" data-testid="question-ledger-active-group">{groups.find((section) => section.value === activeSection)?.label} · {categoriesFor(activeSection).find((category) => category.code === activeCategory)?.name || 'No enabled subcategory'}</h2><p className="mt-1 text-sm text-stone-500" data-testid="question-ledger-existing-count">{configuredQuestions.length} configured question{configuredQuestions.length === 1 ? '' : 's'}</p></div><Badge variant="outline" className="border-stone-200 bg-stone-100 text-stone-700" data-testid="question-ledger-active-category">{categoriesFor(activeSection).find((category) => category.code === activeCategory)?.name || 'Unavailable'}</Badge></div>
          <div className="mt-5" data-testid="question-ledger-new-question-row"><div className="mb-3 flex justify-end"><Button variant="outline" className="border-stone-300 bg-white text-stone-800 hover:bg-stone-50 hover:text-stone-950" onClick={() => setDrafts((current) => [...current, createDraft(activeSection, activeCategory)])} disabled={!activeCategory} data-testid="question-ledger-add-draft"><Plus className="mr-1 h-4 w-4" />Add question</Button></div><div className="hidden grid-cols-[minmax(13rem,1.3fr)_8rem_9rem_9rem_8rem_7rem] items-center gap-3 bg-stone-100 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-stone-600 xl:grid" data-testid="question-ledger-table-header"><span>Question</span><span>Response type</span><span>Scoring type</span><span>Question Mandatory</span><span>Evidence</span><span>Actions</span></div><div className="space-y-3">{drafts.map((draft, index) => <QuestionAuthoringRow key={draft.draft_id} draft={draft} index={index} onChange={(nextDraft) => updateDraft(index, nextDraft)} onRemove={() => removeDraft(index)} canRemove={drafts.length > 1} />)}</div></div>
          <div className="mt-6" data-testid="question-ledger-existing-questions"><h3 className="text-sm font-semibold text-stone-700">Configured questions</h3>{configuredQuestions.length === 0 ? <div className="py-12 text-center text-stone-400" data-testid="question-ledger-existing-empty"><FileText className="mx-auto mb-2 h-8 w-8 text-stone-300" /><p className="text-sm">No questions in this group yet.</p></div> : <div className="mt-3 divide-y divide-stone-100 border-y border-stone-100">{configuredQuestions.map((question) => <div key={question.id} className="py-3" data-testid={`question-ledger-existing-question-${question.id}`}><p className="text-sm font-medium text-stone-900">{question.question_text}</p><p className="mt-1 text-xs text-stone-500">{responseLabels[question.response_type] || question.response_type}{question.required ? ' · Required' : ''}</p></div>)}</div>}</div>
        </div>
      </div>
      <DialogFooter className="border-t border-stone-200 px-6 py-4"><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="cancel-question-ledger">Close</Button><Button className="bg-emerald-800 text-white hover:bg-emerald-900" onClick={saveAll} disabled={saving || !activeCategory} data-testid="save-question-ledger">{saving ? 'Saving…' : `Save ${drafts.length} question${drafts.length === 1 ? '' : 's'}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};