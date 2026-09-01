/**
 * TargetFormModal — create / edit dialog for a single target.
 *
 * Dispatches to the per-mode form component based on `target_mode`. The
 * form hook (`useTargetForm`) owns ALL state — modal is presentational.
 */
import React, { useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';
import useTargetForm from '../hooks/useTargetForm';
import { TARGET_MODES } from '../constants';
import TotalTargetForm from './TotalTargetForm';
import ScopeTargetForm from './ScopeTargetForm';
import CategoryTargetForm from './CategoryTargetForm';

export default function TargetFormModal({
  open,
  onClose,
  initial,
  yearOptions,
  hasScope3,
  onSubmit,
  busy,
}) {
  // Re-key the form on open so editing always starts from `initial` cleanly.
  const formKey = open ? (initial?.id || 'new') : 'closed';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-y-auto"
        data-testid="target-form-modal"
      >
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Edit Target' : 'Add Target'}</DialogTitle>
        </DialogHeader>
        {open && (
          <TargetFormBody
            key={formKey}
            initial={initial}
            yearOptions={yearOptions}
            hasScope3={hasScope3}
            onSubmit={onSubmit}
            onClose={onClose}
            busy={busy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TargetFormBody({ initial, yearOptions, hasScope3, onSubmit, onClose, busy }) {
  const form = useTargetForm(initial);

  // When mode changes, reset config to a sane default for the new mode so
  // we don't carry stale shape (total → scope → category).
  useEffect(() => {
    form.setConfig(initial?.target_mode === form.mode ? initial?.target_configuration || {} : {});
     
  }, [form.mode]);

  const formContent = useMemo(() => {
    if (form.mode === 'total') {
      return (
        <TotalTargetForm
          value={form.totalConfig}
          yearOptions={yearOptions}
          onFieldChange={form.setTotalField}
          disabled={busy}
        />
      );
    }
    if (form.mode === 'scope') {
      return (
        <ScopeTargetForm
          config={form.config}
          yearOptions={yearOptions}
          hasScope3={hasScope3}
          onEntryChange={form.setEntryField}
          onClearEntry={form.clearEntry}
          disabled={busy}
        />
      );
    }
    return (
      <CategoryTargetForm
        config={form.config}
        yearOptions={yearOptions}
        hasScope3={hasScope3}
        onEntryChange={form.setEntryField}
        onClearEntry={form.clearEntry}
        disabled={busy}
      />
    );
  }, [form, yearOptions, hasScope3, busy]);

  const handleSave = async () => {
    const errs = form.validate();
    if (errs.length) {
      toast.error(errs[0]);
      return;
    }
    try {
      await onSubmit(form.buildPayload());
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save target');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-text-muted">Target Name *</Label>
          <Input
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            placeholder="e.g. Net Zero 2030"
            disabled={busy}
            data-testid="target-name-input"
          />
        </div>
        <div>
          <Label className="text-xs text-text-muted">Target Mode *</Label>
          <select
            value={form.mode}
            onChange={(e) => form.setMode(e.target.value)}
            disabled={busy}
            className="w-full px-2 py-2 text-sm border border-stone-300 rounded-md bg-white disabled:bg-stone-100"
            data-testid="target-mode-select"
          >
            {TARGET_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-stone-200 pt-4">{formContent}</div>

      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
        <Button variant="outline" onClick={onClose} disabled={busy} data-testid="target-cancel-btn">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={busy}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="target-save-btn"
        >
          {busy ? 'Saving…' : initial?.id ? 'Update Target' : 'Save Target'}
        </Button>
      </div>
    </div>
  );
}
