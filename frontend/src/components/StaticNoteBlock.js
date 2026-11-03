import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

const API = process.env.REACT_APP_BACKEND_URL;

export const StaticNoteBlock = ({ questionKey, text, editing, onClose, getAuthHeader, onSaved }) => {
  const [draft, setDraft] = useState(text);
  useEffect(() => { if (editing) setDraft(text); }, [editing, text]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/esg-questionnaire/configs/${questionKey}`, { static_note: draft }, { headers: getAuthHeader() });
      toast.success('Note updated');
      onClose();
      onSaved?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-white rounded-lg border border-stone-200 min-h-[60px]" data-testid={`static-note-${questionKey}`}>
      {!editing && <p className="text-sm text-text-primary whitespace-pre-wrap">{text}</p>}
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} data-testid={`static-note-input-${questionKey}`} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} data-testid={`static-note-save-${questionKey}`}>Save</Button>
            <Button size="sm" variant="outline" onClick={onClose} data-testid={`static-note-cancel-${questionKey}`}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
