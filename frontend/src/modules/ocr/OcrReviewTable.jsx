import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Edit3, Search, XCircle } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';

const scopeTone = {
  scope1: 'bg-red-50 text-red-800 border-red-200',
  scope2: 'bg-blue-50 text-blue-800 border-blue-200',
  scope3: 'bg-amber-50 text-amber-900 border-amber-200',
  water: 'bg-cyan-50 text-cyan-900 border-cyan-200',
};

const normalizedConfidence = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(String(value).trim().replace(/%$/, ''));
  if (!Number.isFinite(numeric)) return null;
  const percentage = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percentage)));
};

const confidenceLabel = (value) => {
  const score = normalizedConfidence(value);
  return score === null ? 'Not available' : `${score}%`;
};

const Confidence = ({ value, itemId }) => {
  const score = normalizedConfidence(value);
  const tone = score === null ? 'text-slate-500' : score >= 85 ? 'text-emerald-700' : score >= 70 ? 'text-amber-700' : 'text-red-700';
  return <span className={`text-sm font-medium ${tone}`} data-testid={`ocr-confidence-${itemId}`}>{score === null ? 'Not available' : `${score}%`}</span>;
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const displayValue = (value) => hasValue(value) ? value : '—';

const quantityValue = (values) => hasValue(values.quantity)
  ? `${values.quantity}${values.unit ? ` ${values.unit}` : ''}`
  : '—';

const distanceValue = (values) => hasValue(values.distance_km) ? `${values.distance_km} km` : '—';

const costValue = (values) => hasValue(values.cost)
  ? `${values.currency ? `${values.currency} ` : ''}${values.cost}`
  : '—';

const MobileField = ({ label, value, itemId, field, wide = false, children }) => (
  <div className={wide ? 'col-span-2' : ''}>
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-sm text-slate-900" data-testid={`ocr-mobile-${field}-${itemId}`}>
      {children || displayValue(value)}
    </dd>
  </div>
);

const formatSubtotal = (items) => Object.entries(items.reduce((totals, item) => {
  const values = item.current_values || {};
  const currency = values.currency || 'Unspecified currency';
  totals[currency] = (totals[currency] || 0) + (Number(values.cost) || 0);
  return totals;
}, {})).filter(([, total]) => total > 0).map(([currency, total]) => `${currency} ${total.toLocaleString()}`).join(' · ') || 'No spend total';

const RowStatus = ({ item, testIdPrefix = 'ocr-row-status' }) => {
  const values = item.current_values || {};
  const status = values.missing_values ? ['Missing data', 'bg-red-50 text-red-800 border-red-200']
    : item.needs_review ? ['Needs review', 'bg-amber-50 text-amber-900 border-amber-200']
      : ['Ready', 'bg-emerald-50 text-emerald-800 border-emerald-200'];
  return <Badge variant="outline" className={status[1]} data-testid={`${testIdPrefix}-${item.id}`}>{status[0]}</Badge>;
};

const MoreDetailsDialog = ({ item, open, onOpenChange }) => {
  const values = item?.current_values || {};
  const details = [
    ['Accounting rationale', values.accounting_rationale || 'No accounting rationale returned.', 'accounting-rationale'],
    ['Vendor', values.vendor_name || 'Unknown vendor', 'vendor'],
    ['Invoice number', values.invoice_number, 'invoice-number'],
    ['Location', values.location, 'location'],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="ocr-row-details-dialog">
        <DialogHeader>
          <DialogTitle data-testid="ocr-row-details-title">Invoice activity details</DialogTitle>
          <DialogDescription data-testid="ocr-row-details-description">Additional extracted and review information for this activity row.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-slate-200 border-y border-slate-200" data-testid="ocr-row-details-list">
          {details.map(([label, value, key]) => (
            <div key={key} className="grid gap-1 px-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-xs font-semibold uppercase text-slate-500" data-testid={`ocr-row-details-${key}-label`}>{label}</dt>
              <dd className="break-words text-sm text-slate-900" data-testid={`ocr-row-details-${key}-value`}>{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
};

export const OcrReviewTable = ({ items, enabledScopes, selectedId, onSelect, onEdit, onAccept, onReject, acceptingId, rejectingId }) => {
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [detailsItem, setDetailsItem] = useState(null);
  const showEfMethod = items.some((item) => item.current_values?.scope === 'scope3');
  const showQuantity = items.some((item) => hasValue(item.current_values?.quantity));
  const showCost = items.some((item) => hasValue(item.current_values?.cost));
  const showDistance = items.some((item) => hasValue(item.current_values?.distance_km));
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
        <Table className="min-w-[1480px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead data-testid="ocr-ledger-header-facility">Facility</TableHead>
              <TableHead data-testid="ocr-ledger-header-extracted-item">Extracted item</TableHead>
              <TableHead data-testid="ocr-ledger-header-date">Date</TableHead>
              <TableHead data-testid="ocr-ledger-header-scope">Scope</TableHead>
              <TableHead data-testid="ocr-ledger-header-category">Category</TableHead>
              <TableHead data-testid="ocr-ledger-header-subcategory">Subcategory</TableHead>
              {showEfMethod && <TableHead data-testid="ocr-ledger-header-ef-method">EF method</TableHead>}
              {showQuantity && <TableHead data-testid="ocr-ledger-header-quantity">Qty</TableHead>}
              {showCost && <TableHead data-testid="ocr-ledger-header-cost">Cost</TableHead>}
              {showDistance && <TableHead data-testid="ocr-ledger-header-distance">Distance</TableHead>}
              <TableHead data-testid="ocr-ledger-header-confidence">Confidence score</TableHead>
              <TableHead data-testid="ocr-ledger-header-status">Review status</TableHead>
              <TableHead className="text-right" data-testid="ocr-ledger-header-actions">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const values = item.current_values || {};
              return (
                <TableRow key={item.id} className={selectedId === item.id ? 'bg-emerald-50/60' : ''} onClick={() => onSelect(item)} data-testid={`ocr-review-row-${item.id}`}>
                  <TableCell className="max-w-48 whitespace-normal break-words" data-testid={`ocr-row-facility-${item.id}`}>{displayValue(values.location)}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal break-words" data-testid={`ocr-row-description-${item.id}`}>
                    <p>{values.item_description || values.fuel_name || 'Unspecified activity'}</p>
                    {(values.low_confidence_fields || []).length > 0 && <p className="mt-1 text-xs text-amber-800" data-testid={`ocr-row-review-reasons-${item.id}`}>Review: {values.low_confidence_fields.join(', ')}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap" data-testid={`ocr-row-date-${item.id}`}>{displayValue(values.date)}</TableCell>
                  <TableCell><Badge variant="outline" className={scopeTone[values.scope]} data-testid={`ocr-row-scope-${item.id}`}>{values.scope?.replace('scope', 'Scope ') || '—'}</Badge></TableCell>
                  <TableCell className="max-w-60 whitespace-normal break-words" data-testid={`ocr-row-category-${item.id}`}>{values.category || 'Unknown'}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal break-words" data-testid={`ocr-row-subcategory-${item.id}`}>{displayValue(values.subcategory || values.sector || values.naics_label)}</TableCell>
                  {showEfMethod && <TableCell><span className="text-xs font-medium uppercase text-slate-600" data-testid={`ocr-row-method-${item.id}`}>{values.scope === 'scope3' ? values.ef_method || 'Review' : '—'}</span></TableCell>}
                  {showQuantity && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-quantity-${item.id}`}>{quantityValue(values)}</TableCell>}
                  {showCost && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-cost-${item.id}`}>{costValue(values)}</TableCell>}
                  {showDistance && <TableCell className="whitespace-nowrap" data-testid={`ocr-row-distance-${item.id}`}>{distanceValue(values)}</TableCell>}
                  <TableCell><Confidence value={item.confidence_score ?? values.confidence_score} itemId={item.id} /></TableCell>
                  <TableCell><RowStatus item={item} /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setDetailsItem(item); }} data-testid={`ocr-view-more-row-${item.id}`}>View more</Button>
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
            <article key={item.id} className={`border bg-white p-4 ${selectedId === item.id ? 'border-emerald-600' : 'border-slate-200'}`} data-testid={`ocr-review-card-${item.id}`}>
              <button type="button" onClick={() => onSelect(item)} className="flex w-full items-center justify-between gap-3 text-left" data-testid={`ocr-mobile-select-row-${item.id}`}>
                <span className="text-sm font-semibold text-slate-950">Review extracted row</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                <MobileField label="Facility" value={values.location} itemId={item.id} field="facility" />
                <MobileField label="Extracted item" value={values.item_description || values.fuel_name || 'Unspecified activity'} itemId={item.id} field="description" wide />
                <MobileField label="Date" value={values.date} itemId={item.id} field="date" />
                <MobileField label="Scope" itemId={item.id} field="scope"><Badge variant="outline" className={scopeTone[values.scope]}>{values.scope?.replace('scope', 'Scope ') || '—'}</Badge></MobileField>
                <MobileField label="Category" value={values.category || 'Unknown'} itemId={item.id} field="category" wide />
                <MobileField label="Subcategory / sector" value={values.subcategory || values.sector || values.naics_label} itemId={item.id} field="subcategory" wide />
                {showEfMethod && <MobileField label="EF method" value={values.scope === 'scope3' ? values.ef_method || 'Review' : '—'} itemId={item.id} field="method" />}
                {showQuantity && <MobileField label="Qty" value={quantityValue(values)} itemId={item.id} field="quantity" />}
                {showCost && <MobileField label="Cost" value={costValue(values)} itemId={item.id} field="cost" />}
                {showDistance && <MobileField label="Distance" value={distanceValue(values)} itemId={item.id} field="distance" />}
                <MobileField label="Confidence score" value={confidenceLabel(item.confidence_score ?? values.confidence_score)} itemId={item.id} field="confidence" />
                <MobileField label="Review status" itemId={item.id} field="review-status" wide><RowStatus item={item} testIdPrefix="ocr-mobile-row-status" /></MobileField>
              </dl>
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4" data-testid={`ocr-mobile-actions-${item.id}`}>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDetailsItem(item)} data-testid={`ocr-mobile-view-more-row-${item.id}`}>View more</Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(item)} aria-label="Edit row" data-testid={`ocr-mobile-edit-row-${item.id}`}><Edit3 className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onReject(item)} disabled={rejectingId === item.id} aria-label="Reject row" data-testid={`ocr-mobile-reject-row-${item.id}`}><XCircle className="h-4 w-4" /></Button>
                <Button type="button" size="icon" onClick={() => onAccept(item)} disabled={acceptingId === item.id || item.status === 'imported'} aria-label="Accept row" data-testid={`ocr-mobile-accept-row-${item.id}`}><Check className="h-4 w-4" /></Button>
              </div>
            </article>
          );
        })}
      </div>
      <MoreDetailsDialog item={detailsItem} open={Boolean(detailsItem)} onOpenChange={(open) => { if (!open) setDetailsItem(null); }} />
    </section>
  );
};
