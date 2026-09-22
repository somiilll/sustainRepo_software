import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { QuestionImportanceGuide } from './QuestionImportanceGuide';

const defaultRule = (responseType) => responseType === 'yes_no' ? 'boolean' : responseType === 'dropdown' ? 'choice_mapping' : 'higher_is_better';
const scoringOptions = {
  yes_no: [{ value: 'boolean', label: 'Yes/No score' }],
  numeric: [{ value: 'higher_is_better', label: 'Higher is better' }, { value: 'lower_is_better', label: 'Lower is better' }],
  percentage: [{ value: 'higher_is_better', label: 'Higher is better' }, { value: 'lower_is_better', label: 'Lower is better' }],
  dropdown: [{ value: 'choice_mapping', label: 'Choice mapping' }],
};
let draftQuestionSequence = 0;
const blankRow = (parentDraftId = null, inheritedSection = 'environment') => ({ draft_id: `draft-question-${++draftQuestionSequence}`, parent_draft_id: parentDraftId, question_text: '', category: inheritedSection, question_category: 'policy', response_type: 'yes_no', importance: 'medium', scoring_rule: 'boolean', required: true, evidence_requirement: 'not_required', options_text: '', option_scores: {}, yes_score: 100, no_score: 0 });
const dropdownValues = (row) => row.options_text.split(',').map((value) => value.trim()).filter(Boolean);

const LedgerCell = ({ label, children }) => <div className="min-w-0 space-y-1.5"><Label className="text-xs font-medium text-stone-500">{label}</Label>{children}</div>;

export const QuestionLedgerDialog = ({ open, onOpenChange, onSave, saving }) => {
  const [rows, setRows] = useState([blankRow()]);
  useEffect(() => { if (open) setRows([blankRow()]); }, [open]);
  const updateRow = (index, patch) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const updateSection = (index, category) => setRows((current) => {
    const parent = current[index];
    if (!parent) return current;
    return current.map((row, rowIndex) => rowIndex === index || row.parent_draft_id === parent.draft_id ? { ...row, category } : row);
  });
  const addSubquestion = (index) => setRows((current) => {
    const parent = current[index];
    if (!parent || parent.parent_draft_id) return current;
    let insertionIndex = index + 1;
    while (current[insertionIndex]?.parent_draft_id === parent.draft_id) insertionIndex += 1;
    return [...current.slice(0, insertionIndex), blankRow(parent.draft_id, parent.category), ...current.slice(insertionIndex)];
  });
  const removeRow = (index) => setRows((current) => {
    const row = current[index];
    if (!row) return current;
    const rootCount = current.filter((item) => !item.parent_draft_id).length;
    if (!row.parent_draft_id && rootCount === 1) return current;
    const removedIds = new Set([row.draft_id]);
    return current.filter((item, rowIndex) => rowIndex !== index && !removedIds.has(item.parent_draft_id));
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[96vw] max-w-7xl flex-col gap-0 overflow-hidden bg-white p-0" data-testid="question-ledger-dialog">
      <DialogHeader className="border-b border-emerald-100 bg-emerald-50 px-6 py-5"><DialogTitle>Add questions</DialogTitle><DialogDescription>Build questions in the ledger below. Scoring choices adapt automatically to each response type.</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"><QuestionImportanceGuide testId="question-ledger-importance-weighting-guide" />
        <div className="mt-4" data-testid="question-ledger-rows">
          <div className="space-y-3">{rows.map((row, index) => {
            const isSubquestion = Boolean(row.parent_draft_id);
            const parent = rows.find((candidate) => candidate.draft_id === row.parent_draft_id);
            return <div key={row.draft_id} className={`grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(11rem,1.3fr)_7rem_7.5rem_8rem_6rem_minmax(14rem,1.1fr)_5rem_8rem_10rem] xl:items-start ${isSubquestion ? 'ml-4 border-emerald-200 bg-emerald-50/30 sm:ml-8' : 'border-stone-200'}`} data-testid={`question-ledger-row-${index}`}>
            {isSubquestion && <div className="sm:col-span-2 xl:col-span-9 flex items-center gap-2 text-xs font-medium text-emerald-800" data-testid={`question-ledger-subquestion-label-${index}`}><span aria-hidden="true">↳</span> Follow-up to {parent?.question_text?.trim() || 'parent question'}</div>}
            <LedgerCell label="Question"><Input value={row.question_text} onChange={(event) => updateRow(index, { question_text: event.target.value })} placeholder="Question text" data-testid={`question-ledger-text-${index}`} /></LedgerCell>
            <LedgerCell label="Section"><Select value={row.category} onValueChange={(category) => updateSection(index, category)} disabled={isSubquestion}><SelectTrigger data-testid={`question-ledger-section-${index}`}><SelectValue /></SelectTrigger><SelectContent data-testid={`question-ledger-section-options-${index}`}><SelectItem value="environment">Environment</SelectItem><SelectItem value="social">Social</SelectItem><SelectItem value="governance">Governance</SelectItem></SelectContent></Select></LedgerCell>
            <LedgerCell label="Category"><Select value={row.question_category} onValueChange={(question_category) => updateRow(index, { question_category })}><SelectTrigger data-testid={`question-ledger-category-${index}`}><SelectValue /></SelectTrigger><SelectContent data-testid={`question-ledger-category-options-${index}`}><SelectItem value="policy">Policy</SelectItem><SelectItem value="reporting">Reporting</SelectItem><SelectItem value="certification">Certification</SelectItem></SelectContent></Select></LedgerCell>
            <LedgerCell label="Response type"><Select value={row.response_type} onValueChange={(response_type) => updateRow(index, { response_type, scoring_rule: defaultRule(response_type), options_text: response_type === 'dropdown' ? row.options_text : '' })}><SelectTrigger data-testid={`question-ledger-response-type-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes_no">Yes / No</SelectItem><SelectItem value="numeric">Numeric</SelectItem><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="dropdown">Dropdown</SelectItem></SelectContent></Select></LedgerCell>
            <LedgerCell label="Importance"><Select value={row.importance} onValueChange={(importance) => updateRow(index, { importance })}><SelectTrigger data-testid={`question-ledger-importance-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></LedgerCell>
            <LedgerCell label="Scoring"><Select value={row.scoring_rule} onValueChange={(scoring_rule) => updateRow(index, { scoring_rule })}><SelectTrigger data-testid={`question-ledger-scoring-${index}`}><SelectValue /></SelectTrigger><SelectContent data-testid={`question-ledger-scoring-options-${index}`}>{(scoringOptions[row.response_type] || scoringOptions.yes_no).map((option) => <SelectItem key={option.value} value={option.value} data-testid={`question-ledger-scoring-option-${index}-${option.value}`}>{option.label}</SelectItem>)}</SelectContent></Select></LedgerCell>
            <LedgerCell label="Required"><label className="flex h-10 items-center gap-2 text-sm"><Checkbox checked={row.required} onCheckedChange={(required) => updateRow(index, { required: Boolean(required) })} data-testid={`question-ledger-required-${index}`} />Yes</label></LedgerCell>
            <LedgerCell label="Evidence"><Select value={row.evidence_requirement} onValueChange={(evidence_requirement) => updateRow(index, { evidence_requirement })}><SelectTrigger data-testid={`question-ledger-evidence-requirement-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_required">No evidence</SelectItem><SelectItem value="optional">Optional</SelectItem><SelectItem value="required">Required</SelectItem></SelectContent></Select></LedgerCell>
            <LedgerCell label="Actions"><div className="flex h-10 items-center gap-1">{!isSubquestion && <Button variant="outline" size="sm" className="border-emerald-200 bg-emerald-50 px-2 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950" onClick={() => addSubquestion(index)} data-testid={`add-subquestion-ledger-row-${index}`}><Plus className="mr-1 h-4 w-4" />Follow-up</Button>}<Button variant="ghost" size="icon" className="h-10 w-10 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeRow(index)} disabled={!isSubquestion && rows.filter((item) => !item.parent_draft_id).length === 1} aria-label={`Delete question ${index + 1}`} data-testid={`remove-question-ledger-row-${index}`}><Trash2 className="h-4 w-4" /></Button></div></LedgerCell>
            {row.response_type === 'yes_no' && <div className="grid gap-3 rounded-md border border-stone-200 bg-white p-3 sm:col-span-2 sm:grid-cols-2 xl:col-span-9" data-testid={`question-ledger-yes-no-scores-${index}`}><div><Label className="text-xs">Yes score</Label><Input type="number" min="0" max="100" value={row.yes_score} onChange={(event) => updateRow(index, { yes_score: event.target.value })} data-testid={`question-ledger-yes-score-${index}`} /></div><div><Label className="text-xs">No score</Label><Input type="number" min="0" max="100" value={row.no_score} onChange={(event) => updateRow(index, { no_score: event.target.value })} data-testid={`question-ledger-no-score-${index}`} /></div></div>}
            {row.response_type === 'dropdown' && <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3 sm:col-span-2 xl:col-span-9" data-testid={`question-ledger-dropdown-config-${index}`}><div><Label className="text-xs">Options</Label><Input value={row.options_text} onChange={(event) => updateRow(index, { options_text: event.target.value })} placeholder="Option A, Option B" data-testid={`question-ledger-options-${index}`} /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dropdownValues(row).map((value) => <div key={value}><Label className="text-xs">{value} score</Label><Input type="number" min="0" max="100" value={row.option_scores[value] ?? ''} onChange={(event) => updateRow(index, { option_scores: { ...row.option_scores, [value]: event.target.value } })} data-testid={`question-ledger-option-score-${index}-${value}`} /></div>)}</div></div>}
          </div>})}</div>
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setRows((current) => [...current, blankRow()])} data-testid="add-question-ledger-row"><Plus className="mr-1 h-4 w-4" />Add question</Button>
      </div>
      <DialogFooter className="border-t border-stone-200 px-6 py-4"><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="cancel-question-ledger">Cancel</Button><Button onClick={() => onSave(rows)} disabled={saving} data-testid="save-question-ledger">{saving ? 'Adding…' : `Add ${rows.length} question${rows.length === 1 ? '' : 's'}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};