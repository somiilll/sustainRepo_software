/**
 * EmissionFilters - Filter panel for emissions list
 * 
 * Handles facility, category, entry type, date range, and sort filters.
 */

// import React from 'react';
// import { format } from 'date-fns';
// import { Card } from '../../components/ui/card';
// import { Label } from '../../components/ui/label';
// import { Button } from '../../components/ui/button';
// import { MonthYearPicker } from '../../components/ui/month-year-picker';

// const EmissionFilters = ({
//   // Filter values
//   filterFacility,
//   setFilterFacility,
//   filterCategory,
//   setFilterCategory,
//   filterFrequency,
//   setFilterFrequency,
//   filterDateRange,
//   setFilterDateRange,
//   sortBy,
//   setSortBy,
//   sortOrder,
//   setSortOrder,
//   // Data for options
//   facilities,
//   uniqueCategories,
// }) => {
//   const clearFilters = () => {
//     setFilterFacility('');
//     setFilterCategory('');
//     setFilterFrequency('');
//     setFilterDateRange({ from: null, to: null });
//     setSortBy('created_at');
//     setSortOrder('desc');
//   };

//   const hasActiveFilters = filterFacility || filterCategory || filterFrequency || 
//     filterDateRange.from || filterDateRange.to || sortBy !== 'created_at' || sortOrder !== 'desc';

//   return (
//     <Card className="p-4 border border-stone-200 rounded-xl bg-white">
//       <div className="flex flex-col gap-4">
//         {/* First row: Facility, Category, and Entry Type */}
//         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
//           <div className="space-y-2">
//             <Label>Facility</Label>
//             <select
//               value={filterFacility}
//               onChange={(e) => setFilterFacility(e.target.value)}
//               className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
//               data-testid="filter-facility-select"
//             >
//               <option value="">All Facilities</option>
//               {facilities.map(f => (
//                 <option key={f.id} value={f.id}>{f.name}</option>
//               ))}
//             </select>
//           </div>
//           <div className="space-y-2">
//             <Label>Category</Label>
//             <select
//               value={filterCategory}
//               onChange={(e) => setFilterCategory(e.target.value)}
//               className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
//               data-testid="filter-category-select"
//             >
//               <option value="">All Categories</option>
//               {uniqueCategories.map(c => (
//                 <option key={c} value={c}>{c}</option>
//               ))}
//             </select>
//           </div>
//           <div className="space-y-2">
//             <Label>Entry Type</Label>
//             <select
//               value={filterFrequency}
//               onChange={(e) => setFilterFrequency(e.target.value)}
//               className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
//               data-testid="filter-frequency-select"
//             >
//               <option value="">All Entries</option>
//               <option value="monthly">Monthly Only</option>
//               <option value="yearly">Yearly Only</option>
//             </select>
//           </div>
//         </div>
        
//         {/* Second row: Date Range, Sort, and Clear button */}
//         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
//           <div className="space-y-2">
//             <Label>Start Period</Label>
//             <MonthYearPicker
//               value={filterDateRange.from ? format(filterDateRange.from, 'yyyy-MM') : ''}
//               maxDate={filterDateRange.to ? format(filterDateRange.to, 'yyyy-MM') : undefined}
//               disableFuture={true}
//               onChange={(val) => setFilterDateRange(prev => ({ 
//                 ...prev, 
//                 from: val ? new Date(val) : null 
//               }))}
//               placeholder="From"
//               className="w-full bg-stone-50"
//             />
//           </div>
//           <div className="space-y-2">
//             <Label>End Period</Label>
//             <MonthYearPicker
//               value={filterDateRange.to ? format(filterDateRange.to, 'yyyy-MM') : ''}
//               minDate={filterDateRange.from ? format(filterDateRange.from, 'yyyy-MM') : undefined}
//               disableFuture={true}
//               onChange={(val) => setFilterDateRange(prev => ({ 
//                 ...prev, 
//                 to: val ? new Date(val) : null 
//               }))}
//               placeholder="To"
//               className="w-full bg-stone-50"
//             />
//           </div>
//           <div className="space-y-2">
//             <Label>Sort By</Label>
//             <select
//               value={sortBy}
//               onChange={(e) => setSortBy(e.target.value)}
//               className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
//               data-testid="sort-by-select"
//             >
//               <option value="date">Date</option>
//               <option value="created_at">Created At</option>
//               <option value="updated_at">Last Updated</option>
//               <option value="facility">Facility</option>
//               <option value="fuel">Fuel Type</option>
//             </select>
//           </div>
//           <div className="space-y-2">
//             <Label>Order</Label>
//             <select
//               value={sortOrder}
//               onChange={(e) => setSortOrder(e.target.value)}
//               className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
//               data-testid="sort-order-select"
//             >
//               <option value="desc">Newest First</option>
//               <option value="asc">Oldest First</option>
//             </select>
//           </div>
//           <div className="space-y-2 flex items-end">
//             {hasActiveFilters && (
//               <Button
//                 variant="outline"
//                 onClick={clearFilters}
//                 className="w-full"
//                 data-testid="clear-filters-button"
//               >
//                 Clear Filters
//               </Button>
//             )}
//           </div>
//         </div>
//       </div>
//     </Card>
//   );
// };

// export default EmissionFilters;


/**
 * EmissionFilters - Filter panel for emissions list
 * 
 * Handles facility, category, entry type, date range, calculation method,
 * and sort filters.
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
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,

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
    setSortBy('created_at');
    setSortOrder('desc');
  };

  const hasActiveFilters =
    filterFacility ||
    filterCategory ||
    filterFrequency ||
    filterCalculationMethod ||
    filterDateRange.from ||
    filterDateRange.to ||
    sortBy !== 'created_at' ||
    sortOrder !== 'desc';

  return (
    <Card className="p-4 border border-stone-200 rounded-xl bg-white">
      <div className="flex flex-col gap-4">

        {/* FIRST ROW */}
        <div
          className={`grid gap-4 ${
            isScope3
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-3'
          }`}
        >

          {/* FACILITY */}
          <div className="space-y-2">
            <Label>Facility</Label>

            <select
              value={filterFacility}
              onChange={(e) => setFilterFacility(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
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
          <div className="space-y-2">
            <Label>Category</Label>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
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
          <div className="space-y-2">
            <Label>Entry Type</Label>

            <select
              value={filterFrequency}
              onChange={(e) => setFilterFrequency(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
              data-testid="filter-frequency-select"
            >
              <option value="">All Entries</option>
              <option value="monthly">Monthly Only</option>
              <option value="yearly">Yearly Only</option>
            </select>
          </div>

          {/* CALCULATION METHOD — ONLY SCOPE 3 */}
          {isScope3 && (
            <div className="space-y-2">
              <Label>Calculation Method</Label>

              <select
                value={filterCalculationMethod || ''}
                onChange={(e) =>
                  setFilterCalculationMethod?.(e.target.value)
                }
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                data-testid="filter-calculation-method-select"
              >
                <option value="">All Methods</option>

                {uniqueCalculationMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* SECOND ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

          {/* START PERIOD */}
          <div className="space-y-2">
            <Label>Start Period</Label>

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
              placeholder="From"
              className="w-full bg-stone-50"
            />
          </div>

          {/* END PERIOD */}
          <div className="space-y-2">
            <Label>End Period</Label>

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
              placeholder="To"
              className="w-full bg-stone-50"
            />
          </div>

          {/* SORT BY */}
          <div className="space-y-2">
            <Label>Sort By</Label>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
              data-testid="sort-by-select"
            >
              <option value="date">Date</option>
              <option value="created_at">Created At</option>
              <option value="updated_at">Last Updated</option>
              <option value="facility">Facility</option>
              <option value="fuel">Fuel Type</option>
            </select>
          </div>

          {/* ORDER */}
          <div className="space-y-2">
            <Label>Order</Label>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
              data-testid="sort-order-select"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>

          {/* CLEAR FILTERS */}
          <div className="space-y-2 flex items-end">
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full"
                data-testid="clear-filters-button"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default EmissionFilters;
