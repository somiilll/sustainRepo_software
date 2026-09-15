import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Edit3, MapPin, Search, XCircle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';

const scopeTone = {
  scope1: 'bg-red-50 text-red-800 border-red-200',
  scope2: 'bg-blue-50 text-blue-800 border-blue-200',
  scope3: 'bg-amber-50 text-amber-900 border-amber-200',
  water: 'bg-cyan-50 text-cyan-900 border-cyan-200',
};

const Confidence = ({ value, itemId }) => {
  const score = Number(value) || 0;
  const tone = score >= 85 ? 'bg-emerald-600' : score >= 70 ? 'bg-amber-500' : 'bg-red-600';
  return (
    <div className="min-w-20" data-testid={`ocr-confidence-${itemId}`}>
      <div className="flex items-center justify-between gap-2 text-xs"><span>{score}%</span></div>
      <div className="mt-1 h-1.5 bg-slate-200"><div className={`h-full ${tone}`} style={{ width: `${score}%` }} /></div>
    </div>
  );
};

const formatSubtotal = (items) => Object.entries(items.reduce((totals, item) => {
  const values = item.current_values || {};
  const currency = values.currency || 'Unspecified currency';
  totals[currency] = (totals[currency] || 0) + (Number(values.cost) || 0);
  return totals;
}, {})).filter(([, total]) => total > 0).map(([currency, total]) => `${currency} ${total.toLocaleString()}`).join(' · ') || 'No spend total';

const RowStatus = ({ item }) => {
  const values = item.current_values || {};
  const status = values.missing_values ? ['Missing data', 'bg-red-50 text-red-800 border-red-200']
    : item.needs_review ? ['Needs review', 'bg-amber-50 text-amber-900 border-amber-200']
      : ['Ready', 'bg-emerald-50 text-emerald-800 border-emerald-200'];
  return <Badge variant="outline" className={status[1]} data-testid={`ocr-row-status-${item.id}`}>{status[0]}</Badge>;
};

export const OcrReviewTable = ({ items, enabledScopes, selectedId, onSelect, onEdit, onAccept, onReject, acceptingId, rejectingId }) => {
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const invoiceGroups = useMemo(() => Object.values(items.reduce((groups, item) => {
    const invoice = item.current_values?.invoice_number || 'Unnumbered invoice';
    groups[invoice] = groups[invoice] || { invoice, items: [] };
    groups[invoice].items.push(item);
    return groups;
  }, {})), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const values = item.current_values || {};
    const searchable = `${values.vendor_name || ''} ${values.item_description || ''} ${values.category || ''}`.toLowerCase();
    return (invoiceFilter === 'all' || (values.invoice_number || 'Unnumbered invoice') === invoiceFilter)
      && searchable.includes(query.toLowerCase())
      && (scopeFilter === 'all' || values.scope === scopeFilter)
      && (reviewFilter === 'all' || (reviewFilter === 'review' ? item.needs_review : !item.needs_review));
  }), [items, invoiceFilter, query, scopeFilter, reviewFilter]);

  return (
    <section className="space-y-3" aria-labelledby="ocr-review-heading" data-testid="ocr-review-section">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="ocr-review-heading" className="text-lg font-semibold text-slate-950">Review extracted activity</h2>
          <p className="mt-1 text-sm text-slate-600" data-testid="ocr-review-summary">
            {filtered.length} of {items.length} rows · {items.filter((item) => item.needs_review).length} need attention
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem_10rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rows" className="pl-9" data-testid="ocr-review-search-input" />
          </div>
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger data-testid="ocr-scope-filter"><SelectValue placeholder="All scopes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="ocr-scope-filter-all">All scopes</SelectItem>
              {enabledScopes.map((scope) => <SelectItem key={scope} value={scope} data-testid={`ocr-scope-filter-${scope}`}>{scope.replace('scope', 'Scope ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={reviewFilter} onValueChange={setReviewFilter}>
            <SelectTrigger data-testid="ocr-review-filter"><SelectValue placeholder="All rows" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="ocr-review-filter-all">All rows</SelectItem>
              <SelectItem value="review" data-testid="ocr-review-filter-needs-review">Needs review</SelectItem>
              <SelectItem value="ready" data-testid="ocr-review-filter-ready">Ready</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {invoiceGroups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Invoices in this source document" data-testid="ocr-invoice-tabs">
          <button type="button" role="tab" aria-selected={invoiceFilter === 'all'} onClick={() => setInvoiceFilter('all')} className={`shrink-0 border px-3 py-2 text-left text-xs transition-colors ${invoiceFilter === 'all' ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} data-testid="ocr-invoice-tab-all">All invoices · {items.length} rows</button>
          {invoiceGroups.map((group) => (
            <button key={group.invoice} type="button" role="tab" aria-selected={invoiceFilter === group.invoice} onClick={() => setInvoiceFilter(group.invoice)} className={`shrink-0 border px-3 py-2 text-left text-xs transition-colors ${invoiceFilter === group.invoice ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} data-testid={`ocr-invoice-tab-${group.invoice}`}>
              <span className="block font-semibold">{group.invoice}</span><span className="mt-0.5 block">{group.items.length} rows · {formatSubtotal(group.items)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="hidden overflow-x-auto border border-slate-200 bg-white lg:block" data-testid="ocr-review-desktop-table">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Vendor / item</TableHead><TableHead>Scope</TableHead><TableHead>Category</TableHead>
              <TableHead>Activity</TableHead><TableHead>Review status</TableHead><TableHead>Context</TableHead><TableHead>Method</TableHead><TableHead>Confidence</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const values = item.current_values || {};
              return (
                <TableRow key={item.id} className={selectedId === item.id ? 'bg-emerald-50/60' : ''} onClick={() => onSelect(item)} data-testid={`ocr-review-row-${item.id}`}>
                  <TableCell className="max-w-64">
                    <p className="truncate font-medium text-slate-900" data-testid={`ocr-row-vendor-${item.id}`}>{values.vendor_name || 'Unknown vendor'}</p>
                    <p className="mt-1 truncate text-xs text-slate-500" data-testid={`ocr-row-description-${item.id}`}>{values.item_description || values.fuel_name || 'Unspecified activity'}</p>
                    {(values.low_confidence_fields || []).length > 0 && <p className="mt-1 line-clamp-1 text-xs text-amber-800" data-testid={`ocr-row-review-reasons-${item.id}`}>Review: {values.low_confidence_fields.join(', ')}</p>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={scopeTone[values.scope]} data-testid={`ocr-row-scope-${item.id}`}>{values.scope?.replace('scope', 'Scope ')}</Badge></TableCell>
                  <TableCell className="max-w-56"><p className="line-clamp-2 text-sm" data-testid={`ocr-row-category-${item.id}`}>{values.category || 'Unknown'}</p></TableCell>
                  <TableCell data-testid={`ocr-row-activity-${item.id}`}>{values.quantity ? `${values.quantity} ${values.unit || ''}` : values.cost ? `${values.currency || ''} ${values.cost}` : 'Missing'}</TableCell>
                  <TableCell><RowStatus item={item} /></TableCell>
                  <TableCell className="max-w-64" data-testid={`ocr-row-context-${item.id}`}>
                    {(values.origin || values.destination || values.distance_km) && <p className="flex items-center gap-1 text-xs text-slate-700"><MapPin className="h-3 w-3 shrink-0 text-slate-400" />{[values.origin, values.destination].filter(Boolean).join(' → ') || 'Route'}{values.distance_km ? ` · ${values.distance_km} km` : ''}</p>}
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500" title={values.accounting_rationale || ''}>{values.accounting_rationale || 'No accounting rationale returned.'}</p>
                  </TableCell>
                  <TableCell><span className="text-xs font-medium uppercase text-slate-600" data-testid={`ocr-row-method-${item.id}`}>{values.ef_method || 'Review'}</span></TableCell>
                  <TableCell><Confidence value={item.confidence_score} itemId={item.id} /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="icon" variant="ghost" onClick={(event) => { event.stopPropagation(); onEdit(item); }} aria-label="Edit row" data-testid={`ocr-edit-row-${item.id}`}><Edit3 className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={(event) => { event.stopPropagation(); onReject(item); }} disabled={rejectingId === item.id} aria-label="Reject row" data-testid={`ocr-reject-row-${item.id}`}><XCircle className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" onClick={(event) => { event.stopPropagation(); onAccept(item); }} disabled={acceptingId === item.id || item.status === 'imported'} aria-label="Accept row" data-testid={`ocr-accept-row-${item.id}`}><Check className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-2 lg:hidden" data-testid="ocr-review-mobile-list">
        {filtered.map((item) => {
          const values = item.current_values || {};
          return (
            <button key={item.id} type="button" onClick={() => onSelect(item)} className="border border-slate-200 bg-white p-4 text-left" data-testid={`ocr-review-card-${item.id}`}>
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{values.vendor_name || 'Unknown vendor'}</span><span className="mt-1 block line-clamp-2 text-xs text-slate-600">{values.item_description || values.category}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </span>
              <span className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline" className={scopeTone[values.scope]}>{values.scope?.replace('scope', 'Scope ')}</Badge><RowStatus item={item} /><span className="text-xs text-slate-500">{values.quantity ? `${values.quantity} ${values.unit || ''}` : `${values.currency || ''} ${values.cost || ''}`}</span><span className="ml-auto text-xs font-medium">{item.confidence_score}%</span></span>
              {(values.origin || values.destination || values.distance_km) && <span className="mt-2 flex items-center gap-1 text-xs text-slate-500" data-testid={`ocr-mobile-route-${item.id}`}><MapPin className="h-3 w-3" />{[values.origin, values.destination].filter(Boolean).join(' → ') || 'Route'}{values.distance_km ? ` · ${values.distance_km} km` : ''}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
};
