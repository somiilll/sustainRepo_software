import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Building,
  Building2,
  Users,
  UserCog,
  Search,
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  X,
  Filter as FilterIcon,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPIRY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring_7', label: 'Expiring in ≤ 7 days' },
  { value: 'expiring_30', label: 'Expiring in ≤ 30 days' },
  { value: 'expiring_90', label: 'Expiring in ≤ 90 days' },
  { value: 'no_expiry', label: 'No expiry set' },
];

const PAYMENT_STATUSES = ['Active', 'Pending', 'Overdue'];

function computeExpiryState(iso) {
  if (!iso) return { state: 'none', daysLeft: null };
  const exp = new Date(iso);
  if (Number.isNaN(exp.getTime())) return { state: 'none', daysLeft: null };
  const diffMs = exp - new Date();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { state: 'expired', daysLeft };
  if (daysLeft <= 7) return { state: 'critical', daysLeft };
  if (daysLeft <= 30) return { state: 'warning', daysLeft };
  return { state: 'ok', daysLeft };
}

function expiryBadge({ state, daysLeft }, iso) {
  if (state === 'none') {
    return <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200">No expiry</Badge>;
  }
  const formatted = iso ? new Date(iso).toLocaleDateString() : '';
  if (state === 'expired') {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
        Expired {Math.abs(daysLeft)}d ago · {formatted}
      </Badge>
    );
  }
  if (state === 'critical') {
    return (
      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
        Expiring in {daysLeft}d · {formatted}
      </Badge>
    );
  }
  if (state === 'warning') {
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
        {daysLeft}d left · {formatted}
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      {daysLeft}d left · {formatted}
    </Badge>
  );
}

function paymentBadge(status) {
  if (!status) return null;
  const cls =
    status === 'Active'
      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
      : status === 'Pending'
      ? 'bg-amber-100 text-amber-700 hover:bg-amber-100'
      : status === 'Overdue'
      ? 'bg-red-100 text-red-700 hover:bg-red-100'
      : 'bg-stone-200 text-stone-700 hover:bg-stone-200';
  return <Badge className={cls}>{status}</Badge>;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const { getAuthHeader } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/super-admin/dashboard`, { headers: getAuthHeader() });
        setStats(res.data);
      } catch (e) {
        if (e.response?.status !== 404) console.error('Dashboard fetch error:', e);
        setStats({
          total_organizations: 0,
          total_facilities: 0,
          total_admins: 0,
          total_users: 0,
          organization_stats: [],
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [getAuthHeader]);

  // Only keep active (non-deactivated, non-deleted) orgs
  const activeOrgs = useMemo(
    () => (stats?.organization_stats || []).filter((o) => o.is_active && !o.is_deleted),
    [stats],
  );

  // Enrich with computed expiry state
  const enrichedOrgs = useMemo(
    () =>
      activeOrgs.map((o) => ({
        ...o,
        expiry: computeExpiryState(o.subscription_expires_at),
      })),
    [activeOrgs],
  );

  // Counts for the summary cards
  const expiringSoonCount = useMemo(
    () => enrichedOrgs.filter((o) => ['expired', 'critical', 'warning'].includes(o.expiry.state)).length,
    [enrichedOrgs],
  );
  const expiredCount = useMemo(
    () => enrichedOrgs.filter((o) => o.expiry.state === 'expired').length,
    [enrichedOrgs],
  );
  const overdueCount = useMemo(
    () => enrichedOrgs.filter((o) => o.payment_status === 'Overdue').length,
    [enrichedOrgs],
  );

  const filteredOrgs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return enrichedOrgs.filter((o) => {
      if (term && !o.organization_name.toLowerCase().includes(term)) return false;

      if (expiryFilter === 'expired' && o.expiry.state !== 'expired') return false;
      if (expiryFilter === 'expiring_7' && !(o.expiry.daysLeft !== null && o.expiry.daysLeft >= 0 && o.expiry.daysLeft <= 7)) return false;
      if (expiryFilter === 'expiring_30' && !(o.expiry.daysLeft !== null && o.expiry.daysLeft >= 0 && o.expiry.daysLeft <= 30)) return false;
      if (expiryFilter === 'expiring_90' && !(o.expiry.daysLeft !== null && o.expiry.daysLeft >= 0 && o.expiry.daysLeft <= 90)) return false;
      if (expiryFilter === 'no_expiry' && o.expiry.state !== 'none') return false;

      if (paymentFilter !== 'all' && (o.payment_status || '') !== paymentFilter) return false;
      return true;
    });
  }, [enrichedOrgs, searchTerm, expiryFilter, paymentFilter]);

  const hasActiveFilter = searchTerm || expiryFilter !== 'all' || paymentFilter !== 'all';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }
  if (!stats) return null;

  const activeFacilities = enrichedOrgs.reduce((s, o) => s + (o.total_facilities || 0), 0);
  const activeAdmins = enrichedOrgs.reduce((s, o) => s + (o.total_admins || 0), 0);
  const activeUsers = enrichedOrgs.reduce((s, o) => s + (o.total_users || 0), 0);

  return (
    <div className="space-y-6" data-testid="super-admin-dashboard">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Super Admin Dashboard</h1>
        <p className="text-text-secondary">Active organisations only · deactivated/deleted are hidden.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Active Organizations</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{enrichedOrgs.length}</p>
            </div>
            <div className="bg-primary/10 p-3 rounded-lg">
              <Building className="w-6 h-6 text-primary" />
            </div>
          </div>
        </Card>
        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Facilities</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{activeFacilities}</p>
            </div>
            <div className="bg-secondary/10 p-3 rounded-lg">
              <Building2 className="w-6 h-6 text-secondary" />
            </div>
          </div>
        </Card>
        <Card className={`p-6 border rounded-xl bg-white hover:shadow-lg transition-shadow ${expiringSoonCount > 0 ? 'border-orange-300' : 'border-stone-200'}`} data-testid="summary-expiring">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Expiring ≤ 30 days</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{expiringSoonCount}</p>
              {expiredCount > 0 && (
                <p className="text-xs text-red-600 mt-1 font-medium">
                  {expiredCount} already expired
                </p>
              )}
            </div>
            <div className={`p-3 rounded-lg ${expiringSoonCount > 0 ? 'bg-orange-50' : 'bg-stone-100'}`}>
              <CalendarClock className={`w-6 h-6 ${expiringSoonCount > 0 ? 'text-orange-600' : 'text-stone-400'}`} />
            </div>
          </div>
        </Card>
        <Card className={`p-6 border rounded-xl bg-white hover:shadow-lg transition-shadow ${overdueCount > 0 ? 'border-red-300' : 'border-stone-200'}`} data-testid="summary-overdue">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Overdue Payments</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{overdueCount}</p>
              <p className="text-xs text-text-muted mt-1">
                Admins: {activeAdmins} · Users: {activeUsers}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${overdueCount > 0 ? 'bg-red-50' : 'bg-stone-100'}`}>
              <CircleDollarSign className={`w-6 h-6 ${overdueCount > 0 ? 'text-red-600' : 'text-stone-400'}`} />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 border border-stone-200 rounded-xl bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <FilterIcon className="w-4 h-4" /> Filter
          </div>
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search organisation…"
              className="pl-9 bg-stone-50"
              data-testid="dashboard-search"
            />
          </div>
          <Select value={expiryFilter} onValueChange={setExpiryFilter}>
            <SelectTrigger className="w-[220px]" data-testid="expiry-filter">
              <SelectValue placeholder="Validity" />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_FILTERS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[180px]" data-testid="payment-filter">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              {PAYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setExpiryFilter('all');
                setPaymentFilter('all');
              }}
              data-testid="clear-filters"
            >
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          )}
          <div className="ml-auto text-sm text-text-muted">
            Showing <span className="font-semibold text-text-primary">{filteredOrgs.length}</span> of {enrichedOrgs.length}
          </div>
        </div>
      </Card>

      {/* Org list */}
      <div className="grid grid-cols-1 gap-4">
        <h3 className="text-lg font-heading font-bold text-text-primary">Organisations</h3>
        {filteredOrgs.length > 0 ? (
          filteredOrgs.map((org) => (
            <Card
              key={org.organization_id}
              className={`p-6 border rounded-xl hover:shadow-lg transition-shadow ${
                org.expiry.state === 'expired'
                  ? 'border-red-300 bg-red-50/30'
                  : org.expiry.state === 'critical'
                  ? 'border-orange-300 bg-orange-50/30'
                  : 'border-stone-200 bg-white'
              }`}
              data-testid={`dashboard-org-${org.organization_id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xl font-heading font-bold text-text-primary">
                    {org.organization_name}
                  </h4>
                  {expiryBadge(org.expiry, org.subscription_expires_at)}
                  {paymentBadge(org.payment_status)}
                  {org.selected_plan && (
                    <Badge variant="outline" className="text-xs">{org.selected_plan}</Badge>
                  )}
                  {org.country && (
                    <Badge variant="outline" className="text-xs text-text-muted">{org.country}</Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <p className="text-xs text-text-muted mb-1">Facilities</p>
                  <p className="text-lg font-medium text-text-primary">
                    {org.total_facilities} <span className="text-xs text-text-muted">/ {org.max_facilities}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">Admins</p>
                  <p className="text-lg font-medium text-blue-600">
                    {org.total_admins} <span className="text-xs text-text-muted">/ {org.max_admins}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">Users</p>
                  <p className="text-lg font-medium text-green-600">
                    {org.total_users} <span className="text-xs text-text-muted">/ {org.max_users}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">Facility usage</p>
                  <div className="w-full bg-stone-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${Math.min((org.total_facilities / Math.max(org.max_facilities, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">Admin usage</p>
                  <div className="w-full bg-stone-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${Math.min((org.total_admins / Math.max(org.max_admins, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">User usage</p>
                  <div className="w-full bg-stone-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${Math.min((org.total_users / Math.max(org.max_users, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              {org.expiry.state === 'expired' && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  Subscription expired — org will be auto-deactivated on next server check.
                </div>
              )}
            </Card>
          ))
        ) : (
          <div className="text-center py-12 text-text-muted">
            {hasActiveFilter ? 'No organisations match the current filters.' : 'No active organisations yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
