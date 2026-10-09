import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { ConfiguredQuestionList } from './ConfiguredQuestionList';
import { QuestionDraftCard } from './QuestionDraftCard';
import { DEFAULT_SUPPLIER_ESG_TAXONOMY, ESG_SECTIONS, cloneSupplierEsgTaxonomy } from '../esgTaxonomy';
import { createQuestionDraft, draftFingerprint, hydrateQuestionDraft, validateQuestionDraft } from '../questionDraftModel';

const groups = ESG_SECTIONS;
const sectionHeadingClasses = {
  environment: 'text-emerald-800',
  social: 'text-sky-800',
  governance: 'text-amber-800',
};

export const QuestionLedgerDialog = ({ open, onOpenChange, onSave, saving, questions = [], taxonomy = DEFAULT_SUPPLIER_ESG_TAXONOMY, scoringLocked = false }) => {
  const configuredTaxonomy = useMemo(() => cloneSupplierEsgTaxonomy(taxonomy), [taxonomy]);
  const categoriesFor = (section) => (configuredTaxonomy[section] || []).filter((category) => category.enabled);
  const firstCategory = (section) => categoriesFor(section)[0]?.code || '';
  const [activeSection, setActiveSection] = useState('environment');
  const [activeCategory, setActiveCategory] = useState(() => firstCategory('environment'));
  const [expandedSections, setExpandedSections] = useState({ environment: true, social: false, governance: false });
  const [draft, setDraft] = useState(() => createQuestionDraft('environment', firstCategory('environment')));
  const [changes, setChanges] = useState([]);
  const [confirmation, setConfirmation] = useState(null);

  const resetDraft = (section = activeSection, category = activeCategory) => setDraft(createQuestionDraft(section, category));
  const draftDirty = draftFingerprint(draft) !== draft.original_fingerprint;
  const hasUnsavedChanges = draftDirty || changes.length > 0;

  useEffect(() => {
    if (!open) return;
    const category = (configuredTaxonomy.environment || []).find((item) => item.enabled)?.code || '';
    setActiveSection('environment');
    setActiveCategory(category);
    setExpandedSections({ environment: true, social: false, governance: false });
    setDraft(createQuestionDraft('environment', category));
    setChanges([]);
    setConfirmation(null);
  }, [configuredTaxonomy, open]);

  const selectGroup = (section, category) => {
    const applySelection = () => {
      setActiveSection(section);
      setActiveCategory(category);
      setExpandedSections((current) => ({ ...current, [section]: true }));
      resetDraft(section, category);
    };
    if (draftDirty) setConfirmation({ type: 'navigate', action: applySelection });
    else applySelection();
  };

  const configuredItems = useMemo(() => {
    const updates = new Map(changes.filter((change) => change.kind === 'changed').map((change) => [change.source_id, change]));
    const saved = questions.filter((question) => question.category === activeSection && (question.question_category || 'policy') === activeCategory).map((question) => {
      const staged = updates.get(question.id);
      return { key: question.id, kind: staged ? 'changed' : 'saved', question, draft: staged?.draft || hydrateQuestionDraft(question) };
    });
    const created = changes.filter((change) => change.kind === 'new' && change.draft.category === activeSection && change.draft.question_category === activeCategory).map((change) => ({ key: change.key, kind: 'new', question: null, draft: change.draft }));
    return [...saved, ...created];
  }, [activeCategory, activeSection, changes, questions]);

  const addDraftToList = () => {
    const validationError = validateQuestionDraft(draft);
    if (validationError) { toast.error(validationError); return; }
    const currentFingerprint = draftFingerprint(draft);
    if (draft.source_id && currentFingerprint === draft.original_fingerprint) {
      if (draft.staged_key) setChanges((current) => current.filter((change) => change.key !== draft.staged_key));
      toast.info(draft.staged_key ? 'Question changes reverted.' : 'No question changes to add.');
      resetDraft();
      return;
    }
    const key = draft.staged_key || (draft.source_id ? `changed-${draft.source_id}` : `new-${draft.draft_id}`);
    const kind = draft.source_id ? 'changed' : 'new';
    const stagedDraft = { ...draft, staged_key: key };
    setChanges((current) => [...current.filter((change) => change.key !== key), { key, kind, source_id: draft.source_id, draft: stagedDraft }]);
    resetDraft();
  };

  const requestClose = () => {
    if (hasUnsavedChanges) setConfirmation({ type: 'close', action: () => onOpenChange(false) });
    else onOpenChange(false);
  };

  const confirmDiscard = () => {
    const action = confirmation?.action;
    setConfirmation(null);
    action?.();
  };

  const saveChanges = async () => {
    if (!changes.length) return;
    const saved = await onSave({
      newQuestions: changes.filter((change) => change.kind === 'new').map((change) => change.draft),
      changedQuestions: changes.filter((change) => change.kind === 'changed').map((change) => ({ id: change.source_id, draft: change.draft })),
    });
    if (saved) {
      setChanges([]);
      resetDraft();
      onOpenChange(false);
    }
  };

  return <>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose(); }}>
      <DialogContent className="flex h-[min(860px,calc(100dvh-2rem))] w-[96vw] max-w-7xl flex-col gap-0 overflow-hidden bg-white p-0" data-testid="question-ledger-dialog">
        <DialogHeader className="border-b border-stone-200 bg-white px-6 py-5"><DialogTitle>Add questions</DialogTitle><DialogDescription>Select a Section and Category, prepare questions, then save only the new or changed items.</DialogDescription></DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav className="max-h-56 w-full shrink-0 overflow-y-auto border-b border-stone-200 bg-stone-50 p-3 md:max-h-none md:w-64 md:border-b-0 md:border-r" aria-label="Question section navigation" data-testid="question-ledger-navigation"><div className="space-y-2">{groups.map((section) => <div key={section.value} className="border-b border-stone-200 pb-2 last:border-0" data-testid={`question-ledger-section-${section.value}`}><Button variant="ghost" className={`flex w-full justify-between px-2 py-2 text-left font-heading text-sm font-bold ${sectionHeadingClasses[section.value]} hover:bg-stone-100 hover:text-stone-950`} onClick={() => setExpandedSections((current) => ({ ...current, [section.value]: !current[section.value] }))} aria-expanded={Boolean(expandedSections[section.value])} data-testid={`question-ledger-section-${section.value}-toggle`}><span>{section.label}</span><ChevronDown className={`h-4 w-4 transition-transform ${expandedSections[section.value] ? '' : '-rotate-90'}`} /></Button>{expandedSections[section.value] && <div className="mt-1 space-y-1">{categoriesFor(section.value).map((category) => { const active = activeSection === section.value && activeCategory === category.code; return <Button key={category.code} variant="ghost" className={`h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-xs ${active ? 'bg-stone-200 text-stone-950 hover:bg-stone-200 hover:text-stone-950' : 'text-stone-600 hover:bg-white hover:text-stone-950'}`} onClick={() => selectGroup(section.value, category.code)} data-testid={`question-ledger-nav-${section.value}-${category.code}`}>{category.name}</Button>; })}</div>}</div>)}</div></nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6" data-testid="question-ledger-question-area">
            <div className="mb-5 border-b border-stone-100 pb-4"><h2 className={`font-heading text-xl font-bold ${sectionHeadingClasses[activeSection] || 'text-stone-950'}`} data-testid="question-ledger-active-group">{groups.find((section) => section.value === activeSection)?.label} · {categoriesFor(activeSection).find((category) => category.code === activeCategory)?.name || 'No enabled subcategory'}</h2></div>
            <QuestionDraftCard draft={draft} onChange={setDraft} onAddToList={addDraftToList} scoringLocked={scoringLocked} />
            <ConfiguredQuestionList items={configuredItems} scoringLocked={scoringLocked} />
          </div>
        </div>
        <DialogFooter className="border-t border-stone-200 px-6 py-4"><Button variant="outline" onClick={requestClose} data-testid="cancel-question-ledger">Close</Button><Button className="bg-emerald-800 text-white hover:bg-emerald-900" onClick={saveChanges} disabled={saving || changes.length === 0} data-testid="save-question-ledger">{saving ? 'Saving…' : `Save ${changes.length} change(s)`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(isOpen) => !isOpen && setConfirmation(null)}><AlertDialogContent data-testid="question-ledger-unsaved-confirmation"><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>{confirmation?.type === 'close' ? 'You have unsaved question changes. Close without saving them?' : 'The current question draft has not been added to the list. Discard it and change category?'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="keep-question-ledger-changes-button">Keep editing</AlertDialogCancel><AlertDialogAction onClick={confirmDiscard} className="bg-rose-700 text-white hover:bg-rose-800" data-testid="discard-question-ledger-changes-button">Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
};