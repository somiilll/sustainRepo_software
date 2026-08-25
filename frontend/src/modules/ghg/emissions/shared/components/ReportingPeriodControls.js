import { useMemo } from 'react';
import { Label } from '../../../../../components/ui/label';
import { CalendarDays, CalendarRange, Repeat2 } from 'lucide-react';

export const ReportingPeriodControls = ({
  reportingYearType,
  reportingYear,
  setReportingYear,
  frequencyType,
  setFrequencyType,
  editingEmission,
  setMonthlyData,
  setYearlyData,
  setExpandedMonths,
  assignedReportingPeriod = null,
}) => {
  const yearOptionsHtml = useMemo(() => assignedReportingPeriod
    ? `<option value="${assignedReportingPeriod.reporting_year}">${assignedReportingPeriod.reporting_period}</option>`
    : Array.from({ length: 6 }, (_, index) => {
    const year = new Date().getFullYear() - index;
    const label = reportingYearType === 'financial' ? `FY ${year}-${String(year + 1).slice(-2)}` : year;
    return `<option value="${year}">${label}</option>`;
  }).join(''), [assignedReportingPeriod, reportingYearType]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2" data-testid="emission-reporting-period-controls">
    <div className="space-y-2">
      <Label htmlFor="reporting-year-select">{reportingYearType === 'financial' ? 'Financial Year' : 'Reporting Year'} <span className="text-red-500">*</span></Label>
      <div className="relative">
        {reportingYearType === 'financial'
          ? <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden="true" />
          : <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden="true" />}
        <select
          id="reporting-year-select"
          value={reportingYear}
          onChange={(event) => {
            setReportingYear(event.target.value);
            setMonthlyData({});
          }}
          disabled={Boolean(assignedReportingPeriod)}
          className="h-10 w-full border border-stone-200 bg-stone-50 px-3 pl-10 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          data-testid="reporting-year-select"
          dangerouslySetInnerHTML={{ __html: yearOptionsHtml }}
        />
      </div>
      {assignedReportingPeriod && <p className="text-xs text-emerald-700" data-testid="supplier-assigned-reporting-period-message">Assigned by your customer: {assignedReportingPeriod.reporting_period}</p>}
    </div>

    <div className="space-y-2">
      <Label htmlFor="frequency-type-select">Data Entry Frequency <span className="text-red-500">*</span></Label>
      <div className="relative">
        <Repeat2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden="true" />
        <select
          id="frequency-type-select"
          value={frequencyType}
          onChange={(event) => {
            const nextFrequency = event.target.value;
            setFrequencyType(nextFrequency);
            if (nextFrequency === 'monthly') {
              setYearlyData({});
            } else {
              setMonthlyData({});
              setExpandedMonths([]);
            }
          }}
          disabled={Boolean(editingEmission)}
          className="h-10 w-full border border-stone-200 bg-stone-50 px-3 pl-10 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="frequency-type-select"
        >
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly (annual total)</option>
        </select>
      </div>
      {editingEmission && <p className="text-xs text-amber-700" data-testid="frequency-type-locked-message">Locked when editing</p>}
    </div>
    </div>
  );
};

export default ReportingPeriodControls;