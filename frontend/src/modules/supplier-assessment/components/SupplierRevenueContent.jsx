import React from 'react';
import { Info } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';

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
  partsComponentsManufactured,
  setPartsComponentsManufactured,
  plantLocation,
  setPlantLocation,
  saving,
  submitting,
  onSave,
  onSubmit,
}) => {
  const submitted = relationship.revenue_submission_status === 'submitted';

  return (
    <TooltipProvider delayDuration={150}><div className="space-y-8" data-testid="supplier-revenue-content">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="supplier-revenue-percentage" className="text-sm font-medium text-slate-800">
            Revenue Percentage from {customerName}<span className="ml-1 text-xs font-normal text-slate-500">(required to submit)</span>
          </Label>
          <p className="text-xs leading-5 text-slate-500">Percentage of your total annual revenue received from this customer.</p>
          <div className="relative max-w-xs">
            <Input id="supplier-revenue-percentage" type="number" min="0" max="100" step="0.1" value={revenuePercentage} onChange={(event) => setRevenuePercentage(event.target.value)} placeholder="e.g., 15.5" className="bg-white pr-10" aria-required="false" disabled={submitted} data-testid="revenue-percentage-input" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">%</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-revenue-amount" className="text-sm font-medium text-slate-800">
            Annual Revenue Amount from {customerName}{revenueRequired && <span className="ml-1 text-xs font-normal text-slate-500">(required to submit)</span>}
          </Label>
          <p className="text-xs leading-5 text-slate-500">Total annual revenue received from this customer.</p>
          <div className="flex max-w-md items-center gap-2">
            <Select value={revenueCurrency} onValueChange={setRevenueCurrency} disabled={submitted}>
              <SelectTrigger className="w-28 bg-white" data-testid="revenue-currency-select"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency.code} value={currency.code} data-testid={`revenue-currency-${currency.code.toLowerCase()}`}>{currency.symbol} {currency.code}</SelectItem>)}</SelectContent>
            </Select>
            <Input id="supplier-revenue-amount" type="number" min="0" step="1000" value={revenueAmount} onChange={(event) => setRevenueAmount(event.target.value)} placeholder="e.g., 500000" className="min-w-0 flex-1 bg-white" aria-required="false" disabled={submitted} data-testid="revenue-amount-input" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-parts-components" className="flex items-center gap-1.5 text-sm font-medium text-slate-800">Parts/Components Manufactured<Tooltip><TooltipTrigger asChild><button type="button" aria-label={`Parts or components manufactured for ${customerName}`} className="inline-flex text-slate-400 transition-colors hover:text-emerald-700" data-testid="parts-components-info-button"><Info className="h-3.5 w-3.5" aria-hidden="true" /></button></TooltipTrigger><TooltipContent data-testid="parts-components-info-tooltip">For {customerName}</TooltipContent></Tooltip></Label>
          <Input id="supplier-parts-components" value={partsComponentsManufactured} onChange={(event) => setPartsComponentsManufactured(event.target.value)} placeholder="Describe parts or components" disabled={submitted} data-testid="parts-components-manufactured-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-plant-location" className="flex items-center gap-1.5 text-sm font-medium text-slate-800">Location of the plant<Tooltip><TooltipTrigger asChild><button type="button" aria-label={`Plant location where parts are manufactured for ${customerName}`} className="inline-flex text-slate-400 transition-colors hover:text-emerald-700" data-testid="plant-location-info-button"><Info className="h-3.5 w-3.5" aria-hidden="true" /></button></TooltipTrigger><TooltipContent data-testid="plant-location-info-tooltip">Plant where Parts manufactured for {customerName}</TooltipContent></Tooltip></Label>
          <Input id="supplier-plant-location" value={plantLocation} onChange={(event) => setPlantLocation(event.target.value)} placeholder="Enter plant location" disabled={submitted} data-testid="plant-location-input" />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5" data-testid="revenue-actions">
        {submitted ? <Badge className="bg-emerald-100 text-emerald-800" data-testid="revenue-submitted-badge">Submitted</Badge> : <>
          <Button variant="outline" onClick={onSave} disabled={saving || submitting} data-testid="save-revenue-btn">{saving ? 'Saving…' : 'Save draft'}</Button>
          <Button onClick={onSubmit} disabled={submitting || saving} data-testid="submit-revenue-button">{submitting ? 'Submitting…' : 'Submit org information'}</Button>
        </>}
      </div>
    </div></TooltipProvider>
  );
};