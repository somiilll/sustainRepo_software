import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const blankRow = () => ({ question_text: '', category: 'environment', response_type: 'yes_no', required: true, options_text: '' });

export const QuestionLedgerDialog = ({ open, onOpenChange, onSave, saving }) => {
  const [rows, setRows] = useState([blankRow()]);
  useEffect(() => { if (open) setRows([blankRow()]); }, [open]);
  const updateRow = (index, patch) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const removeRow = (index) => setRows((current) => current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index));
  const save = () => onSave(rows);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-6xl flex-col gap-0 overflow-hidden bg-white p-0" data-testid="question-ledger-dialog">
      <DialogHeader className="border-b border-emerald-100 bg-emerald-50 px-6 py-5"><DialogTitle>Add questions</DialogTitle><DialogDescription>Create several supplier questions in one ledger. Dropdown options are comma-separated.</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="hidden grid-cols-[minmax(13rem,1fr)_9rem_9rem_8rem_minmax(11rem,1fr)_2.5rem] gap-3 pb-2 text-xs font-medium uppercase text-stone-500 md:grid"><span>Question</span><span>Category</span><span>Response</span><span>Required</span><span>Dropdown options</span><span /></div>
        <div className="space-y-3" data-testid="question-ledger-rows">{rows.map((row, index) => <div key={index} className="grid gap-3 rounded-lg border border-stone-200 bg-white p-3 md:grid-cols-[minmax(13rem,1fr)_9rem_9rem_8rem_minmax(11rem,1fr)_2.5rem] md:items-center" data-testid={`question-ledger-row-${index}`}>
          <Input value={row.question_text} onChange={(event) => updateRow(index, { question_text: event.target.value })} placeholder="Question text" data-testid={`question-ledger-text-${index}`} />
          <Select value={row.category} onValueChange={(category) => updateRow(index, { category })}><SelectTrigger data-testid={`question-ledger-category-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="environment">Environment</SelectItem><SelectItem value="social">Social</SelectItem><SelectItem value="governance">Governance</SelectItem></SelectContent></Select>
          <Select value={row.response_type} onValueChange={(response_type) => updateRow(index, { response_type, options_text: response_type === 'dropdown' ? row.options_text : '' })}><SelectTrigger data-testid={`question-ledger-response-type-${index}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes_no">Yes / No</SelectItem><SelectItem value="numeric">Numeric</SelectItem><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="text">Text</SelectItem><SelectItem value="dropdown">Dropdown</SelectItem></SelectContent></Select>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={row.required} onCheckedChange={(required) => updateRow(index, { required: Boolean(required) })} data-testid={`question-ledger-required-${index}`} />Required</label>
          {row.response_type === 'dropdown' ? <Input value={row.options_text} onChange={(event) => updateRow(index, { options_text: event.target.value })} placeholder="Option A, Option B" data-testid={`question-ledger-options-${index}`} /> : <span className="text-xs text-stone-400">—</span>}
          <Button variant="ghost" size="icon" onClick={() => removeRow(index)} disabled={rows.length === 1} data-testid={`remove-question-ledger-row-${index}`}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
        </div>)}</div>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setRows((current) => [...current, blankRow()])} data-testid="add-question-ledger-row"><Plus className="mr-1 h-4 w-4" />Add row</Button>
      </div>
      <DialogFooter className="border-t border-stone-200 px-6 py-4"><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="cancel-question-ledger">Cancel</Button><Button onClick={save} disabled={saving} data-testid="save-question-ledger">{saving ? 'Adding…' : `Add ${rows.length} question${rows.length === 1 ? '' : 's'}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};