import React, { useState } from 'react';
import { Mail, Plus, Trash2, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MISRecipientsEditor({ recipients, onChange }) {
  const [draft, setDraft] = useState({ name: '', email: '' });
  const [error, setError] = useState('');
  const addRecipient = () => {
    if (!draft.name.trim() || !emailPattern.test(draft.email.trim())) return setError('Enter a recipient name and valid email address.');
    if (recipients.some((recipient) => recipient.email.toLowerCase() === draft.email.trim().toLowerCase())) return setError('This recipient is already included.');
    onChange([...recipients, { id: crypto.randomUUID(), name: draft.name.trim(), email: draft.email.trim() }]); setDraft({ name: '', email: '' }); setError('');
  };
  return <section data-testid="mis-recipients-editor"><div className="flex flex-col justify-between gap-2 border-b border-emerald-950/10 pb-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Recipients</p><h2 className="mt-1 text-lg font-semibold text-stone-950">Build the audience for this report</h2></div><span className="text-sm text-stone-500" data-testid="mis-recipients-count">{recipients.length} recipient{recipients.length === 1 ? '' : 's'}</span></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_1.25fr_auto]" data-testid="mis-recipient-add-form"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" aria-label="Recipient name" data-testid="mis-recipient-name-input" /><Input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="email@company.com" type="email" aria-label="Recipient email" data-testid="mis-recipient-email-input" /><Button type="button" onClick={addRecipient} className="bg-emerald-900 text-white hover:bg-emerald-800" data-testid="mis-recipient-add-button"><Plus className="h-4 w-4" />Add</Button></div>
    {error && <p className="mt-2 text-sm text-red-700" role="alert" data-testid="mis-recipient-validation-error">{error}</p>}
    <div className="mt-5 space-y-2" data-testid="mis-recipient-list">{recipients.length ? recipients.map((recipient) => <div key={recipient.id || recipient.email} className="flex items-center justify-between gap-3 border border-emerald-950/10 bg-white p-3 shadow-sm" data-testid={`mis-recipient-row-${recipient.id || recipient.email}`}><div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-semibold text-stone-900"><UserRound className="h-4 w-4 text-emerald-800" />{recipient.name}</p><p className="mt-1 flex items-center gap-2 truncate text-sm text-stone-500"><Mail className="h-3.5 w-3.5" />{recipient.email}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => onChange(recipients.filter((item) => item !== recipient))} className="text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${recipient.email}`} data-testid={`mis-recipient-remove-${recipient.id || recipient.email}`}><Trash2 className="h-4 w-4" /></Button></div>) : <div className="border border-dashed border-emerald-950/20 px-4 py-6 text-sm text-stone-500" data-testid="mis-recipients-empty">Add the stakeholders who should receive this configuration.</div>}</div>
  </section>;
}