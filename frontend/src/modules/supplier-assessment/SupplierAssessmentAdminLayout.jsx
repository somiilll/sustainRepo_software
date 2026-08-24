import React from 'react';
import { Outlet } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';

export default function SupplierAssessmentAdminLayout() {
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  return <div className="space-y-6" data-testid="supplier-assessment-admin-layout">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4" data-testid="supplier-assessment-period-bar">
      <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-emerald-700" /><Label htmlFor="supplier-assessment-reporting-period" className="text-sm">Reporting period</Label><Select value={reportingPeriod} onValueChange={setReportingPeriod}><SelectTrigger id="supplier-assessment-reporting-period" className="w-36" data-testid="supplier-assessment-reporting-period-selector"><SelectValue /></SelectTrigger><SelectContent>{periods.map((period) => <SelectItem key={period} value={period} data-testid={`supplier-assessment-period-option-${period}`}>{period}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <Outlet />
  </div>;
}