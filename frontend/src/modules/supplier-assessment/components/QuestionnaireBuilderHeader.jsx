import React from 'react';
import { CalendarDays, ClipboardCheck } from 'lucide-react';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

export const QuestionnaireBuilderHeader = ({ reportingPeriod, periods, onReportingPeriodChange }) => (
  <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 xl:flex-row xl:items-center xl:justify-between" data-testid="questionnaire-builder-header">
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm" data-testid="questionnaire-builder-heading-icon">
        <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-bold text-emerald-950" data-testid="questionnaire-builder-heading">ESG Questionnaire</h1>
    </div>
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center" data-testid="questionnaire-builder-period-control">
      <Label htmlFor="questionnaire-builder-reporting-period" className="flex shrink-0 items-center gap-2 text-sm font-medium text-stone-600" data-testid="questionnaire-builder-period-label">
        <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        Reporting period
      </Label>
      <Select value={reportingPeriod} onValueChange={onReportingPeriodChange}>
        <SelectTrigger id="questionnaire-builder-reporting-period" className="h-10 w-full rounded-full border-stone-200 bg-stone-50 font-medium text-stone-800 shadow-none transition-[border-color,box-shadow] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:w-44" data-testid="questionnaire-builder-period-selector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-testid="questionnaire-builder-period-menu">
          {periods.map((period) => <SelectItem key={period} value={period} data-testid={`questionnaire-builder-period-option-${period}`}>{period}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  </header>
);