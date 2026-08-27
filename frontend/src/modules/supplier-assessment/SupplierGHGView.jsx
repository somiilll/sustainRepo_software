import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { ChevronLeft, ChevronRight, Search, Cloud, Download, Eye, Factory, Filter, LockOpen } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const displayValue = (value, digits = 2) => value === null || value === undefined ? '—' : Number(value).toFixed(digits);
const supplierInitials = (name = '') => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '—';

const EmissionValue = ({ value, testId, emphasized = false }) => (
  <span className={`whitespace-nowrap text-sm ${emphasized ? 'font-semibold text-stone-950' : 'text-stone-700'}`} data-testid={testId}>
    {displayValue(value)}
  </span>
);

export default function SupplierGHGView() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  const [emissions, setEmissions] = useState([]);
  const [supplierTotals, setSupplierTotals] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [emissionPage, setEmissionPage] = useState(1);
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');

  const fetchEmissions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/emissions/all?reporting_period=${encodeURIComponent(reportingPeriod)}`, {
        headers: getAuthHeader(),
      });
      setEmissions(res.data.emissions || []);
      setSupplierTotals(res.data.supplier_totals || []);
      setGrandTotal(res.data.grand_total || 0);
    } catch (err) {
      toast.error('Failed to load emissions');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, reportingPeriod]);

  useEffect(() => {
    fetchEmissions();
  }, [fetchEmissions]);

  const unlockSupplierGhg = async () => {
    if (!unlockTarget) return;
    setUnlocking(true);
    try {
      await axios.post(`${API}/supplier-assessment/suppliers/${unlockTarget.supplier_relationship_id}/emissions/reopen`, {}, { headers: getAuthHeader() });
      toast.success(`${unlockTarget.supplier_name} can now revise and resubmit GHG data`);
      setUnlockTarget(null);
      await fetchEmissions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not unlock GHG data');
    } finally {
      setUnlocking(false);
    }
  };

  const openEmissionEvidence = async (emission, file, download = false) => {
    const key = `${emission.id}-${file.id}-${download ? 'download' : 'view'}`;
    setOpeningEvidenceKey(key);
    try {
      const { data } = await axios.get(`${API}/supplier-assessment/emissions/${emission.id}/evidence/${file.id}`, {
        params: { download }, headers: getAuthHeader(),
      });
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not open evidence');
    } finally {
      setOpeningEvidenceKey('');
    }
  };

  const filteredEmissions = emissions.filter((e) => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || [e.supplier_name, e.category, e.sub_category, e.fuel_type]
      .some((value) => value?.toLowerCase().includes(normalizedSearch));
    const matchesScope = scopeFilter === 'all' || e.scope === scopeFilter;
    const matchesSupplier = supplierFilter === 'all' || e.supplier_name === supplierFilter;
    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    return matchesSearch && matchesScope && matchesSupplier && matchesCategory;
  });
  const emissionPageSize = 20;
  const emissionPageCount = Math.max(1, Math.ceil(filteredEmissions.length / emissionPageSize));
  const visibleEmissions = filteredEmissions.slice((emissionPage - 1) * emissionPageSize, emissionPage * emissionPageSize);
  const emissionStart = filteredEmissions.length ? (emissionPage - 1) * emissionPageSize + 1 : 0;
  const emissionEnd = Math.min(emissionPage * emissionPageSize, filteredEmissions.length);

  useEffect(() => {
    setEmissionPage(1);
  }, [search, scopeFilter, supplierFilter, categoryFilter, reportingPeriod]);
  const supplierOptions = [...new Set(emissions.map((emission) => emission.supplier_name).filter(Boolean))].sort();
  const categoryOptions = [...new Set(emissions.map((emission) => emission.category).filter(Boolean))].sort();
  return (
    <div className="space-y-6" data-testid="supplier-ghg-view">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-start sm:justify-between" data-testid="supplier-ghg-header">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700 shadow-sm" data-testid="supplier-ghg-heading-icon"><Cloud className="h-6 w-6" aria-hidden="true" /></div><h1 className="text-3xl font-bold text-emerald-950" data-testid="supplier-ghg-heading">Supplier GHG Emissions</h1></div>
        <div className="w-44" data-testid="supplier-ghg-period-control"><label htmlFor="supplier-ghg-reporting-period" className="mb-1 block text-xs font-medium text-stone-600" data-testid="supplier-ghg-period-label">Reporting period</label><Select value={reportingPeriod} onValueChange={setReportingPeriod}><SelectTrigger id="supplier-ghg-reporting-period" className="h-9 bg-white" data-testid="supplier-ghg-period-selector"><SelectValue /></SelectTrigger><SelectContent data-testid="supplier-ghg-period-menu">{periods.map((period) => <SelectItem key={period} value={period} data-testid={`supplier-ghg-period-option-${period}`}>{period}</SelectItem>)}</SelectContent></Select></div>
      </div>

      <Tabs defaultValue="supplier-summary" data-testid="supplier-ghg-tabs">
        <TabsList className="h-10 rounded-lg border border-stone-200 bg-stone-50 p-1" data-testid="supplier-ghg-tab-list"><TabsTrigger value="supplier-summary" className="h-8 border-b-2 border-transparent text-stone-500 shadow-none transition-[background-color,border-color,color] hover:bg-white hover:text-stone-800 data-[state=active]:border-emerald-600 data-[state=active]:bg-white data-[state=active]:text-stone-950 data-[state=active]:shadow-none" data-testid="supplier-ghg-summary-tab">Emissions by Supplier</TabsTrigger><TabsTrigger value="logs" className="h-8 border-b-2 border-transparent text-stone-500 shadow-none transition-[background-color,border-color,color] hover:bg-white hover:text-stone-800 data-[state=active]:border-emerald-600 data-[state=active]:bg-white data-[state=active]:text-stone-950 data-[state=active]:shadow-none" data-testid="supplier-ghg-logs-tab">Logs</TabsTrigger></TabsList>
        <TabsContent value="supplier-summary" className="mt-5 space-y-6" data-testid="supplier-ghg-summary-panel">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl border-stone-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Cloud className="h-4 w-4" />
              <span className="text-sm">Total Emissions</span>
            </div>
            <div className="text-2xl font-bold text-stone-900">
              {displayValue(grandTotal)} <span className="text-sm font-normal text-stone-500">tCO2e</span>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-stone-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Factory className="h-4 w-4" />
              <span className="text-sm">Scope 1</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {supplierTotals.reduce((sum, s) => sum + (s.scope1 || 0), 0).toFixed(2)}
              <span className="text-sm font-normal text-stone-500 ml-1">tCO2e</span>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-stone-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Factory className="h-4 w-4" />
              <span className="text-sm">Scope 2</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {supplierTotals.reduce((sum, s) => sum + (s.scope2 || 0), 0).toFixed(2)}
              <span className="text-sm font-normal text-stone-500 ml-1">tCO2e</span>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-stone-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Factory className="h-4 w-4" />
              <span className="text-sm">Suppliers Reporting</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {supplierTotals.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Totals */}
      {supplierTotals.length > 0 && (
        <Card className="overflow-hidden rounded-xl border-stone-200 bg-white shadow-sm" data-testid="supplier-emissions-by-supplier-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[1180px]" data-testid="supplier-emissions-by-supplier-table">
              <TableHeader>
                <TableRow className="border-stone-100 bg-stone-50 hover:bg-stone-50"><TableHead rowSpan={2} className="min-w-[220px] pl-6 text-[11px] font-semibold uppercase text-stone-500">Supplier</TableHead><TableHead colSpan={3} className="border-r border-stone-200 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-700">Total emissions (tCO₂e)</TableHead><TableHead colSpan={3} className="border-r border-stone-200 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-700">Attributed emissions (tCO₂e)</TableHead><TableHead rowSpan={2} className="text-right text-[11px] font-semibold uppercase text-stone-500">Intensity</TableHead><TableHead rowSpan={2} className="pr-6 text-right text-[11px] font-semibold uppercase text-stone-500">Actions</TableHead></TableRow>
                <TableRow className="border-stone-100 bg-stone-50 hover:bg-stone-50"><TableHead className="text-right text-[10px] font-medium uppercase tracking-wide text-stone-400">Scope 1</TableHead><TableHead className="text-right text-[10px] font-medium uppercase tracking-wide text-stone-400">Scope 2</TableHead><TableHead className="border-r border-stone-200 text-right text-[10px] font-medium uppercase tracking-wide text-stone-400">Total</TableHead><TableHead className="text-right text-[10px] font-medium uppercase tracking-wide text-stone-400">Scope 1</TableHead><TableHead className="text-right text-[10px] font-medium uppercase tracking-wide text-stone-400">Scope 2</TableHead><TableHead className="border-r border-stone-200 text-right text-[10px] font-medium uppercase tracking-wide text-stone-400">Total</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {supplierTotals.map((supplier) => (
                  <TableRow key={supplier.supplier_relationship_id} className="border-stone-100 hover:bg-emerald-50/50" data-testid={`supplier-emissions-row-${supplier.supplier_relationship_id}`}>
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-[11px] font-semibold text-stone-700" aria-hidden="true">{supplierInitials(supplier.supplier_name)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-950" data-testid={`supplier-emissions-name-${supplier.supplier_relationship_id}`}>{supplier.supplier_name}</p>
                          <p className="mt-1 text-xs text-stone-500" data-testid={`supplier-emissions-revenue-share-${supplier.supplier_relationship_id}`}>{supplier.revenue_submitted ? `Revenue share ${displayValue(supplier.revenue_percentage, 1)}%` : 'Revenue not submitted'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right"><EmissionValue value={supplier.raw_scope1} testId={`supplier-raw-scope1-${supplier.supplier_relationship_id}`} /></TableCell>
                    <TableCell className="text-right"><EmissionValue value={supplier.raw_scope2} testId={`supplier-raw-scope2-${supplier.supplier_relationship_id}`} /></TableCell>
                    <TableCell className="border-r border-stone-100 text-right"><EmissionValue value={supplier.raw_total} emphasized testId={`supplier-raw-total-${supplier.supplier_relationship_id}`} /></TableCell>
                    <TableCell className="text-right"><EmissionValue value={supplier.scope1} testId={`supplier-attributed-scope1-${supplier.supplier_relationship_id}`} /></TableCell>
                    <TableCell className="text-right"><EmissionValue value={supplier.scope2} testId={`supplier-attributed-scope2-${supplier.supplier_relationship_id}`} /></TableCell>
                    <TableCell className="border-r border-stone-100 text-right"><EmissionValue value={supplier.total} emphasized testId={`supplier-attributed-total-${supplier.supplier_relationship_id}`} /></TableCell>
                    <TableCell className="text-right">
                      {supplier.total_intensity === null || supplier.total_intensity === undefined
                        ? <span className="whitespace-nowrap text-xs text-stone-400" data-testid={`supplier-total-intensity-${supplier.supplier_relationship_id}`}>Not available</span>
                        : <span className="whitespace-nowrap text-base font-bold text-stone-950" data-testid={`supplier-total-intensity-${supplier.supplier_relationship_id}`}>{displayValue(supplier.total_intensity, 6)} <span className="mt-0.5 block text-[10px] font-normal text-stone-400">tCO₂e / {supplier.revenue_currency || 'currency not set'}</span></span>}
                    </TableCell>
                    <TableCell className="pr-6 text-right"><Button variant="outline" size="sm" className="h-8 border-stone-200 bg-white px-2.5 text-stone-600 shadow-none transition-[background-color,border-color,color] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900" onClick={() => setUnlockTarget(supplier)} data-testid={`unlock-supplier-ghg-${supplier.supplier_relationship_id}`}><LockOpen className="h-3.5 w-3.5" />Unlock</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

      <AlertDialog open={Boolean(unlockTarget)} onOpenChange={(open) => !open && setUnlockTarget(null)}><AlertDialogContent data-testid="unlock-supplier-ghg-dialog"><AlertDialogHeader><AlertDialogTitle>Unlock GHG data for resubmission?</AlertDialogTitle><AlertDialogDescription>The supplier receives a private draft copy. Their current submitted data remains visible here until they resubmit.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="cancel-unlock-supplier-ghg-button">Cancel</AlertDialogCancel><AlertDialogAction disabled={unlocking} onClick={unlockSupplierGhg} data-testid="confirm-unlock-supplier-ghg-button">{unlocking ? 'Unlocking…' : 'Unlock for resubmission'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

        <TabsContent value="logs" className="mt-5 space-y-5" data-testid="supplier-ghg-logs-panel">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            placeholder="Search emissions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="supplier-ghg-search-input"
          />
        </div>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-40" data-testid="supplier-ghg-scope-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="scope1">Scope 1</SelectItem>
            <SelectItem value="scope2">Scope 2</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}><SelectTrigger className="w-44" data-testid="supplier-ghg-supplier-filter"><SelectValue placeholder="Filter supplier" /></SelectTrigger><SelectContent><SelectItem value="all">All Suppliers</SelectItem>{supplierOptions.map((supplier) => <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>)}</SelectContent></Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-44" data-testid="supplier-ghg-category-filter"><SelectValue placeholder="Filter category" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{categoryOptions.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
      </div>

      {/* Emissions Table */}
      <Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="all-supplier-emission-records-card">
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]" data-testid="supplier-ghg-logs-table">
              <TableHeader>
                <TableRow className="border-stone-100 bg-emerald-50/50 hover:bg-emerald-50/50" data-testid="supplier-ghg-logs-table-header">
                  <TableHead className="pl-6 text-[11px] font-semibold uppercase tracking-wide text-stone-600" data-testid="supplier-ghg-logs-supplier-header">Supplier Org</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-stone-600" data-testid="supplier-ghg-logs-period-header">Reporting Period</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-stone-600" data-testid="supplier-ghg-logs-scope-header">Scope</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-stone-600" data-testid="supplier-ghg-logs-category-header">Category</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-stone-600" data-testid="supplier-ghg-logs-subcategory-header">Subcategory</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-stone-600" data-testid="supplier-ghg-logs-evidence-header">Evidence</TableHead>
                  <TableHead className="pr-6 text-right text-[11px] font-semibold uppercase tracking-wide text-stone-600" data-testid="supplier-ghg-logs-attributed-header">Attributed emissions (tCO₂e)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-stone-500" data-testid="supplier-ghg-logs-loading">Loading emissions...</TableCell></TableRow> : filteredEmissions.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-stone-500" data-testid="supplier-ghg-logs-empty">No emission records found.</TableCell></TableRow> : visibleEmissions.map((emission) => (
                  <TableRow key={emission.id} className="border-stone-100 hover:bg-emerald-50/50" data-testid={`supplier-ghg-log-row-${emission.id}`}>
                    <TableCell className="pl-6 font-medium text-stone-900" data-testid={`supplier-ghg-log-supplier-${emission.id}`}>{emission.supplier_name}</TableCell>
                    <TableCell>{emission.reporting_period}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={emission.scope === 'scope1' ? 'border-blue-200 bg-blue-50 text-blue-700' : emission.scope === 'scope2' ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-stone-200 bg-stone-50 text-stone-700'} data-testid={`supplier-emission-scope-${emission.id}`}>
                        {emission.scope === 'scope1' ? 'Scope 1' : emission.scope === 'scope2' ? 'Scope 2' : emission.scope}
                      </Badge>
                    </TableCell>
                    <TableCell>{emission.category || '-'}</TableCell>
                    <TableCell>{emission.fuel_type || emission.sub_category || '-'}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1" data-testid={`supplier-emission-evidence-${emission.id}`}>{(emission.evidence_files || []).length === 0 ? <span className="text-xs text-stone-400" data-testid={`supplier-emission-evidence-empty-${emission.id}`}>—</span> : emission.evidence_files.map((file) => <span key={file.id} className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`View ${file.original_filename}`} disabled={openingEvidenceKey === `${emission.id}-${file.id}-view`} onClick={() => openEmissionEvidence(emission, file)} data-testid={`view-supplier-emission-evidence-${emission.id}-${file.id}`}><Eye className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Download ${file.original_filename}`} disabled={openingEvidenceKey === `${emission.id}-${file.id}-download`} onClick={() => openEmissionEvidence(emission, file, true)} data-testid={`download-supplier-emission-evidence-${emission.id}-${file.id}`}><Download className="h-3.5 w-3.5" /></Button></span>)}</div></TableCell>
                    <TableCell className="pr-6 text-right font-mono">
                      {displayValue(emission.attributed_emissions, 4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {filteredEmissions.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-6 py-4" data-testid="supplier-emissions-pagination"><p className="text-xs text-stone-500" data-testid="supplier-emissions-pagination-count">Showing {emissionStart} to {emissionEnd} of {filteredEmissions.length} records</p><div className="flex items-center gap-1"><Button variant="outline" size="icon" className="h-8 w-8" disabled={emissionPage === 1} onClick={() => setEmissionPage((page) => Math.max(1, page - 1))} data-testid="supplier-emissions-previous-page"><ChevronLeft className="h-4 w-4" /></Button><span className="flex h-8 min-w-8 items-center justify-center text-xs font-semibold text-stone-700" data-testid="supplier-emissions-current-page">{emissionPage}</span><Button variant="outline" size="icon" className="h-8 w-8" disabled={emissionPage === emissionPageCount} onClick={() => setEmissionPage((page) => Math.min(emissionPageCount, page + 1))} data-testid="supplier-emissions-next-page"><ChevronRight className="h-4 w-4" /></Button></div></div>}
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
