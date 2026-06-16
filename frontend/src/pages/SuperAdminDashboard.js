import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
  BarChart3,
  Leaf,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
} from 'lucide-react';
import ESGFrameworksDialog from '../components/ESGFrameworksDialog';

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
  
  // Scope 3 & Biogenic Stats Dialog
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [selectedOrgForStats, setSelectedOrgForStats] = useState(null);
  const [scope3BiogenicStats, setScope3BiogenicStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // ESG Frameworks Dialog
  const [esgFrameworksDialogOpen, setEsgFrameworksDialogOpen] = useState(false);
  const [selectedOrgForFrameworks, setSelectedOrgForFrameworks] = useState(null);
  
  const openFrameworksDialog = (org) => {
    setSelectedOrgForFrameworks(org);
    setEsgFrameworksDialogOpen(true);
  };
  
  const fetchScope3BiogenicStats = async (org) => {
    setSelectedOrgForStats(org);
    setStatsDialogOpen(true);
    setLoadingStats(true);
    setScope3BiogenicStats(null);
    setExpandedCategories({});
    
    try {
      const res = await axios.get(`${API}/super-admin/organizations/${org.organization_id}/scope3-biogenic-stats`, {
        headers: getAuthHeader()
      });
      setScope3BiogenicStats(res.data);
    } catch (e) {
      console.error('Failed to fetch Scope 3/Biogenic stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };
  
  const toggleCategoryExpand = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const fetchDashboardData = async () => {
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
  };

  useEffect(() => {
    fetchDashboardData();
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
                  {/* ESG Frameworks Badges */}
                  {org.esg_frameworks_enabled?.length > 0 && org.esg_frameworks_enabled.map(fw => (
                    <Badge 
                      key={fw} 
                      className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    >
                      {fw}
                    </Badge>
                  ))}
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
              
              {/* View Scope 3 & Biogenic Stats Button */}
              <div className="mt-3 pt-3 border-t border-stone-200 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchScope3BiogenicStats(org)}
                  className="text-xs"
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                  View Scope 3 & Biogenic Stats
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openFrameworksDialog(org)}
                  className="text-xs"
                  data-testid={`esg-frameworks-btn-${org.organization_id}`}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  ESG Frameworks
                </Button>
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
      
      {/* Scope 3 & Biogenic Stats Dialog */}
      <Dialog open={statsDialogOpen} onOpenChange={setStatsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Scope 3 & Biogenic Stats - {selectedOrgForStats?.organization_name}
            </DialogTitle>
          </DialogHeader>
          
          {loadingStats ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : scope3BiogenicStats ? (
            <div className="space-y-6">
              {/* Scope 3 Overview by Method */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Scope 3 - By Calculation Method
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white p-3 rounded-lg border border-blue-200">
                    <p className="text-xs text-text-muted mb-1">Activity Basis</p>
                    <p className="text-lg font-semibold text-blue-700">
                      {scope3BiogenicStats.scope3_by_method?.activity_basis?.count || 0} records
                    </p>
                    <p className="text-sm text-blue-600">
                      {(scope3BiogenicStats.scope3_by_method?.activity_basis?.tco2e || 0).toFixed(4)} tCO₂e
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-200">
                    <p className="text-xs text-text-muted mb-1">Spend Basis</p>
                    <p className="text-lg font-semibold text-orange-600">
                      {scope3BiogenicStats.scope3_by_method?.spend_basis?.count || 0} records
                    </p>
                    <p className="text-sm text-orange-500">
                      {(scope3BiogenicStats.scope3_by_method?.spend_basis?.tco2e || 0).toFixed(4)} tCO₂e
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-blue-200">
                    <p className="text-xs text-text-muted mb-1">Supplier Basis</p>
                    <p className="text-lg font-semibold text-purple-600">
                      {scope3BiogenicStats.scope3_by_method?.supplier_basis?.count || 0} records
                    </p>
                    <p className="text-sm text-purple-500">
                      {(scope3BiogenicStats.scope3_by_method?.supplier_basis?.tco2e || 0).toFixed(4)} tCO₂e
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Scope 3 Categories with Method Breakdown */}
              <div className="p-4 bg-stone-50 rounded-lg">
                <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Scope 3 - Categories ({scope3BiogenicStats.scope3_categories?.length || 0})
                </h3>
                {scope3BiogenicStats.scope3_categories?.length > 0 ? (
                  <div className="space-y-2">
                    {scope3BiogenicStats.scope3_categories.map((cat, idx) => (
                      <div key={idx} className="bg-white rounded-lg border border-stone-200 overflow-hidden">
                        <div 
                          className="p-3 flex items-center justify-between cursor-pointer hover:bg-stone-50"
                          onClick={() => toggleCategoryExpand(cat.category)}
                        >
                          <div className="flex items-center gap-2">
                            {expandedCategories[cat.category] ? (
                              <ChevronDown className="w-4 h-4 text-stone-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-stone-400" />
                            )}
                            <span className="font-medium text-sm">{cat.category}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-stone-500">{cat.total_count} records</span>
                            <span className="font-semibold text-emerald-600">{cat.total_tco2e.toFixed(4)} tCO₂e</span>
                          </div>
                        </div>
                        {expandedCategories[cat.category] && (
                          <div className="px-3 pb-3 pt-1 border-t border-stone-100">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              {cat.by_method?.activity_basis && (
                                <div className="p-2 bg-blue-50 rounded">
                                  <p className="text-blue-700 font-medium">Activity</p>
                                  <p className="text-blue-600">{cat.by_method.activity_basis.count} records / {cat.by_method.activity_basis.tco2e.toFixed(4)} tCO₂e</p>
                                </div>
                              )}
                              {cat.by_method?.spend_basis && (
                                <div className="p-2 bg-orange-50 rounded">
                                  <p className="text-orange-700 font-medium">Spend</p>
                                  <p className="text-orange-600">{cat.by_method.spend_basis.count} records / {cat.by_method.spend_basis.tco2e.toFixed(4)} tCO₂e</p>
                                </div>
                              )}
                              {cat.by_method?.supplier_basis && (
                                <div className="p-2 bg-purple-50 rounded">
                                  <p className="text-purple-700 font-medium">Supplier</p>
                                  <p className="text-purple-600">{cat.by_method.supplier_basis.count} records / {cat.by_method.supplier_basis.tco2e.toFixed(4)} tCO₂e</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No Scope 3 data available</p>
                )}
              </div>
              
              {/* Biogenic Emissions */}
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                  <Leaf className="w-4 h-4" />
                  Biogenic Emissions
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Direct Biogenic */}
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <h4 className="font-medium text-green-700 mb-2">Direct Biogenic</h4>
                    <p className="text-2xl font-semibold text-green-600">
                      {(scope3BiogenicStats.biogenic?.direct?.tco2e || 0).toFixed(4)} tCO₂e
                    </p>
                    <p className="text-sm text-green-500">
                      {scope3BiogenicStats.biogenic?.direct?.count || 0} records
                    </p>
                  </div>
                  
                  {/* Indirect Biogenic */}
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <h4 className="font-medium text-teal-700 mb-2">Indirect Biogenic</h4>
                    <p className="text-2xl font-semibold text-teal-600">
                      {(scope3BiogenicStats.biogenic?.indirect?.tco2e || 0).toFixed(4)} tCO₂e
                    </p>
                    <p className="text-sm text-teal-500">
                      {scope3BiogenicStats.biogenic?.indirect?.count || 0} records
                    </p>
                    
                    {/* Indirect by Category */}
                    {scope3BiogenicStats.biogenic?.indirect?.by_category?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-teal-100">
                        <p className="text-xs font-medium text-teal-600 mb-2">By Category:</p>
                        <div className="space-y-1">
                          {scope3BiogenicStats.biogenic.indirect.by_category.map((cat, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-stone-600 truncate mr-2">{cat.category}</span>
                              <span className="text-teal-600 font-medium whitespace-nowrap">{cat.count} / {cat.tco2e.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-text-muted">
              Failed to load stats. Please try again.
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* ESG Frameworks Dialog */}
      <ESGFrameworksDialog
        open={esgFrameworksDialogOpen}
        onOpenChange={setEsgFrameworksDialogOpen}
        organization={selectedOrgForFrameworks}
        onUpdate={() => {
          // Refresh dashboard data after update
          fetchDashboardData();
        }}
      />
    </div>
  );
}
