import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';

export default function SupplierAssessmentAdminLayout() {
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  const location = useLocation();
  const rankingOwnsPeriodControl = location.pathname.endsWith('/supplier-assessment/ranking');
  const supplierListOwnsPeriodControl = location.pathname.endsWith('/supplier-assessment/suppliers');
  const supplierGhgOwnsPeriodControl = location.pathname.endsWith('/supplier-assessment/ghg');
  const questionnaireOwnsPeriodControl = location.pathname.endsWith('/supplier-assessment/esg');
  const documentsOwnPeriodControl = location.pathname.endsWith('/supplier-assessment/documents');
  const trainingOwnsPeriodControl = location.pathname.endsWith('/supplier-assessment/trainings');
  return <div className="relative space-y-6" data-testid="supplier-assessment-admin-layout">
    {!rankingOwnsPeriodControl && !supplierListOwnsPeriodControl && !supplierGhgOwnsPeriodControl && !questionnaireOwnsPeriodControl && !documentsOwnPeriodControl && !trainingOwnsPeriodControl && <div className="static flex justify-end sm:absolute sm:right-0 sm:top-0" data-testid="supplier-assessment-period-bar">
      <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-emerald-700" /><Label htmlFor="supplier-assessment-reporting-period" className="text-sm">Reporting period</Label><Select value={reportingPeriod} onValueChange={setReportingPeriod}><SelectTrigger id="supplier-assessment-reporting-period" className="w-36 bg-white" data-testid="supplier-assessment-period-selector"><SelectValue /></SelectTrigger><SelectContent>{periods.map((period) => <SelectItem key={period} value={period} data-testid={`supplier-assessment-period-option-${period}`}>{period}</SelectItem>)}</SelectContent></Select></div>
    </div>}
    <Outlet />
  </div>;
}