import React from 'react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { QuestionDraftCard } from './QuestionDraftCard';

export const EditQuestionDialog = ({ open, onOpenChange, draft, onDraftChange, onSave, saving, scoringLocked, sections, categoriesForSection }) => {
  const setDraftField = (patch) => onDraftChange({ ...draft, ...patch });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl" data-testid="edit-question-dialog">
      <DialogHeader>
        <DialogTitle>Edit question</DialogTitle>
        <DialogDescription>Update the supplier prompt, response options, scoring, and evidence rules.</DialogDescription>
      </DialogHeader>
      {draft && <div className="space-y-5 py-2">
        <QuestionDraftCard draft={draft} onChange={onDraftChange} onAddToList={onSave} scoringLocked={scoringLocked} showSubmitButton={false} />
        <section className="border-t border-stone-200 pt-5" data-testid="edit-question-placement-section">
          <h3 className="font-heading text-lg font-bold text-emerald-900">Question placement</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Section</Label><Select value={draft.category} onValueChange={(category) => setDraftField({ category, question_category: categoriesForSection(category)[0]?.code || '' })}><SelectTrigger data-testid="question-section-select"><SelectValue /></SelectTrigger><SelectContent>{sections.map((section) => <SelectItem key={section.value} value={section.value}>{section.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Category</Label><Select value={draft.question_category} onValueChange={(question_category) => setDraftField({ question_category })}><SelectTrigger data-testid="question-category-select"><SelectValue /></SelectTrigger><SelectContent>{categoriesForSection(draft.category).map((category) => <SelectItem key={category.code} value={category.code}>{category.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </section>
      </div>}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="cancel-edit-question-button">Cancel</Button>
        <Button onClick={onSave} disabled={saving} data-testid="save-question-btn">{saving ? 'Saving...' : 'Update'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};