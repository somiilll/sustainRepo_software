/**
 * Step 4: Notes Component
 * Final review step with additional notes and summary
 */

import React from 'react';
import { Label } from '../../../../../../components/ui/label';

/**
 * Step 4 Notes and Summary Component
 * @param {Object} props
 * @param {string} props.notes - Additional notes text
 * @param {Function} props.setNotes - Notes setter
 * @param {Object} props.selectedFacility - Selected facility object
 * @param {string} props.scope - Selected scope
 * @param {string} props.category - Selected category
 * @param {string} props.scope3Method - Scope 3 calculation method
 * @param {boolean} props.useCustomActivity - Whether using custom activity
 * @param {string} props.scope3CustomActivity - Custom activity name
 * @param {Array} props.filteredScope3Activities - Filtered activities list
 * @param {string} props.scope3ActivityId - Selected activity ID
 * @param {boolean} props.requiresSubcategory - Whether category requires subcategory
 * @param {string} props.scope3Subcategory - Selected subcategory
 * @param {boolean} props.useCustomFuel - Whether using custom fuel
 * @param {string} props.customFuelName - Custom fuel name
 * @param {Object} props.selectedFuel - Selected fuel object
 * @param {string} props.reportingYear - Reporting year
 * @param {string} props.frequencyType - 'monthly' or 'yearly'
 * @param {number} props.filledMonthsCount - Number of months with data
 * @param {string} props.responsiblePerson - Person responsible name
 * @param {string} props.responsiblePersonDesignation - Person designation
 * @param {string} props.responsiblePersonContact - Person contact
 * @param {Array} props.processNames - Process names array
 * @param {string} props.biogenicScopeSelection - Biogenic scope selection
 * @param {Function} props.getMethodLabel - Function to get method display label
 */
export const Step4Notes = ({
  notes,
  setNotes,
  selectedFacility,
  scope,
  category,
  scope3Method,
  useCustomActivity,
  scope3CustomActivity,
  filteredScope3Activities,
  scope3ActivityId,
  requiresSubcategory,
  scope3Subcategory,
  useCustomFuel,
  customFuelName,
  selectedFuel,
  reportingYear,
  frequencyType,
  filledMonthsCount,
  responsiblePerson,
  responsiblePersonDesignation,
  responsiblePersonContact,
  processNames,
  biogenicScopeSelection,
  getMethodLabel,
}) => {
  // Check if it's Scope 3-like (regular scope3 or biogenic with scope3)
  const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-base font-medium">Additional Notes</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Enter any additional notes or comments..."
          className="w-full h-32 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Summary */}
      <div className="p-5 bg-stone-50 rounded-lg border border-stone-200">
        <h4 className="font-semibold text-base mb-4 pb-3 border-b border-stone-200">Review Summary</h4>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <p><strong className="text-stone-600">Facility:</strong> <span className="text-stone-800">{selectedFacility?.name || '-'}</span></p>
          <p><strong className="text-stone-600">Scope:</strong> <span className="text-stone-800">{scope === 'biogenic' ? 'Biogenic' : `Scope ${scope.slice(-1)}`}</span></p>
          <p><strong className="text-stone-600">Category:</strong> <span className="text-stone-800">{category || '-'}</span></p>
          
          {/* Scope 3 specific info */}
          {isScope3Like ? (
            <>
              <p><strong className="text-stone-600">Method:</strong> <span className="text-stone-800">{
                getMethodLabel(scope3Method)
              }</span></p>
              <p><strong className="text-stone-600">Activity:</strong> <span className="text-stone-800">{
                useCustomActivity && scope3CustomActivity ? scope3CustomActivity :
                filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '-'
              }</span></p>
              {requiresSubcategory && scope3Subcategory && (
                <p><strong className="text-stone-600">Subcategory:</strong> <span className="text-stone-800">{
                  scope3Subcategory === 'stationary_combustion' ? 'Stationary Combustion' :
                  scope3Subcategory === 'mobile_combustion' ? 'Mobile Combustion' :
                  scope3Subcategory === 'energy' ? 'Energy' :
                  scope3Subcategory === 'electricity' ? 'Energy' :
                  scope3Subcategory === 'fugitive_emissions' ? 'Fugitive Emissions' :
                  scope3Subcategory
                }</span></p>
              )}
              {/* Show Fuel Used for subcategory categories */}
              {requiresSubcategory && (scope3Subcategory === 'stationary_combustion' || scope3Subcategory === 'mobile_combustion') && (
                <p><strong className="text-stone-600">Fuel Used:</strong> <span className="text-stone-800">{
                  filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '-'
                }</span></p>
              )}
            </>
          ) : (
            <p><strong className="text-stone-600">Fuel:</strong> <span className="text-stone-800">{useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '-'}</span></p>
          )}
          
          <p><strong className="text-stone-600">Year:</strong> <span className="text-stone-800">{reportingYear}</span></p>
          <p><strong className="text-stone-600">{frequencyType === 'yearly' ? 'Annual data:' : 'Months with data:'}</strong> <span className="text-stone-800">{frequencyType === 'yearly' ? (filledMonthsCount > 0 ? 'Complete' : 'Incomplete') : filledMonthsCount}</span></p>
          <p><strong className="text-stone-600">Person Responsible:</strong> <span className="text-stone-800">{responsiblePerson || '-'}</span></p>
          {responsiblePersonDesignation && <p><strong className="text-stone-600">Designation:</strong> <span className="text-stone-800">{responsiblePersonDesignation}</span></p>}
          {responsiblePersonContact && <p><strong className="text-stone-600">Contact:</strong> <span className="text-stone-800">{responsiblePersonContact}</span></p>}
          <p className="col-span-2"><strong className="text-stone-600">Processes:</strong> <span className="text-stone-800">{processNames.filter(p => p.name && p.name.trim()).map(p => p.name).join(', ') || '-'}</span></p>
        </div>
      </div>
    </div>
  );
};

export default Step4Notes;
