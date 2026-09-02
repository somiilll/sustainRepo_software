import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Search } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SupplierAssignmentPicker = ({ selectedIds, onChange, getAuthHeader, testIdPrefix, reportingPeriod }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const pageSize = 100;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: '1', page_size: String(pageSize) });
    if (search.trim()) params.set('search', search.trim());
    if (reportingPeriod) params.set('reporting_period', reportingPeriod);
    const response = await axios.get(`${API}/supplier-assessment/suppliers?${params}`, { headers: getAuthHeader() });
    setSuppliers(response.data.suppliers || []);
  }, [getAuthHeader, search, reportingPeriod]);

  useEffect(() => { load().catch(() => setSuppliers([])); }, [load]);

  const visibleIds = suppliers.map((supplier) => supplier.id);
  const visibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const toggle = (id, checked) => onChange(checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((value) => value !== id));
  const toggleVisible = (checked) => onChange(checked ? [...new Set([...selectedIds, ...visibleIds])] : selectedIds.filter((id) => !visibleIds.includes(id)));

  return <div className="space-y-3" data-testid={`${testIdPrefix}-supplier-picker`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3"><Label>Assign to suppliers</Label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={visibleSelected} onChange={(event) => toggleVisible(event.target.checked)} data-testid={`${testIdPrefix}-select-visible-checkbox`} />Select all shown</label></div>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search suppliers" data-testid={`${testIdPrefix}-supplier-search-input`} /></div>
    <div className="overflow-hidden rounded-md border border-stone-200" data-testid={`${testIdPrefix}-supplier-options`}><div className="grid grid-cols-[minmax(0,1fr)_5rem] border-b border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500"><span>Supplier</span><span className="text-right">Assign</span></div><div className="max-h-64 overflow-y-auto">{suppliers.length === 0 ? <p className="px-3 py-4 text-sm text-stone-500" data-testid={`${testIdPrefix}-supplier-empty-state`}>No suppliers found.</p> : suppliers.map((supplier) => <label key={supplier.id} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center border-b border-stone-100 px-3 py-2.5 text-sm last:border-b-0 hover:bg-stone-50"><span className="truncate">{supplier.company_name}</span><span className="flex justify-end"><input type="checkbox" checked={selectedIds.includes(supplier.id)} onChange={(event) => toggle(supplier.id, event.target.checked)} data-testid={`${testIdPrefix}-supplier-checkbox-${supplier.id}`} /></span></label>)}</div></div>
    <p className="text-xs text-stone-500" data-testid={`${testIdPrefix}-selected-count`}>{selectedIds.length} selected</p>
  </div>;
};