import React, { useState } from 'react';
import { AlertTriangle, Check, Pencil, RotateCcw, X } from 'lucide-react';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';


const formatValue = (value) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })
  : value;


export const BRSRImportProposalCard = ({ proposal, isEditing, busy, onDecision }) => {
  const [editing, setEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(String(proposal.proposed_value));
  const id = proposal.mapping_id;
  const reviewable = ['pending', 'stale'].includes(proposal.status);

  const submitEdit = async () => {
    const saved = await onDecision(proposal, 'edit', editedValue);
    if (saved) setEditing(false);
  };

  return (
    <article className="border border-stone-200 bg-white p-4 shadow-sm" data-testid={`brsr-import-proposal-${id}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-50 text-emerald-800 hover:bg-emerald-50" data-testid={`brsr-import-source-${id}`}>
              Imported from: {proposal.source_tag}
            </Badge>
            <Badge variant="outline" data-testid={`brsr-import-reference-${id}`}>{proposal.reference || 'BRSR'}</Badge>
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
            {proposal.status === 'pending' && (
              <Badge variant="secondary" data-testid={`brsr-import-status-${id}`}>Pending review</Badge>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-stone-900" data-testid={`brsr-import-question-${id}`}>
              {proposal.question_label}
            </p>
            <p className="mt-1 break-words text-xs text-stone-500" data-testid={`brsr-import-destination-${id}`}>
              {proposal.question_key} · {proposal.resolved_answer_path} · {proposal.reporting_period}
            </p>
          </div>

          <div className="space-y-1.5" data-testid={`brsr-import-contributors-${id}`}>
            {proposal.contributing_kpis.map((kpi) => (
              <div key={kpi.kpi_id} className="flex flex-wrap items-baseline gap-x-2 text-xs text-stone-600">
                <span className="font-medium text-stone-800">{kpi.metric_name}</span>
                <span>{formatValue(kpi.value)} {kpi.unit || ''}</span>
                <span className="text-stone-400">{kpi.record_count} source record{kpi.record_count === 1 ? '' : 's'}</span>
              </div>
            ))}
            {proposal.formula_definition && (
              <code className="block break-words text-xs text-stone-500" data-testid={`brsr-import-formula-${id}`}>
                {proposal.formula_definition}
              </code>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 border-t border-stone-100 pt-3 lg:w-72 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-xs font-medium uppercase text-stone-500">Proposed value</span>
            <span className="text-xl font-bold tabular-nums text-stone-950" data-testid={`brsr-import-value-${id}`}>
              {formatValue(proposal.proposed_value)} <span className="text-xs font-medium text-stone-500">{proposal.unit || ''}</span>
            </span>
          </div>
          {proposal.current_value !== null && proposal.current_value !== undefined && (
            <div className="flex justify-between gap-4 text-xs text-stone-500" data-testid={`brsr-import-current-value-${id}`}>
              <span>Current response</span><span>{formatValue(proposal.current_value)}</span>
            </div>
          )}

          {editing ? (
            <div className="space-y-2" data-testid={`brsr-import-edit-form-${id}`}>
              <Input
                type="number"
                step="any"
                value={editedValue}
                onChange={(event) => setEditedValue(event.target.value)}
                data-testid={`brsr-import-edit-input-${id}`}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={submitEdit} disabled={busy || editedValue === ''} data-testid={`brsr-import-save-edit-${id}`}>
                  <Check className="mr-1 h-4 w-4" /> Save edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy} data-testid={`brsr-import-cancel-edit-${id}`}>
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
              </div>
            </div>
          ) : reviewable ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onDecision(proposal, 'accept')} disabled={busy || !isEditing} data-testid={`brsr-import-accept-${id}`}>
                <Check className="mr-1 h-4 w-4" /> Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy || !isEditing} data-testid={`brsr-import-edit-${id}`}>
                <Pencil className="mr-1 h-4 w-4" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onDecision(proposal, 'reject')} disabled={busy || !isEditing} data-testid={`brsr-import-reject-${id}`}>
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-stone-500" data-testid={`brsr-import-reviewed-${id}`}>
              <RotateCcw className="h-3.5 w-3.5" /> Reviewed for this period
            </div>
          )}
        </div>
      </div>
    </article>
  );
};