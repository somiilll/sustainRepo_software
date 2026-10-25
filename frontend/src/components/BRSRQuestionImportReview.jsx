import React, { useState } from 'react';
import { AlertTriangle, Check, Pencil, X } from 'lucide-react';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';


const formatValue = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 });


export const BRSRQuestionImportReview = ({ proposals, isEditing, busyId, onDecision }) => {
  const [editingId, setEditingId] = useState(null);
  const [editedValue, setEditedValue] = useState('');

  if (!proposals?.length) return null;

  const startEdit = (proposal) => {
    setEditingId(proposal.mapping_id);
    setEditedValue(String(proposal.proposed_value));
  };

  const submitEdit = async (proposal) => {
    const saved = await onDecision(proposal, 'edit', editedValue);
    if (saved) setEditingId(null);
  };

  return (
    <div className="mt-3 border-y border-emerald-100 bg-emerald-50/40" data-testid={`brsr-question-imports-${proposals[0].question_key}`}>
      {proposals.map((proposal) => {
        const id = proposal.mapping_id;
        const reviewable = ['pending', 'stale'].includes(proposal.status);
        return (
          <div key={id} className="flex flex-col gap-3 border-b border-emerald-100 px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between" data-testid={`brsr-question-import-${id}`}>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100" data-testid={`brsr-import-source-${id}`}>
                  Imported from: {proposal.source_tag}
                </Badge>
                {proposal.status === 'stale' && (
                  <Badge className="gap-1 bg-amber-100 text-amber-800" data-testid={`brsr-import-status-${id}`}>
                    <AlertTriangle className="h-3 w-3" /> Source changed
                  </Badge>
                )}
                {['accepted', 'edited'].includes(proposal.status) && (
                  <Badge className="bg-sky-100 text-sky-800" data-testid={`brsr-import-status-${id}`}>
                    {proposal.status === 'edited' ? 'Accepted with edit' : 'Accepted'}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm" data-testid={`brsr-import-contributors-${id}`}>
                {proposal.contributing_kpis.map((kpi) => (
                  <React.Fragment key={kpi.kpi_id}>
                    <span className="font-medium text-stone-800">{kpi.metric_name}</span>
                    <span className="tabular-nums text-stone-600">{formatValue(kpi.value)} {kpi.unit || ''}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="mr-1 text-lg font-bold tabular-nums text-stone-950" data-testid={`brsr-import-value-${id}`}>
                {formatValue(proposal.proposed_value)} <span className="text-xs font-medium text-stone-500">{proposal.unit || ''}</span>
              </span>
              {editingId === id ? (
                <>
                  <Input
                    type="number"
                    step="any"
                    value={editedValue}
                    onChange={(event) => setEditedValue(event.target.value)}
                    className="h-8 w-28"
                    data-testid={`brsr-import-edit-input-${id}`}
                  />
                  <Button size="icon" className="h-8 w-8" onClick={() => submitEdit(proposal)} disabled={busyId === id || editedValue === ''} title="Save edited value" data-testid={`brsr-import-save-edit-${id}`}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)} disabled={busyId === id} title="Cancel edit" data-testid={`brsr-import-cancel-edit-${id}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : reviewable ? (
                <>
                  <Button size="icon" className="h-8 w-8 bg-emerald-700 hover:bg-emerald-800" onClick={() => onDecision(proposal, 'accept')} disabled={busyId === id || !isEditing} title="Accept imported value" data-testid={`brsr-import-accept-${id}`}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => startEdit(proposal)} disabled={busyId === id || !isEditing} title="Edit imported value" data-testid={`brsr-import-edit-${id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onDecision(proposal, 'reject')} disabled={busyId === id || !isEditing} title="Reject imported value" data-testid={`brsr-import-reject-${id}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Check className="h-5 w-5 text-sky-700" data-testid={`brsr-import-reviewed-${id}`} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};