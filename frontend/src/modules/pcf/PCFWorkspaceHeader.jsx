import React, { useMemo } from 'react';
import { CalendarRange, Factory, PackageSearch } from 'lucide-react';
import { ModulePageHeader } from '../../components/ModulePageHeader';

const financialPeriod = (year) => `FY ${year}-${year + 1}`;

const getPeriodOptions = () => {
  const now = new Date();
  const startYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return Array.from({ length: 6 }, (_, index) => financialPeriod(startYear - index));
};

export const PCFWorkspaceHeader = ({ facilities, facilityId, onFacilityChange, reportingPeriod, onReportingPeriodChange }) => {
  const periodOptions = useMemo(getPeriodOptions, []);
  return (
    <ModulePageHeader title="PCF" icon={PackageSearch} iconClassName="border-teal-200 bg-teal-50 text-teal-700" testId="pcf" aside={<div className="flex flex-col gap-3 sm:flex-row sm:items-end" data-testid="pcf-header-controls">
        <label className="grid min-w-[220px] gap-1 text-xs font-medium text-stone-600" data-testid="pcf-facility-selector-label"><span className="flex items-center gap-1.5"><Factory className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />Facility</span><select value={facilityId} onChange={(event) => onFacilityChange(event.target.value)} className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm text-stone-900 outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" data-testid="pcf-facility-selector"><option value="">Organization level</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}{facility.country ? ` (${facility.country})` : ''}</option>)}</select></label>
        <label className="grid min-w-[180px] gap-1 text-xs font-medium text-stone-600" data-testid="pcf-reporting-period-label"><span className="flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />Reporting period</span><select value={reportingPeriod} onChange={(event) => onReportingPeriodChange(event.target.value)} className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm text-stone-900 outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" data-testid="pcf-reporting-period-selector">{periodOptions.map((period) => <option key={period} value={period}>{period}</option>)}</select></label>
      </div>} />
  );
};