import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Calendar, Check, Lock, Mail, Pencil, Phone, ShieldCheck, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', user: 'User' };
const ROLE_NOTES = {
  super_admin: 'Full platform access across every organization',
  admin: 'Manage users, facilities and approvals for your organization',
  user: 'Enter data and complete the tasks assigned to you',
};
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500';
const CARD = 'rounded-2xl border border-stone-200 bg-white shadow-sm';

const EditableField = ({ id, label, icon: Icon, value, placeholder, type = 'text', onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const start = () => { setDraft(value || ''); setEditing(true); };
  const save = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setEditing(false);
  };
  return (
    <div className="py-4" data-testid={`profile-field-${id}`}>
      <label className={LABEL} htmlFor={`profile-${id}-input`}>{label}</label>
      {editing ? (
        <div className="flex items-center gap-2">
          <Input id={`profile-${id}-input`} type={type} autoFocus value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} className="h-10 bg-stone-50" data-testid={`profile-${id}-input`} />
          <Button size="icon" onClick={save} disabled={saving} className="h-10 w-10 shrink-0 bg-emerald-700 text-white hover:bg-emerald-800" aria-label={`Save ${label}`} data-testid={`profile-save-${id}-btn`}><Check className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => setEditing(false)} className="h-10 w-10 shrink-0" aria-label={`Cancel ${label}`} data-testid={`profile-cancel-${id}-btn`}><X className="h-4 w-4" /></Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0 text-stone-400" />
            <span className={`truncate text-sm font-medium ${value ? 'text-stone-900' : 'text-stone-400'}`} data-testid={`profile-${id}-value`}>{value || 'Not added yet'}</span>
          </div>
          <button type="button" onClick={start} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50" data-testid={`profile-edit-${id}-btn`}>
            <Pencil className="h-3.5 w-3.5" />{value ? 'Edit' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
};

export default function Profile() {
  const { user, getAuthHeader, refreshUser } = useAuth();
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    if (!user?.organization_id) return;
    axios.get(`${API}/organizations/my`, { headers: getAuthHeader() })
      .then(({ data }) => setOrgName(data.organization_name || data.name || ''))
      .catch(() => setOrgName(''));
  }, [user?.organization_id]);

  const saveField = (field, okMessage) => async (value) => {
    try {
      await axios.put(`${API}/auth/profile`, { [field]: value.trim() }, { headers: getAuthHeader() });
      toast.success(okMessage);
      if (refreshUser) await refreshUser();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not save your change');
      return false;
    }
  };

  const name = user?.full_name || user?.email || '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <div className="space-y-6" data-testid="profile-page">
      <section className={`${CARD} overflow-hidden`} data-testid="profile-cover-banner">
        <div className="relative h-36 w-full bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 sm:h-44">
          <div className="absolute inset-0 opacity-20 [background-size:16px_16px] [background-image:radial-gradient(#34d399_1px,transparent_1px)]" />
          <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>
        <div className="relative z-10 -mt-12 flex flex-col items-center gap-5 px-6 pb-6 text-center sm:-mt-14 sm:flex-row sm:items-start sm:px-8 sm:text-left">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-emerald-600 to-teal-700 text-3xl font-bold text-white shadow-md ring-1 ring-stone-900/5 sm:h-28 sm:w-28" data-testid="profile-avatar-circle">{initials}</div>
          <div className="min-w-0 flex-1 sm:pt-16">
            <h1 className="truncate text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl" data-testid="profile-user-name">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-stone-500 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800" data-testid="profile-role-badge">{ROLE_LABELS[user?.role] || user?.role}</span>
              {orgName && <span className="inline-flex items-center gap-1.5" data-testid="profile-organization-name"><Building2 className="h-4 w-4 text-stone-400" />{orgName}</span>}
              {since && <span className="inline-flex items-center gap-1.5" data-testid="profile-member-since-date"><Calendar className="h-4 w-4 text-stone-400" />Member since {since}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <section className={`${CARD} p-6 lg:col-span-3`} data-testid="profile-personal-card">
          <div className="mb-3 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700"><User className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-stone-900">Personal information</h2>
              <p className="text-sm text-stone-500">Your name and how we can reach you</p>
            </div>
          </div>
          <div className="divide-y divide-stone-100">
            <EditableField id="name" label="Full name" icon={User} value={user?.full_name} placeholder="Your full name" onSave={saveField('full_name', 'Name updated')} />
            <div className="py-4" data-testid="profile-field-email">
              <span className={LABEL}>Email address</span>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5"><Mail className="h-4 w-4 shrink-0 text-stone-400" /><span className="truncate text-sm font-medium text-stone-900" data-testid="profile-email-readonly">{user?.email}</span></div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500"><Lock className="h-3 w-3" />Sign-in email</span>
              </div>
            </div>
            <EditableField id="recovery-email" label="Recovery email" icon={Mail} type="email" value={user?.recovery_email} placeholder="name@example.com" onSave={saveField('recovery_email', 'Recovery email updated')} />
            <EditableField id="recovery-mobile" label="Recovery mobile" icon={Phone} type="tel" value={user?.recovery_mobile} placeholder="+91 98765 43210" onSave={saveField('recovery_mobile', 'Recovery mobile updated')} />
          </div>
        </section>

        <section className={`${CARD} p-6 lg:col-span-2`} data-testid="profile-access-card">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-stone-900">Role and access</h2>
              <p className="text-sm text-stone-500">Set by your administrator</p>
            </div>
          </div>
          <div className="rounded-xl border border-stone-100 bg-stone-50 p-4">
            <span className={LABEL}>Role</span>
            <div className="text-base font-semibold text-stone-900" data-testid="profile-role-value">{ROLE_LABELS[user?.role] || user?.role}</div>
            <p className="mt-1 text-sm text-stone-500">{ROLE_NOTES[user?.role]}</p>
          </div>
          <Link to="/account-settings" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline" data-testid="profile-manage-security-link">Manage password and subscription<ArrowRight className="h-4 w-4" /></Link>
        </section>
      </div>
    </div>
  );
}
