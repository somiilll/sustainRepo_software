import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Plus, Search, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const EMPTY_FORM = { email: '', full_name: '', organization_id: '', role: 'user' };

const roleMeta = {
  admin: { label: 'Admin', icon: UserCog, className: 'bg-amber-100 text-amber-800' },
  user: { label: 'User', icon: Users, className: 'bg-emerald-100 text-emerald-800' },
};

export default function AdminManagement() {
  const [accounts, setAccounts] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const { getAuthHeader } = useAuth();

  const fetchData = async () => {
    try {
      const [orgsResponse, accountsResponse] = await Promise.all([
        axios.get(`${API}/super-admin/organizations`, { headers: getAuthHeader() }),
        axios.get(`${API}/super-admin/accounts`, { headers: getAuthHeader() }),
      ]);
      setOrganizations(orgsResponse.data);
      setAccounts(accountsResponse.data);
    } catch (error) {
      console.error('Team account management fetch error:', error);
      toast.error(error.response?.data?.detail || 'Unable to load team accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getOrganizationName = (organizationId) => (
    organizations.find((organization) => organization.id === organizationId)?.name || 'N/A'
  );

  const filteredAccounts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) => [
      account.full_name,
      account.email,
      account.role,
      getOrganizationName(account.organization_id),
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [accounts, organizations, searchTerm]);

  const resetForm = () => setFormData(EMPTY_FORM);

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      await axios.post(`${API}/super-admin/accounts`, formData, { headers: getAuthHeader() });
      toast.success(`${roleMeta[formData.role].label} created and invitation email sent.`, { duration: 5000 });
      setDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create account');
    }
  };

  const confirmDelete = async () => {
    if (!accountToDelete) return;
    try {
      await axios.delete(`${API}/super-admin/accounts/${accountToDelete.id}`, { headers: getAuthHeader() });
      toast.success('Account deleted successfully');
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    } finally {
      setAccountToDelete(null);
    }
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center" data-testid="team-accounts-loading"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-7" data-testid="team-accounts-page">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-emerald-100 pb-6">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700" data-testid="team-accounts-heading-icon"><ShieldCheck className="h-6 w-6" /></div>
            <h1 className="text-4xl font-heading font-bold text-text-primary">Team Accounts</h1>
          </div>
          <p className="text-text-secondary" data-testid="team-accounts-summary">{accounts.length} active accounts across organizations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-primary px-6 text-white hover:bg-primary/90" data-testid="create-team-account-button"><Plus className="mr-2 h-4 w-4" />Add account</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md" data-testid="create-team-account-dialog">
            <DialogHeader>
              <DialogTitle data-testid="create-team-account-title">Add team account</DialogTitle>
              <DialogDescription data-testid="create-team-account-description">Choose the account role and its organization.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4" data-testid="create-team-account-form">
              <div className="space-y-2">
                <Label htmlFor="account-full-name">Full name *</Label>
                <Input id="account-full-name" value={formData.full_name} onChange={(event) => setFormData({ ...formData, full_name: event.target.value })} required className="bg-stone-50" data-testid="team-account-name-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-email">Email *</Label>
                <Input id="account-email" type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} required className="bg-stone-50" data-testid="team-account-email-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-role">Account role *</Label>
                <select id="account-role" value={formData.role} onChange={(event) => setFormData({ ...formData, role: event.target.value })} className="h-10 w-full rounded-md border border-stone-200 bg-stone-50 px-3 text-sm" data-testid="team-account-role-select">
                  <option value="user" data-testid="team-account-role-user">User</option>
                  <option value="admin" data-testid="team-account-role-admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-organization">Organization *</Label>
                <select id="account-organization" value={formData.organization_id} onChange={(event) => setFormData({ ...formData, organization_id: event.target.value })} required className="h-10 w-full rounded-md border border-stone-200 bg-stone-50 px-3 text-sm" data-testid="team-account-organization-select">
                  <option value="" data-testid="team-account-organization-placeholder">Select organization</option>
                  {organizations.map((organization) => <option key={organization.id} value={organization.id} data-testid={`team-account-organization-${organization.id}`}>{organization.name}</option>)}
                </select>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800" data-testid="team-account-invitation-notice">An invitation with a temporary password will be sent by email. The account holder must change it when they first sign in.</div>
              <div className="flex justify-end gap-3 pt-3">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="cancel-team-account-button">Cancel</Button>
                <Button type="submit" className="bg-primary text-white hover:bg-primary/90" data-testid="submit-team-account-button">Create {roleMeta[formData.role].label}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input placeholder="Search name, email, role, or organization..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="bg-white pl-10" data-testid="team-account-search-input" />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredAccounts.map((account) => {
          const meta = roleMeta[account.role] || roleMeta.user;
          const RoleIcon = meta.icon;
          return <Card key={account.id} className="border border-stone-200 bg-white p-5 transition-shadow hover:shadow-md" data-testid={`team-account-card-${account.id}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-stone-100 text-stone-700" data-testid={`team-account-icon-${account.id}`}><RoleIcon className="h-5 w-5" /></div>
              <Button size="icon" variant="ghost" onClick={() => setAccountToDelete(account)} className="text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${account.full_name}`} data-testid={`delete-team-account-${account.id}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <h2 className="truncate text-xl font-heading font-bold text-text-primary" data-testid={`team-account-name-${account.id}`}>{account.full_name}</h2>
            <p className="mt-1 truncate text-sm text-text-muted" data-testid={`team-account-email-${account.id}`}>{account.email}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`} data-testid={`team-account-role-${account.id}`}>{meta.label}</span>
              {account.requires_password_change && <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800" data-testid={`team-account-password-change-${account.id}`}>Password change pending</span>}
            </div>
            <p className="mt-4 text-xs text-text-secondary" data-testid={`team-account-organization-name-${account.id}`}><span className="font-semibold">Organization:</span> {getOrganizationName(account.organization_id)}</p>
          </Card>;
        })}
      </div>

      {filteredAccounts.length === 0 && <div className="py-12 text-center text-text-secondary" data-testid="team-accounts-empty-state">{accounts.length ? 'No accounts match your search.' : 'No organization accounts yet.'}</div>}

      <AlertDialog open={Boolean(accountToDelete)} onOpenChange={(open) => { if (!open) setAccountToDelete(null); }}>
        <AlertDialogContent data-testid="delete-team-account-dialog">
          <AlertDialogHeader><AlertDialogTitle data-testid="delete-team-account-title">Delete account</AlertDialogTitle><AlertDialogDescription data-testid="delete-team-account-description">Delete <strong>{accountToDelete?.email}</strong>? They will no longer be able to sign in.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-team-account-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700" data-testid="confirm-delete-team-account-button">Delete account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}