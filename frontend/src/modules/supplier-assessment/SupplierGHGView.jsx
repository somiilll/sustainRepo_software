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
import { Search, Cloud, Factory, Filter, LockOpen } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const displayValue = (value, digits = 2) => value === null || value === undefined ? '—' : Number(value).toFixed(digits);
const supplierInitials = (name = '') => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '—';

const EmissionValue = ({ value, testId, emphasized = false }) => (
  <span className={`whitespace-nowrap text-sm ${emphasized ? 'font-semibold text-stone-950' : 'text-stone-700'}`} data-testid={testId}>
    {displayValue(value)} <span className="text-[11px] font-normal text-stone-400">tCO₂e</span>
  </span>
);

export default function SupplierGHGView() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod } = useSupplierAssessmentPeriod();
  const [emissions, setEmissions] = useState([]);
  const [supplierTotals, setSupplierTotals] = useState([]);
  const [aggregations, setAggregations] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlocking, setUnlocking] = useState(false);

  const fetchEmissions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/supplier-assessment/emissions/all?reporting_period=${encodeURIComponent(reportingPeriod)}`, {
        headers: getAuthHeader(),
      });
      setEmissions(res.data.emissions || []);
      setSupplierTotals(res.data.supplier_totals || []);
      setAggregations(res.data.aggregations || []);
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

  const filteredEmissions = emissions.filter((e) => {
    const matchesSearch = !search || 
      e.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.category?.toLowerCase().includes(search.toLowerCase());
    const matchesScope = scopeFilter === 'all' || e.scope === scopeFilter;
    return matchesSearch && matchesScope;
  });
  return (
    <div className="space-y-6" data-testid="supplier-ghg-view">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Supplier GHG Emissions</h1>
        <p className="text-sm text-stone-500 mt-1">
          View attributed supplier emissions using each supplier’s revenue share.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-stone-500 mb-2">
              <Cloud className="h-4 w-4" />
              <span className="text-sm">Attributed Emissions</span>
            </div>
            <div className="text-2xl font-bold text-stone-900">
              {displayValue(grandTotal)} <span className="text-sm font-normal text-stone-500">tCO2e</span>
            </div>
          </CardContent>
        </Card>
        <Card>
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
        <Card>
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
        <Card>
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
        <Card className="overflow-hidden border-stone-200 shadow-none" data-testid="supplier-emissions-by-supplier-card">
          <CardHeader className="border-b border-stone-100 pb-4">
            <CardTitle className="text-lg text-stone-900">Emissions by Supplier</CardTitle>
            <p className="text-sm text-stone-500">Reported emissions, revenue-attributed emissions, and total intensity for each supplier.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[1180px]" data-testid="supplier-emissions-by-supplier-table">
              <TableHeader>
                <TableRow className="border-stone-200 bg-stone-50 hover:bg-stone-50">
                  <TableHead className="min-w-[220px] pl-6 text-[11px] font-semibold uppercase text-stone-500">Supplier</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase text-stone-500">Scope 1</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase text-stone-500">Scope 2</TableHead>
                  <TableHead className="border-r border-stone-200 text-right text-[11px] font-semibold uppercase text-stone-500">Total</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase text-stone-500">Scope 1 <span className="block normal-case text-stone-400">(attributed)</span></TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase text-stone-500">Scope 2 <span className="block normal-case text-stone-400">(attributed)</span></TableHead>
                  <TableHead className="border-r border-stone-200 text-right text-[11px] font-semibold uppercase text-stone-500">Total <span className="block normal-case text-stone-400">(attributed)</span></TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase text-stone-500">Total intensity</TableHead>
                  <TableHead className="pr-6 text-right text-[11px] font-semibold uppercase text-stone-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierTotals.map((supplier) => (
                  <TableRow key={supplier.supplier_relationship_id} className="border-stone-100 hover:bg-stone-50/70" data-testid={`supplier-emissions-row-${supplier.supplier_relationship_id}`}>
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-800" aria-hidden="true">{supplierInitials(supplier.supplier_name)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900" data-testid={`supplier-emissions-name-${supplier.supplier_relationship_id}`}>{supplier.supplier_name}</p>
                          <p className="mt-0.5 text-xs text-stone-400">Revenue share {supplier.revenue_percentage === null || supplier.revenue_percentage === undefined ? '—' : `${displayValue(supplier.revenue_percentage, 1)}%`}</p>
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
                        : <span className="whitespace-nowrap text-sm font-semibold text-stone-900" data-testid={`supplier-total-intensity-${supplier.supplier_relationship_id}`}>{displayValue(supplier.total_intensity, 6)} <span className="block text-[10px] font-normal text-stone-400">tCO₂e / revenue unit</span></span>}
                    </TableCell>
                    <TableCell className="pr-6 text-right"><Button variant="outline" size="sm" onClick={() => setUnlockTarget(supplier)} data-testid={`unlock-supplier-ghg-${supplier.supplier_relationship_id}`}><LockOpen className="mr-1 h-4 w-4" />Unlock</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card data-testid="submitted-ghg-aggregation-card">
        <CardHeader><CardTitle>Attributed emissions by scope and category</CardTitle></CardHeader>
        <CardContent>{aggregations.length === 0 ? <p className="text-sm text-stone-500" data-testid="submitted-ghg-aggregation-empty">No supplier GHG submission has been received.</p> : <Table data-testid="submitted-ghg-aggregation-table"><TableHeader><TableRow><TableHead>Scope</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="text-right">Attributed emissions (tCO₂e)</TableHead></TableRow></TableHeader><TableBody>{aggregations.map((row) => <TableRow key={`${row.scope}-${row.category}`} data-testid={`submitted-ghg-aggregation-${row.scope}-${row.category}`}><TableCell>{row.scope === 'scope1' ? 'Scope 1' : 'Scope 2'}</TableCell><TableCell>{row.category}</TableCell><TableCell className="text-right">{row.entry_count}</TableCell><TableCell className="text-right font-mono">{displayValue(row.total_emissions, 4)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent>
      </Card>
      <AlertDialog open={Boolean(unlockTarget)} onOpenChange={(open) => !open && setUnlockTarget(null)}><AlertDialogContent data-testid="unlock-supplier-ghg-dialog"><AlertDialogHeader><AlertDialogTitle>Unlock GHG data for resubmission?</AlertDialogTitle><AlertDialogDescription>The supplier receives a private draft copy. Their current submitted data remains visible here until they resubmit.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="cancel-unlock-supplier-ghg-button">Cancel</AlertDialogCancel><AlertDialogAction disabled={unlocking} onClick={unlockSupplierGhg} data-testid="confirm-unlock-supplier-ghg-button">{unlocking ? 'Unlocking…' : 'Unlock for resubmission'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <div className="flex items-center gap-4">
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
      </div>

      {/* Emissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Emission Records</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-stone-500">Loading emissions...</div>
          ) : filteredEmissions.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              No emission records found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier Org</TableHead>
                  <TableHead>Reporting Period</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subcategory</TableHead>
                  <TableHead className="text-right">Attributed emissions (tCO₂e)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmissions.map((emission) => (
                  <TableRow key={emission.id}>
                    <TableCell className="font-medium">{emission.supplier_name}</TableCell>
                    <TableCell>{emission.reporting_period}</TableCell>
                    <TableCell>
                      <Badge variant={emission.scope === 'scope1' ? 'default' : emission.scope === 'scope2' ? 'secondary' : 'outline'}>
                        {emission.scope === 'scope1' ? 'Scope 1' : emission.scope === 'scope2' ? 'Scope 2' : emission.scope}
                      </Badge>
                    </TableCell>
                    <TableCell>{emission.category || '-'}</TableCell>
                    <TableCell>{emission.fuel_type || emission.sub_category || '-'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {displayValue(emission.attributed_emissions, 4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
