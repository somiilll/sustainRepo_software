const isCurrencyConversionProperty = (entry = {}) => {
  const identity = `${entry.property || ''} ${entry.property_label || ''}`.toLowerCase();
  return identity.includes('exchange_rate')
    || identity.includes('standard currency exchange rate')
    || identity.includes('purchase power value')
    || /\bppp\b/.test(identity);
};

export const resolveCurrencyDirection = (entry = {}, auditLog = []) => {
  if (!isCurrencyConversionProperty(entry)) return null;

  const spendInput = auditLog.find((candidate) => (
    candidate.step === 'input'
    && ['spent_value', 'spend_amount', 'spend_value'].includes(candidate.variable)
  ));
  const sourceCurrency = entry.source_currency || spendInput?.unit;
  const targetCurrency = entry.target_currency || 'USD';

  if (!sourceCurrency) return null;
  return `${String(sourceCurrency).toUpperCase()} (Source Currency) → ${String(targetCurrency).toUpperCase()} (Target Currency)`;
};