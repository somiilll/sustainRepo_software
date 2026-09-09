/**
 * DashboardFilters — date-range + facility multi-select + reset button.
 * Shared between both Scope variants.
 */
import React from 'react';
import { format } from 'date-fns';
import { Check } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { MonthYearPicker } from '../../../components/ui/month-year-picker';

export default function DashboardFilters({
  facilities,
  selectedFacilities,
  setSelectedFacilities,
  dateRange,
  setDateRange,
  showFacilityDropdown,
  setShowFacilityDropdown,
  facilityDropdownRef,
  getCurrentFinancialYear,
}) {
  return (
    <Card className="border border-stone-200 bg-stone-50/70 p-3 shadow-none" data-testid="filter-panel">
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_10rem]">
        {/* Month/Year Range Picker */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Date Range</Label>
          <div className="flex gap-2 items-center">
            <MonthYearPicker
              value={dateRange.from ? format(dateRange.from, 'yyyy-MM') : ''}
              onChange={(val) => {
                const newFrom = val ? new Date(val + '-01') : null;
                setDateRange(prev => ({
                  ...prev,
                  from: newFrom,
                  to: prev.to && newFrom && prev.to < newFrom ? null : prev.to,
                }));
              }}
              maxDate={dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined}
              disableFuture={true}
              placeholder="From"
              className="flex-1 bg-stone-50"
            />
            <span className="text-stone-400 text-xs">→</span>
            <MonthYearPicker
              value={dateRange.to ? format(dateRange.to, 'yyyy-MM') : ''}
              onChange={(val) => setDateRange(prev => ({
                ...prev,
                to: val ? new Date(val + '-01') : null,
              }))}
              minDate={dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined}
              disableFuture={true}
              placeholder="To"
              className="flex-1 bg-stone-50"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                const currentYear = new Date().getFullYear();
                const currentMonth = new Date().getMonth() + 1;
                const fyStartYear = currentMonth < 4 ? currentYear - 1 : currentYear;
                setDateRange({
                  from: new Date(`${fyStartYear}-04-01`),
                  to: new Date(`${fyStartYear + 1}-03-01`),
                });
              }}
              className="px-2 py-0.5 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors font-medium"
              data-testid="filter-current-financial-year-button"
            >
              Current FY
            </button>
            <button
              onClick={() => {
                const currentYear = new Date().getFullYear();
                const currentMonth = new Date().getMonth() + 1;
                const fyStartYear = currentMonth < 4 ? currentYear - 2 : currentYear - 1;
                setDateRange({
                  from: new Date(`${fyStartYear}-04-01`),
                  to: new Date(`${fyStartYear + 1}-03-01`),
                });
              }}
              className="px-2 py-0.5 text-[10px] bg-stone-100 hover:bg-stone-200 rounded transition-colors font-medium"
              data-testid="filter-previous-financial-year-button"
            >
              Previous FY
            </button>
          </div>
        </div>

        {/* Facility Filter */}
        <div className="space-y-1.5 relative" ref={facilityDropdownRef}>
          <Label className="text-xs font-medium">Facility</Label>
          <button
            type="button"
            aria-expanded={showFacilityDropdown}
            className="flex h-10 w-full flex-wrap items-center gap-1 rounded-md border border-stone-200 bg-white px-3 text-left transition-[border-color,background-color] duration-200 hover:border-stone-300 hover:bg-stone-50"
            onClick={() => setShowFacilityDropdown(!showFacilityDropdown)}
            data-testid="facility-filter"
          >
            {selectedFacilities.length === 0 ? (
              // <span className="text-stone-500 text-sm">All Facilities</span>
              <span className="text-stone-700 text-sm font-medium">All Facilities</span>
            ) : (
              selectedFacilities.map(fid => {
                const facility = facilities.find(f => f.id === fid);
                return (
                  <span key={fid} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                    {facility?.name}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFacilities(prev => prev.filter(id => id !== fid));
                      }}
                      className="hover:text-red-500"
                      data-testid={`remove-facility-filter-${fid}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })
            )}
          </button>
          {showFacilityDropdown && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              <div
                className="px-3 py-1.5 hover:bg-stone-50 cursor-pointer flex items-center gap-2 text-sm"
                onClick={() => {
                  setSelectedFacilities([]);
                  setShowFacilityDropdown(false);
                }}
                data-testid="facility-filter-all-option"
              >
                {selectedFacilities.length === 0 && <Check className="w-3.5 h-3.5 text-primary" />}
                <span>All Facilities</span>
              </div>
              {facilities.map(f => (
                <div
                  key={f.id}
                  className="px-3 py-1.5 hover:bg-stone-50 cursor-pointer flex items-center gap-2 text-sm"
                  onClick={() => {
                    setSelectedFacilities(prev =>
                      prev.includes(f.id)
                        ? prev.filter(id => id !== f.id)
                        : [...prev, f.id]
                    );
                  }}
                  data-testid={`facility-filter-option-${f.id}`}
                >
                  {selectedFacilities.includes(f.id) && <Check className="w-3.5 h-3.5 text-primary" />}
                  <span className={selectedFacilities.includes(f.id) ? 'font-medium' : ''}>{f.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clear Filters */}
        <div className="space-y-1.5">
          <Button
            onClick={() => {
              setSelectedFacilities([]);
              setDateRange(getCurrentFinancialYear());
              setShowFacilityDropdown(false);
            }}
            variant="outline"
            size="sm"
            className="h-10 w-full"
            data-testid="clear-filters-btn"
          >
            Reset to Default
          </Button>
        </div>
      </div>
    </Card>
  );
}
