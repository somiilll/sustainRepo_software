const SERIES_COLORS = ['#059669', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#64748b'];

const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const reportingMonths = (reportingPeriod, records) => {
  const compactPeriod = String(reportingPeriod || '').replace(/\s/g, '').toUpperCase();
  const calendarMatch = compactPeriod.match(/^CY(\d{4})$/);
  if (calendarMatch) return Array.from({ length: 12 }, (_, index) => `${calendarMatch[1]}-${String(index + 1).padStart(2, '0')}`);

  const financialMatch = compactPeriod.match(/^FY(\d{4})-(\d{2}|\d{4})$/);
  if (financialMatch) {
    const startYear = Number(financialMatch[1]);
    const endYear = startYear + 1;
    return [
      ...Array.from({ length: 9 }, (_, index) => `${startYear}-${String(index + 4).padStart(2, '0')}`),
      ...Array.from({ length: 3 }, (_, index) => `${endYear}-${String(index + 1).padStart(2, '0')}`),
    ];
  }

  return [...new Set(records.map((record) => record.reporting_period).filter((period) => /^\d{4}-\d{2}$/.test(period || '')))].sort();
};

const monthLabel = (period) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export const buildSupplierEmissionsAnalytics = (payload = {}, reportingPeriod = '') => {
  const records = payload.emissions || [];
  const supplierTotals = (payload.supplier_totals || [])
    .filter((supplier) => hasNumber(supplier.total))
    .map((supplier) => ({
      supplier_id: supplier.supplier_relationship_id,
      company_name: supplier.supplier_name,
      scope1_emissions: Number(supplier.scope1 || 0),
      scope2_emissions: Number(supplier.scope2 || 0),
      total_emissions: Number(supplier.total || 0),
      revenue_percentage: supplier.revenue_percentage,
    }))
    .sort((a, b) => b.total_emissions - a.total_emissions);
  const scopeTotals = supplierTotals.reduce((totals, supplier) => ({
    scope1: totals.scope1 + supplier.scope1_emissions,
    scope2: totals.scope2 + supplier.scope2_emissions,
    total: totals.total + supplier.total_emissions,
  }), { scope1: 0, scope2: 0, total: 0 });
  const intensityData = (payload.supplier_totals || [])
    .filter((supplier) => hasNumber(supplier.total_intensity))
    .map((supplier) => ({
      supplier_id: supplier.supplier_relationship_id,
      company_name: supplier.supplier_name,
      intensity: Number(supplier.total_intensity),
      revenue_currency: supplier.revenue_currency,
    }))
    .sort((a, b) => b.intensity - a.intensity);

  const scopeCategoryTotals = new Map();
  records.forEach((record) => {
    if (!['scope1', 'scope2'].includes(record.scope) || !hasNumber(record.attributed_emissions)) return;
    const category = record.category || 'Uncategorized';
    const value = Number(record.attributed_emissions);
    const key = `${record.scope}:${category}`;
    const current = scopeCategoryTotals.get(key) || { scope: record.scope, name: category, value: 0 };
    current.value += value;
    scopeCategoryTotals.set(key, current);
  });
  const scopeCategoryData = [...scopeCategoryTotals.values()].sort((a, b) => b.value - a.value);

  const monthlyTotals = new Map();
  records.forEach((record) => {
    if (!/^\d{4}-\d{2}$/.test(record.reporting_period || '') || !['scope1', 'scope2'].includes(record.scope) || !hasNumber(record.attributed_emissions)) return;
    const totals = monthlyTotals.get(record.reporting_period) || { scope1: 0, scope2: 0 };
    totals[record.scope] += Number(record.attributed_emissions);
    monthlyTotals.set(record.reporting_period, totals);
  });
  const monthlyTrend = reportingMonths(reportingPeriod, records).map((period) => ({
    period,
    month: monthLabel(period),
    total_attributed_emissions: monthlyTotals.has(period) ? monthlyTotals.get(period).scope1 + monthlyTotals.get(period).scope2 : null,
    scope1_attributed_emissions: monthlyTotals.has(period) ? monthlyTotals.get(period).scope1 : null,
    scope2_attributed_emissions: monthlyTotals.has(period) ? monthlyTotals.get(period).scope2 : null,
  }));

  return { supplierTotals, scopeTotals, intensityData, scopeCategoryData, monthlyTrend };
};