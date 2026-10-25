import React from 'react';
import { CheckSquare2, SquareX } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';

export const FacilityAssignmentPicker = ({
  facilities,
  selectedIds,
  onChange,
  testIdPrefix,
}) => {
  const selected = new Set(selectedIds);
  const toggle = (facilityId, checked) => {
    onChange(checked
      ? [...selectedIds, facilityId]
      : selectedIds.filter((item) => item !== facilityId));
  };

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-facility-picker`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-800">
          Facilities <span className="text-red-600">*</span>
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(facilities.map((facility) => facility.id))}
            data-testid={`${testIdPrefix}-select-all-facilities-button`}
          >
            <CheckSquare2 className="mr-1.5 h-4 w-4" /> Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            data-testid={`${testIdPrefix}-clear-facilities-button`}
          >
            <SquareX className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto border-y border-stone-200" data-testid={`${testIdPrefix}-facility-options`}>
        {facilities.map((facility) => (
          <label
            key={facility.id}
            className="flex cursor-pointer items-center gap-3 border-b border-stone-100 px-1 py-3 last:border-b-0 hover:bg-stone-50"
          >
            <Checkbox
              checked={selected.has(facility.id)}
              onCheckedChange={(checked) => toggle(facility.id, checked === true)}
              data-testid={`${testIdPrefix}-facility-${facility.id}-checkbox`}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-stone-900">{facility.name}</span>
              <span className="block text-xs text-stone-500">{facility.city || facility.country || facility.facility_type}</span>
            </span>
          </label>
        ))}
        {facilities.length === 0 && (
          <p className="px-1 py-5 text-sm text-stone-500" data-testid={`${testIdPrefix}-no-facilities-message`}>
            No facilities are available for assignment.
          </p>
        )}
      </div>
      <p className="text-xs text-stone-500" data-testid={`${testIdPrefix}-facility-selection-count`}>
        {selectedIds.length} of {facilities.length} facilities selected
      </p>
    </div>
  );
};