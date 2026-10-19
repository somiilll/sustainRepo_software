/**
 * EmissionFilters - Filter panel for emissions list
 * 
 * Handles facility, category, entry type, date range, and calculation method filters.
 * All filters displayed in a single row for compact layout.
 */

import React from 'react';
import { format } from 'date-fns';
import { Card } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { MonthYearPicker } from '../../components/ui/month-year-picker';

const EmissionFilters = ({
  // Filter values
  filterFacility,
  setFilterFacility,
  filterCategory,
  setFilterCategory,
  filterFrequency,
  setFilterFrequency,
  filterCalculationMethod,
  setFilterCalculationMethod,
  filterDateRange,
  setFilterDateRange,

  // Data for options
  facilities,
  uniqueCategories,
  uniqueCalculationMethods = [],

  // Scope check
  isScope3 = false,
}) => {

  const clearFilters = () => {
    setFilterFacility('');
    setFilterCategory('');
    setFilterFrequency('');

    if (setFilterCalculationMethod) {
      setFilterCalculationMethod('');
    }

    setFilterDateRange({ from: null, to: null });
  };

  const hasActiveFilters =
    filterFacility ||
    filterCategory ||
    filterFrequency ||
    filterCalculationMethod ||
    filterDateRange.from ||
    filterDateRange.to;

  return (
    <Card className="p-4 border border-stone-200 rounded-xl bg-white">
      {/* Single row for all filters */}
      <div className="flex flex-wrap items-end gap-3">

        {/* FACILITY */}
        <div className="space-y-1 min-w-[140px] flex-1">
          <Label className="text-xs">Facility</Label>
          <select
            value={filterFacility}
            onChange={(e) => setFilterFacility(e.target.value)}
            className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-2 text-sm"
            data-testid="filter-facility-select"
          >
            <option value="">All Facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* CATEGORY */}
        <div className="space-y-1 min-w-[140px] flex-1">
          <Label className="text-xs">Category</Label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-2 text-sm"
            data-testid="filter-category-select"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* ENTRY TYPE */}
        <div className="space-y-1 min-w-[120px]">
          <Label className="text-xs">Entry Type</Label>
          <select
            value={filterFrequency}
            onChange={(e) => setFilterFrequency(e.target.value)}
            className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-2 text-sm"
            data-testid="filter-frequency-select"
          >
            <option value="">All Entries</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        {/* CALCULATION METHOD — ONLY SCOPE 3 */}
        {isScope3 && (
          <div className="space-y-1 min-w-[140px]">
            <Label className="text-xs">Calc Method</Label>
            <select
              value={filterCalculationMethod || ''}
              onChange={(e) => setFilterCalculationMethod?.(e.target.value)}
              className="w-full h-9 bg-stone-50 border border-stone-200 rounded-lg px-2 text-sm"
              data-testid="filter-calculation-method-select"
            >
              <option value="">All Methods</option>
              {uniqueCalculationMethods.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* START PERIOD */}
        <div className="space-y-1 min-w-[120px]">
          <Label className="text-xs">From</Label>
          <MonthYearPicker
            value={
              filterDateRange.from
                ? format(filterDateRange.from, 'yyyy-MM')
                : ''
            }
            maxDate={
              filterDateRange.to
                ? format(filterDateRange.to, 'yyyy-MM')
                : undefined
            }
            disableFuture={true}
            onChange={(val) =>
              setFilterDateRange((prev) => ({
                ...prev,
                from: val ? new Date(val) : null,
              }))
            }
            placeholder="Start"
            className="w-full bg-stone-50 h-9"
          />
        </div>

        {/* END PERIOD */}
        <div className="space-y-1 min-w-[120px]">
          <Label className="text-xs">To</Label>
          <MonthYearPicker
            value={
              filterDateRange.to
                ? format(filterDateRange.to, 'yyyy-MM')
                : ''
            }
            minDate={
              filterDateRange.from
                ? format(filterDateRange.from, 'yyyy-MM')
                : undefined
            }
            disableFuture={true}
            onChange={(val) =>
              setFilterDateRange((prev) => ({
                ...prev,
                to: val ? new Date(val) : null,
              }))
            }
            placeholder="End"
            className="w-full bg-stone-50 h-9"
          />
        </div>

        {/* CLEAR FILTERS */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="h-9 px-3 text-xs"
              data-testid="clear-filters-button"
            >
              Clear
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default EmissionFilters;
