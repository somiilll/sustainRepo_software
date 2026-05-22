/**
 * useReportingYearFormat — exposes year-helper functions that conform to
 * the organization's reporting_year_type (calendar / financial).
 *
 * Returns `{ format, parse, mode, sampleYears }` where:
 *   - format(year)   — number → string (e.g. 2025 → "FY2025-26" or "CY2025")
 *   - parse(value)   — string → number (best-effort, returns NaN on failure)
 *   - mode           — 'financial' | 'calendar'
 *   - sampleYears    — list of next 20 years already formatted (for selects)
 */
import { useMemo } from 'react';

export default function useReportingYearFormat(organization) {
  return useMemo(() => {
    const isFinancial = organization?.reporting_year_type === 'financial_year';
    const mode = isFinancial ? 'financial' : 'calendar';

    const format = (year) => {
      if (year == null || year === '' || Number.isNaN(Number(year))) return '';
      const y = Number(year);
      if (isFinancial) {
        // FY2025-26
        const next = (y + 1) % 100;
        return `FY${y}-${String(next).padStart(2, '0')}`;
      }
      return `CY${y}`;
    };

    const parse = (value) => {
      if (!value) return NaN;
      const s = String(value).trim().toUpperCase();
      const match = s.match(/(\d{4})/);
      return match ? Number(match[1]) : NaN;
    };

    const thisYear = new Date().getFullYear();
    const sampleYears = Array.from({ length: 21 }, (_, i) => {
      const y = thisYear + i;
      return { value: format(y), label: format(y), year: y };
    });

    return { format, parse, mode, sampleYears };
  }, [organization?.reporting_year_type]);
}
