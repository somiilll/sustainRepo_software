import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'CHF'];

const sumMonthlyValues = (values) => Object.values(values || {})
  .reduce((total, value) => total + (parseFloat(value) || 0), 0);

export const YearlyMetricEditor = ({ data, disabled, metric, months, onChange, period, periodLabel }) => {
  const isRevenue = metric === 'revenue';
  const frequencyField = isRevenue ? 'turnover_frequency' : 'production_quantity_frequency';
  const yearlyField = isRevenue ? 'turnover' : 'production_quantity';
  const monthlyField = isRevenue ? 'turnover_monthly' : 'production_quantity_monthly';
  const frequency = data[frequencyField] || 'yearly';
  const monthlyTotal = sumMonthlyValues(data[monthlyField]);
  const testIdPrefix = `organization-${metric}-${period}`;

  const changeFrequency = (value) => {
    onChange(value === 'monthly'
      ? { [frequencyField]: value, [yearlyField]: '' }
      : { [frequencyField]: value, [monthlyField]: {} });
  };

  const updateMonthlyValue = (month, value) => {
    onChange({ [monthlyField]: { ...(data[monthlyField] || {}), [month]: value } });
  };

  return (
    <section className="border border-stone-200 bg-white p-4 sm:p-5" data-testid={`${testIdPrefix}-section`}>
      <div className="flex flex-col gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-primary" data-testid={`${testIdPrefix}-period-label`}>{periodLabel}</h3>
          <p className="mt-1 text-xs text-text-muted">{frequency === 'monthly' ? 'Monthly entries with annual total' : 'Annual entry'}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {isRevenue ? (
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">Currency</Label>
              <Select value={data.turnover_currency || 'INR'} onValueChange={(value) => onChange({ turnover_currency: value })} disabled={disabled}>
                <SelectTrigger className="h-9 w-24" data-testid={`${testIdPrefix}-currency-select`}><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">Unit</Label>
              <Input value={data.production_unit || ''} onChange={(event) => onChange({ production_unit: event.target.value })} placeholder="Unit" className="h-9 w-24" disabled={disabled} data-testid={`${testIdPrefix}-unit-input`} />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-text-muted">Entry type</Label>
            <Select value={frequency} onValueChange={changeFrequency} disabled={disabled}>
              <SelectTrigger className="h-9 w-28" data-testid={`${testIdPrefix}-frequency-select`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="pt-4">
        {frequency === 'yearly' ? (
          <div className="max-w-md space-y-2">
            <Label>{isRevenue ? 'Turnover / Revenue' : 'Production Quantity'}</Label>
            <Input type="number" value={data[yearlyField] || ''} onChange={(event) => onChange({ [yearlyField]: event.target.value })} placeholder={isRevenue ? 'Enter turnover / revenue' : 'Enter production quantity'} disabled={disabled} data-testid={`${testIdPrefix}-yearly-input`} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {months.map((month) => (
                <div key={month} className="space-y-1">
                  <Label className="text-xs text-text-muted">{month}</Label>
                  <Input type="number" className="h-9" placeholder="0" value={data[monthlyField]?.[month] || ''} onChange={(event) => updateMonthlyValue(month, event.target.value)} disabled={disabled} data-testid={`${testIdPrefix}-${month.toLowerCase()}-input`} />
                </div>
              ))}
            </div>
            <p className="text-sm font-medium text-text-secondary" data-testid={`${testIdPrefix}-monthly-total`}>
              Annual total: {isRevenue ? `${data.turnover_currency || 'INR'} ` : ''}{monthlyTotal.toLocaleString()}{!isRevenue ? ` ${data.production_unit || ''}` : ''}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};