import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Search } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SupplierAssignmentPicker = ({ selectedIds, onChange, getAuthHeader, testIdPrefix, reportingPeriod }) => {
  const [suppliers, setSuppliers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const pageSize = 20;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search.trim()) params.set('search', search.trim());
    if (reportingPeriod) params.set('reporting_period', reportingPeriod);
    const response = await axios.get(`${API}/supplier-assessment/suppliers?${params}`, { headers: getAuthHeader() });
    setSuppliers(response.data.suppliers || []);
    setTotal(response.data.total || 0);
  }, [getAuthHeader, page, search, reportingPeriod]);

  useEffect(() => { load().catch(() => setSuppliers([])); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const visibleIds = suppliers.map((supplier) => supplier.id);
  const visibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const toggle = (id, checked) => onChange(checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((value) => value !== id));
  const toggleVisible = (checked) => onChange(checked ? [...new Set([...selectedIds, ...visibleIds])] : selectedIds.filter((id) => !visibleIds.includes(id)));

  return <div className="space-y-3" data-testid={`${testIdPrefix}-supplier-picker`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><Label>Assign to suppliers</Label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={visibleSelected} onChange={(event) => toggleVisible(event.target.checked)} data-testid={`${testIdPrefix}-select-visible-checkbox`} />Select visible</label></div>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search suppliers" data-testid={`${testIdPrefix}-supplier-search-input`} /></div>
    <div className="grid gap-2 rounded-md border border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-3" data-testid={`${testIdPrefix}-supplier-options`}>
      {suppliers.map((supplier) => <label key={supplier.id} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-stone-50"><input type="checkbox" checked={selectedIds.includes(supplier.id)} onChange={(event) => toggle(supplier.id, event.target.checked)} data-testid={`${testIdPrefix}-supplier-checkbox-${supplier.id}`} /><span>{supplier.company_name}</span></label>)}
    </div>
    <div className="flex items-center justify-between gap-2 text-xs text-stone-500"><span data-testid={`${testIdPrefix}-selected-count`}>{selectedIds.length} selected</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)} data-testid={`${testIdPrefix}-previous-page-button`}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)} data-testid={`${testIdPrefix}-next-page-button`}>Next</Button></div></div>
  </div>;
};