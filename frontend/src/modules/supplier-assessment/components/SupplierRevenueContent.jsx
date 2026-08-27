import React from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const CURRENCIES = [
  { code: 'USD', symbol: '$' }, { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' }, { code: 'INR', symbol: '₹' },
  { code: 'JPY', symbol: '¥' }, { code: 'CNY', symbol: '¥' },
  { code: 'AUD', symbol: 'A$' }, { code: 'CAD', symbol: 'C$' },
];

export const SupplierRevenueContent = ({
  relationship,
  customerName,
  revenueRequired,
  revenuePercentage,
  setRevenuePercentage,
  revenueAmount,
  setRevenueAmount,
  revenueCurrency,
  setRevenueCurrency,
  saving,
  submitting,
  onSave,
  onSubmit,
}) => {
  const submitted = relationship.revenue_submission_status === 'submitted';

  return (
    <div className="space-y-8" data-testid="supplier-revenue-content">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="supplier-revenue-percentage" className="text-sm font-medium text-slate-800">
            Revenue Percentage from {customerName}<span className="ml-1 text-red-500">*</span>
          </Label>
          <p className="text-xs leading-5 text-slate-500">Percentage of your total annual revenue received from this customer.</p>
          <div className="relative max-w-xs">
            <Input id="supplier-revenue-percentage" type="number" min="0" max="100" step="0.1" value={revenuePercentage} onChange={(event) => setRevenuePercentage(event.target.value)} placeholder="e.g., 15.5" className="bg-white pr-10" required aria-required="true" disabled={submitted} data-testid="revenue-percentage-input" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">%</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-revenue-amount" className="text-sm font-medium text-slate-800">
            Annual Revenue Amount from {customerName}{revenueRequired && <span className="ml-1 text-red-500">*</span>}
          </Label>
          <p className="text-xs leading-5 text-slate-500">Total annual revenue received from this customer.</p>
          <div className="flex max-w-md items-center gap-2">
            <Select value={revenueCurrency} onValueChange={setRevenueCurrency} disabled={submitted}>
              <SelectTrigger className="w-28 bg-white" data-testid="revenue-currency-select"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency.code} value={currency.code} data-testid={`revenue-currency-${currency.code.toLowerCase()}`}>{currency.symbol} {currency.code}</SelectItem>)}</SelectContent>
            </Select>
            <Input id="supplier-revenue-amount" type="number" min="0" step="1000" value={revenueAmount} onChange={(event) => setRevenueAmount(event.target.value)} placeholder="e.g., 500000" className="min-w-0 flex-1 bg-white" required={revenueRequired} aria-required={revenueRequired} disabled={submitted} data-testid="revenue-amount-input" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5" data-testid="revenue-actions">
        {submitted ? <Badge className="bg-emerald-100 text-emerald-800" data-testid="revenue-submitted-badge">Submitted</Badge> : <>
          <Button variant="outline" onClick={onSave} disabled={saving || submitting} data-testid="save-revenue-btn">{saving ? 'Saving…' : 'Save draft'}</Button>
          <Button onClick={onSubmit} disabled={submitting || saving} data-testid="submit-revenue-button">{submitting ? 'Submitting…' : 'Submit revenue'}</Button>
        </>}
      </div>
    </div>
  );
};