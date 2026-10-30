import React, { useState } from 'react';
import axios from 'axios';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

const API = process.env.REACT_APP_BACKEND_URL;

export const StaticNoteBlock = ({ questionKey, text, canEdit, getAuthHeader, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/api/esg-questionnaire/configs/${questionKey}`, { static_note: draft }, { headers: getAuthHeader() });
      toast.success('Note updated');
      setEditing(false);
      onSaved?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-sky-50 rounded-lg border border-sky-200" data-testid={`static-note-${questionKey}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-sky-700 uppercase tracking-wide">Methodology note</span>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => { setDraft(text); setEditing(true); }} data-testid={`static-note-edit-${questionKey}`}>
            <Pencil className="w-4 h-4" />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2 mt-1">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} data-testid={`static-note-input-${questionKey}`} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} data-testid={`static-note-save-${questionKey}`}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} data-testid={`static-note-cancel-${questionKey}`}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-primary whitespace-pre-wrap mt-1">{text}</p>
      )}
    </div>
  );
};
