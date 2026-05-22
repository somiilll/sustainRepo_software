/**
 * EmissionEditDialog - Dialog component for editing existing emissions
 * 
 * This component handles the edit form for emissions when `editingEmission` is set.
 * It's extracted from Emissions.js to reduce the main file size.
 * 
 * IMPORTANT: This component is tightly coupled with the parent Emissions page
 * and requires many props to be passed down.
 */

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card } from '../../components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { 
  X, Info, FileText, Trash2, Plus, ChevronDown, ChevronUp, 
  Calculator, Upload, AlertCircle 
} from 'lucide-react';
import { isVolumeUnit } from '../../utils/helpers/unit-utils';
import { MONTHS } from '../../constants/months';

const EmissionEditDialog = ({
  // Dialog state
  dialogOpen,
  handleDialogChange,
  handleInteractOutside,
  handleEscapeKeyDown,
  editingEmission,
  
  // Loading states
  isEditLoading,
  isSaving,
  isCalculating,
  editFormConfigLoading,
  
  // Form data
  formData,
  setFormData,
  markFormDirty,
  
  // Lists and configurations
  facilities,
  fuelDatabase,
  dynamicScopes,
  dynamicCategories,
  centralizedUnits,
  processTemplates,
  configLabels,
  hasScope3Access,
  
  // Scope 3 data
  scope3EFData,
  filteredScope3Activities,
  scope3Method,
  setScope3Method,
  scope3ActivityType,
  setScope3ActivityType,
  scope3ActivityId,
  setScope3ActivityId,
  scope3Subcategory,
  setScope3Subcategory,
  scope3CustomActivity,
  setScope3CustomActivity,
  useCustomActivity,
  setUseCustomActivity,
  
  // Biogenic data
  biogenicScopeSelection,
  setBiogenicScopeSelection,
  
  // Dynamic fields
  dynamicInputFields,
  dynamicFieldValues,
  setDynamicFieldValues,
  
  // Process emissions
  selectedSubIndustry,
  setSelectedSubIndustry,
  selectedTemplate,
  setSelectedTemplate,
  templateInputValues,
  setTemplateInputValues,
  
  // Override states
  overrideCalorificValue,
  setOverrideCalorificValue,
  overrideDensity,
  setOverrideDensity,
  overrideEmissionFactorHeat,
  setOverrideEmissionFactorHeat,
  overrideJustification,
  setOverrideJustification,
  
  // Calculation results
  calculatedEmissions,
  isOverrideCV,
  isOverrideDensity,
  
  // C7 Employee state
  isEditC7EmployeeCommuting,
  editEmployees,
  setEditEmployees,
  expandedEditEmployees,
  setExpandedEditEmployees,
  employeeMonthlyTotals,
  employeeYearlyTotal,
  isCalculatingEmployee,
  
  // Evidence
  existingEvidences,
  setExistingEvidences,
  uploadedEvidence,
  handleEvidenceUpload,
  handleRemoveEvidence,
  handleDeleteExistingEvidence,
  handleDeleteAllEvidences,
  
  // Handlers
  handleFuelSelect,
  handleSubmit,
  handleCalculateEmissions,
  handleCalculateEmployeeMonth,
  handleCalculateEmployeeYearly,
  getMethodLabel,
  
  // Helpers
  categoriesForScope,
  availableScope3Methods,
  availableScope3ActivityTypes,
  requiresSubcategory,
  availableSubcategories,
  availableSubIndustries,
  templatesForSubIndustry,
  getFuelOptionsForCategory,
  selectedFuel,
  defaultUnit,
  allowedUnits,
  getFieldUnitsForEdit,
  renderDynamicField,
}) => {
  // Early return if no editing emission
  if (!editingEmission) return null;
  
  // C7 category check
  const isC7Category = formData.category?.toLowerCase()?.includes('c7') || 
                       formData.category?.toLowerCase()?.includes('employee commuting');
  
  // For C7, check that employees are populated with valid data
  const isC7DataReady = !isC7Category || 
                        (editEmployees.length > 0 && editEmployees[0]?.id);
  
  // Show loading if explicitly loading OR if C7 data isn't ready yet
  if (isEditLoading || !isC7DataReady) {
    return (
      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent 
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={handleInteractOutside}
          onEscapeKeyDown={handleEscapeKeyDown}
          hideCloseButton={true}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Update Emission Record</DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDialogChange(false)}
                className="h-8 w-8 p-0 rounded-sm opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-500">Loading emission data...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render the full edit form
  // NOTE: The actual form JSX will be integrated from Emissions.js
  // This is a placeholder structure to show the component interface
  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
      <DialogContent 
        key={editingEmission?.id || 'edit'}
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
        hideCloseButton={true}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Update Emission Record</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDialogChange(false)}
              className="h-8 w-8 p-0 rounded-sm opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {/* 
          FORM CONTENT PLACEHOLDER
          The actual form JSX (~1500 lines) would be rendered here.
          Due to the complexity and tight coupling with parent state,
          this component serves as a structural wrapper.
          
          Integration approach:
          1. All state is managed in parent Emissions.js
          2. This component receives everything via props
          3. Form handlers call back to parent functions
        */}
        <form onSubmit={handleSubmit} className="space-y-5" data-testid="emission-edit-form">
          {/* Facility and Scope Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="facility">Facility *</Label>
              <select
                id="facility"
                value={formData.facility_id}
                onChange={(e) => { setFormData({ ...formData, facility_id: e.target.value }); markFormDirty(); }}
                required
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="emission-facility-select"
              >
                <option value="">Select Facility</option>
                {facilities.filter(f => f.is_active !== false).map(f => (
                  <option key={f.id} value={f.id}>{f.name} {f.country ? `(${f.country})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope *</Label>
              <div className="flex gap-4 h-10 items-center flex-wrap">
                {dynamicScopes.map(scope => {
                  const isScope3 = scope.code === 'scope3';
                  const isDisabled = isScope3 && !hasScope3Access;
                  return (
                    <label key={scope.code} className={`flex items-center gap-2 relative ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      <input
                        type="radio"
                        value={scope.code}
                        checked={formData.scope === scope.code}
                        disabled={isDisabled}
                        onChange={(e) => {
                          setFormData({ ...formData, scope: e.target.value, fuel_id: '', category: '', sub_category: '' });
                          handleFuelSelect('');
                          if (e.target.value !== 'biogenic') {
                            setBiogenicScopeSelection('');
                          }
                        }}
                        className="text-primary"
                        data-testid={`scope-radio-${scope.code}`}
                      />
                      <span>{scope.name}</span>
                      {isDisabled && (
                        <span className="px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-semibold rounded whitespace-nowrap">
                          Not Available
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Category Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="category">Category *</Label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => {
                setFormData({ ...formData, category: e.target.value, fuel_id: '', sub_category: '' });
                handleFuelSelect('');
                markFormDirty();
              }}
              required
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              data-testid="emission-category-select"
            >
              <option value="">Select Category</option>
              {categoriesForScope.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Dynamic fields rendering would go here */}
          {dynamicInputFields.length > 0 && (
            <Card className="p-4 space-y-4">
              <h4 className="font-medium text-sm">Input Fields</h4>
              <div className="grid grid-cols-2 gap-4">
                {dynamicInputFields.map((field, index) => (
                  <div key={field.id || index}>
                    {renderDynamicField(field, 'edit', dynamicFieldValues, setDynamicFieldValues)}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || isCalculating}
              className="bg-primary hover:bg-primary/90"
              data-testid="submit-emission-btn"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : isCalculating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Calculating...
                </>
              ) : (
                'Update Emission'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EmissionEditDialog;
