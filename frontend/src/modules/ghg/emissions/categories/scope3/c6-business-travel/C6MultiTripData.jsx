import React from 'react';
import { MapPin, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../../../../components/ui/button';
import { Input } from '../../../../../../components/ui/input';
import { Label } from '../../../../../../components/ui/label';
import { DynamicFieldRenderer } from '../../../shared/components/DynamicFieldRenderer';
import { FlightDetailsSection } from '../../../../../../components/FlightDetailsSection';

const getCompoundSuffix = (field, trip) => {
  if (!field?.compoundWithVariable) return '';
  const unit = trip?.[`${field.compoundWithVariable}_unit`];
  return typeof unit === 'string' ? unit.trim() : '';
};

const TripEvidence = ({ periodKey, trip, onUpload, onRemove }) => {
  const inputId = `c6-trip-evidence-${periodKey}-${trip.id}`;
  const evidences = trip.evidences || [];

  return (
    <div className="border-t border-stone-200 pt-4" data-testid={`c6-trip-${trip.id}-evidence-section`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label htmlFor={inputId} className="text-sm font-medium">Evidence <span className="text-xs font-normal text-stone-500">(Optional)</span></Label>
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
        <label
          htmlFor={inputId}
          className="inline-flex h-9 cursor-pointer items-center gap-2 border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 transition-colors hover:border-emerald-600 hover:text-emerald-700"
          data-testid={`c6-trip-${trip.id}-evidence-upload-button`}
        >
          <Paperclip className="h-4 w-4" /> Upload evidence
        </label>
      </div>
      {evidences.length > 0 && (
        <div className="mt-3 space-y-2" data-testid={`c6-trip-${trip.id}-evidence-list`}>
          {evidences.map((evidence, index) => (
            <div key={`${evidence.file_id || evidence.url}-${index}`} className="flex min-w-0 items-center justify-between gap-3 border border-stone-100 bg-stone-50 px-3 py-2">
              <span className="min-w-0 truncate text-xs text-stone-700" data-testid={`c6-trip-${trip.id}-evidence-name-${index}`}>{evidence.filename}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(periodKey, trip.id, index)}
                aria-label={`Remove ${evidence.filename}`}
                className="h-7 w-7 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                data-testid={`c6-trip-${trip.id}-evidence-remove-${index}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TripFields = ({ trip, periodKey, frequencyType, dynamicInputFields, updateTrip, fieldRendererProps, showFlightDetails, onUploadEvidence, onRemoveEvidence }) => {
  const testIdSuffix = `-trip-${trip.id}`;
  const updateField = (_, field, value) => updateTrip(periodKey, trip.id, field, value);

  return (
    <div className="space-y-5 border border-stone-200 bg-white p-4 sm:p-5" data-testid={`c6-trip-${trip.id}-fields`}>
      <div className="grid grid-cols-1 gap-x-5 gap-y-5 md:grid-cols-2" data-testid={`c6-trip-${trip.id}-dynamic-fields`}>
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
        <div className="space-y-2">
          <Label htmlFor={`c6-trip-${trip.id}-from-location`} className="flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4 text-emerald-700" />Departure</Label>
          <Input
            id={`c6-trip-${trip.id}-from-location`}
            value={trip.from_location || ''}
            onChange={(event) => updateTrip(periodKey, trip.id, 'from_location', event.target.value)}
            placeholder="Enter departure location"
            data-testid={`c6-trip-${trip.id}-from-location-input`}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`c6-trip-${trip.id}-to-location`} className="flex items-center gap-2 text-sm font-medium"><MapPin className="h-4 w-4 text-emerald-700" />Arrival</Label>
          <Input
            id={`c6-trip-${trip.id}-to-location`}
            value={trip.to_location || ''}
            onChange={(event) => updateTrip(periodKey, trip.id, 'to_location', event.target.value)}
            placeholder="Enter arrival location"
            data-testid={`c6-trip-${trip.id}-to-location-input`}
          />
        </div>
      </div>
      {showFlightDetails && (
        <FlightDetailsSection
          monthKey={periodKey}
          data={trip}
          updateMonthData={updateField}
          testIdSuffix={testIdSuffix}
        />
      )}
      <TripEvidence periodKey={periodKey} trip={trip} onUpload={onUploadEvidence} onRemove={onRemoveEvidence} />
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
                  <div className="flex items-center justify-between gap-3 bg-stone-50 px-4 py-3">
                    <span className="text-sm font-semibold text-stone-800" data-testid={`c6-trip-${trip.id}-title`}>Trip {index + 1}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveTrip(group.key, trip.id)} aria-label={`Remove trip ${index + 1}`} className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" data-testid={`c6-remove-trip-${trip.id}-button`}><Trash2 className="h-4 w-4" /></Button>
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