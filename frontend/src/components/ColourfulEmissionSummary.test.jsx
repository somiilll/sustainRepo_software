import { resolveCurrencyDirection } from '../lib/currencyAuditDisplay';

describe('resolveCurrencyDirection', () => {
  const exchangeRateEntry = {
    step: 'resolve_property',
    property: 'exchange_rate',
    property_label: 'Standard Currency Exchange Rate',
    value: 0.92,
  };

  it('uses the selected spend currency instead of a hard-coded INR label', () => {
    const auditLog = [
      { step: 'input', variable: 'spent_value', value: 500, unit: 'EUR' },
      exchangeRateEntry,
    ];

    expect(resolveCurrencyDirection(exchangeRateEntry, auditLog)).toBe(
      'EUR (Source Currency) → USD (Target Currency)',
    );
  });

  it('does not show a currency direction when the audit has no source currency', () => {
    expect(resolveCurrencyDirection(exchangeRateEntry, [exchangeRateEntry])).toBeNull();
  });
});