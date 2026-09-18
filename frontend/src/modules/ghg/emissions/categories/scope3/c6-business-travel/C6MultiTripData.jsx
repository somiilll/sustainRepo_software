import React from 'react';
import { FileText, MapPin, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '../../../../../../components/ui/button';
import { Input } from '../../../../../../components/ui/input';
import { Label } from '../../../../../../components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../../../../components/ui/tooltip';
import { DynamicFieldRenderer } from '../../../shared/components/DynamicFieldRenderer';
import { FlightDetailsSection } from '../../../../../../components/FlightDetailsSection';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const getCompoundSuffix = (field, trip) => {
  if (!field?.compoundWithVariable) return '';
  const unit = trip?.[`${field.compoundWithVariable}_unit`];
  return typeof unit === 'string' ? unit.trim() : '';
};

const TripEvidence = ({ periodKey, trip, onUpload, onRemove }) => {
  const inputId = `evidence-${periodKey}-${trip.id}`;
  const evidences = trip.evidences || [];
  const count = evidences.length;

  return (
    <div className="flex min-h-10 items-center justify-center pt-6" data-testid={`c6-trip-${trip.id}-evidence-cell`}>
      <input
        id={inputId}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx,.gif,.webp"
        onChange={async (event) => {
          const files = Array.from(event.target.files || []);
          for (const file of files) await onUpload(periodKey, file, trip.id);
          event.target.value = '';
        }}
        data-testid={`c6-trip-${trip.id}-evidence-input`}
      />
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              htmlFor={inputId}
              aria-label="Upload evidence"
              className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-stone-200 bg-white text-stone-900 transition-colors hover:bg-white hover:text-stone-900"
              data-testid={`c6-trip-${trip.id}-evidence-upload-trigger`}
            >
              <Upload className="h-4 w-4" />
              {count > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-0.5 text-[10px] font-bold text-white" data-testid={`c6-trip-${trip.id}-evidence-count`}>{count}</span>}
            </label>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" className="max-w-xs bg-white text-stone-900 shadow-lg">
            {count === 0 ? (
              <span className="text-xs">Upload evidence (PDF, Excel, Word)</span>
            ) : (
              <div className="space-y-1.5 text-xs">
                <span className="font-medium">{count} file{count > 1 ? 's' : ''} attached</span>
                {evidences.map((evidence, index) => {
                  const fileIdMatch = evidence.url?.match(/\/api\/files\/([a-f0-9-]+)/i);
                  const fileId = fileIdMatch ? fileIdMatch[1] : null;
                  const viewUrl = fileId ? `${BACKEND_URL}/api/files/${fileId}/view` : evidence.url;
                  return (
                    <div key={`${evidence.url || evidence.filename}-${index}`} className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 shrink-0 text-green-600" />
                      <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-stone-900 underline decoration-stone-400 underline-offset-2 transition-colors hover:text-stone-700" title={evidence.filename} data-testid={`c6-trip-${trip.id}-evidence-view-${index}`}>{evidence.filename}</a>
                      <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(periodKey, trip.id, index); }} className="shrink-0 text-red-400 hover:text-red-600" title="Remove" data-testid={`c6-trip-${trip.id}-evidence-remove-${index}`}><X className="h-3 w-3" /></button>
                    </div>
                  );
                })}
                <span className="text-stone-500">Click icon to add more</span>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

const TripFields = ({ trip, periodKey, frequencyType, dynamicInputFields, updateTrip, fieldRendererProps, showFlightDetails, onUploadEvidence, onRemoveEvidence }) => {
  const testIdSuffix = `-trip-${trip.id}`;
  const updateField = (_, field, value) => updateTrip(periodKey, trip.id, field, value);

  return (
    <div className="p-4 sm:p-5" data-testid={`c6-trip-${trip.id}-fields`}>
      <div className="overflow-x-auto pb-1" data-testid={`c6-trip-${trip.id}-row-scroll`}>
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(220px,1fr)] items-start gap-x-5" data-testid={`c6-trip-${trip.id}-row`}>
        {dynamicInputFields.map((field) => (
          <DynamicFieldRenderer
            key={`${trip.id}-${field.id || field.variable}`}
            field={field}
            monthKey={periodKey}
            data={trip}
            updateMonthData={updateField}
            frequencyType={frequencyType}
            testIdSuffix={testIdSuffix}
            compoundSuffix={getCompoundSuffix(field, trip)}
            {...fieldRendererProps}
          />
        ))}
        <TripEvidence periodKey={periodKey} trip={trip} onUpload={onUploadEvidence} onRemove={onRemoveEvidence} />
      </div>
      </div>
      {showFlightDetails && (
        <div className="mt-5">
          <FlightDetailsSection
            monthKey={periodKey}
            data={trip}
            updateMonthData={updateField}
            testIdSuffix={testIdSuffix}
          />
        </div>
      )}
    </div>
  );
};

export const C6MultiTripData = ({
  frequencyType,
  reportingYear,
  reportingYearType,
  activeMonths,
  isFutureMonth,
  c6Trips,
  onAddTrip,
  onRemoveTrip,
  onUpdateTrip,
  onUploadEvidence,
  onRemoveEvidence,
  dynamicInputFields,
  scope3ActivityType,
  capabilities,
  fieldRendererProps,
}) => {
  const isYearly = frequencyType === 'yearly';
  const periodGroups = isYearly
    ? [{ key: 'yearly', label: reportingYearType === 'financial' ? `FY ${reportingYear}-${String(Number(reportingYear) + 1).slice(-2)}` : `CY${reportingYear}`, disabled: false, trips: c6Trips.yearly || [] }]
    : activeMonths.map((month) => ({
      key: month.key,
      label: `${month.name} ${reportingYearType === 'financial' && Number(month.key) <= 3 ? Number(reportingYear) + 1 : reportingYear}`,
      disabled: isFutureMonth(month.key, reportingYear, reportingYearType),
      trips: c6Trips.monthly?.[month.key] || [],
    }));

  return (
    <div className="space-y-6" data-testid="c6-multi-trip-data-entry">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <h3 className="text-base font-semibold text-stone-900" data-testid="c6-multi-trip-heading">{isYearly ? 'Annual business travel trips' : 'Monthly business travel trips'}</h3>
          <p className="mt-1 text-sm text-stone-500" data-testid="c6-multi-trip-summary">{periodGroups.reduce((total, group) => total + group.trips.length, 0)} trip{periodGroups.reduce((total, group) => total + group.trips.length, 0) === 1 ? '' : 's'} added</p>
        </div>
      </div>

      {periodGroups.map((group) => (
        <section key={group.key} className={group.disabled ? 'opacity-60' : ''} data-testid={`c6-trip-period-${group.key}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-stone-800" data-testid={`c6-trip-period-${group.key}-heading`}>{group.label}</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddTrip(group.key)}
              disabled={group.disabled}
              data-testid={`c6-add-trip-${group.key}-button`}
            >
              <Plus className="mr-1.5 h-4 w-4" />Add trip
            </Button>
          </div>
          {group.disabled ? (
            <p className="border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500" data-testid={`c6-trip-period-${group.key}-future-message`}>This period is not available yet.</p>
          ) : group.trips.length === 0 ? (
            <p className="border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500" data-testid={`c6-trip-period-${group.key}-empty-message`}>No trips added.</p>
          ) : (
            <div className="space-y-4">
              {group.trips.map((trip, index) => (
                <div key={trip.id} className="border border-stone-200" data-testid={`c6-trip-${trip.id}-card`}>
                  <div className="grid grid-cols-1 items-end gap-3 bg-stone-50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_minmax(180px,240px)_auto]">
                    <span className="pb-2 text-sm font-semibold text-stone-800" data-testid={`c6-trip-${trip.id}-title`}>Trip {index + 1}</span>
                    <div className="space-y-1.5">
                      <Label htmlFor={`c6-trip-${trip.id}-from-location`} className="flex items-center gap-1.5 text-xs font-medium text-stone-700"><MapPin className="h-3.5 w-3.5 text-emerald-700" />Departure</Label>
                      <Input
                        id={`c6-trip-${trip.id}-from-location`}
                        value={trip.from_location || ''}
                        onChange={(event) => onUpdateTrip(group.key, trip.id, 'from_location', event.target.value)}
                        placeholder="Departure location"
                        className="h-9 bg-white"
                        data-testid={`c6-trip-${trip.id}-from-location-input`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`c6-trip-${trip.id}-to-location`} className="flex items-center gap-1.5 text-xs font-medium text-stone-700"><MapPin className="h-3.5 w-3.5 text-emerald-700" />Arrival</Label>
                      <Input
                        id={`c6-trip-${trip.id}-to-location`}
                        value={trip.to_location || ''}
                        onChange={(event) => onUpdateTrip(group.key, trip.id, 'to_location', event.target.value)}
                        placeholder="Arrival location"
                        className="h-9 bg-white"
                        data-testid={`c6-trip-${trip.id}-to-location-input`}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveTrip(group.key, trip.id)} aria-label={`Remove trip ${index + 1}`} className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700" data-testid={`c6-remove-trip-${trip.id}-button`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <TripFields
                    trip={trip}
                    periodKey={group.key}
                    frequencyType={frequencyType}
                    dynamicInputFields={dynamicInputFields}
                    updateTrip={onUpdateTrip}
                    fieldRendererProps={fieldRendererProps}
                    showFlightDetails={scope3ActivityType === 'air_travel' && capabilities.flightDetails}
                    onUploadEvidence={onUploadEvidence}
                    onRemoveEvidence={onRemoveEvidence}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};

export default C6MultiTripData;