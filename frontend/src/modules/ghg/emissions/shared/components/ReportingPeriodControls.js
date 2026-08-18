import React, { useMemo } from 'react';
import { Label } from '../../../../../components/ui/label';

export const ReportingPeriodControls = ({
  reportingYearType,
  setReportingYearType,
  hasOrgYearTypePreference,
  reportingYear,
  setReportingYear,
  frequencyType,
  setFrequencyType,
  editingEmission,
  setMonthlyData,
  setYearlyData,
  setExpandedMonths,
}) => {
  const yearOptionsHtml = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const year = new Date().getFullYear() - index;
    const label = reportingYearType === 'financial' ? `FY ${year}-${String(year + 1).slice(-2)}` : year;
    return `<option value="${year}">${label}</option>`;
  }).join(''), [reportingYearType]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="emission-reporting-period-controls">
    <div className="space-y-2">
      <Label htmlFor="reporting-year-type-select">Reporting Year Type <span className="text-red-500">*</span></Label>
      {!hasOrgYearTypePreference ? (
        <select
          id="reporting-year-type-select"
          value={reportingYearType}
          onChange={(event) => {
            setReportingYearType(event.target.value);
            setMonthlyData({});
          }}
          className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          data-testid="reporting-year-type-select"
        >
          <option value="calendar">Calendar Year (Jan–Dec)</option>
          <option value="financial">Financial Year (Apr–Mar)</option>
        </select>
      ) : (
        <div className="flex h-10 items-center border border-stone-200 bg-stone-50 px-3 text-sm" data-testid="reporting-year-type-locked">
          {reportingYearType === 'financial' ? 'Financial Year' : 'Calendar Year'}
          <span className="ml-2 text-xs text-stone-500">From organization settings</span>
        </div>
      )}
    </div>

    <div className="space-y-2">
      <Label htmlFor="reporting-year-select">{reportingYearType === 'financial' ? 'Financial Year' : 'Reporting Year'} <span className="text-red-500">*</span></Label>
      <select
        id="reporting-year-select"
        value={reportingYear}
        onChange={(event) => {
          setReportingYear(event.target.value);
          setMonthlyData({});
        }}
        className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        data-testid="reporting-year-select"
        dangerouslySetInnerHTML={{ __html: yearOptionsHtml }}
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="frequency-type-select">Data Entry Frequency <span className="text-red-500">*</span></Label>
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
        className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="frequency-type-select"
      >
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly (annual total)</option>
      </select>
      {editingEmission && <p className="text-xs text-amber-700" data-testid="frequency-type-locked-message">Locked when editing</p>}
    </div>
    </div>
  );
};

export default ReportingPeriodControls;