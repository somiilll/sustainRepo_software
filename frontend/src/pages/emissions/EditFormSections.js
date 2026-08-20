/**
 * EditFormSections - Modular sections for the Emission Edit Form
 * 
 * These components extract different sections of the edit form to reduce
 * the main Emissions.js file size while maintaining functionality.
 */

import React from 'react';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { MonthYearPicker } from '../../components/ui/month-year-picker';
import { Building2, Calendar as CalendarIcon, Info, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

/**
 * FacilityScopeSection - Facility and Scope selection
 */
export const FacilityScopeSection = ({
  formData,
  setFormData,
  facilities,
  dynamicScopes,
  hasScope3Access,
  handleFuelSelect,
  setBiogenicScopeSelection,
  markFormDirty,
  reportingPeriod,
}) => (
  <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_minmax(25rem,1.45fr)_minmax(15rem,1fr)]">
    <div className="space-y-1.5">
      <Label htmlFor="facility">Facility *</Label>
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden="true" />
        <select
          id="facility"
          value={formData.facility_id}
          onChange={(e) => { setFormData({ ...formData, facility_id: e.target.value }); markFormDirty(); }}
          required
          className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10"
          data-testid="emission-facility-select"
        >
          <option value="">Select Facility</option>
          {facilities.filter(f => f.is_active !== false).map(f => (
            <option key={f.id} value={f.id}>{f.name} {f.country ? `(${f.country})` : ''}</option>
          ))}
        </select>
      </div>
    </div>
    <div className="space-y-1.5">
      <Label>Scope *</Label>
      <div className="flex h-10 items-center gap-3 whitespace-nowrap">
        {dynamicScopes.map(scope => {
          const isScope3 = scope.code === 'scope3';
          const isDisabled = isScope3 && !hasScope3Access;
          return (
            <label key={scope.code} className={`relative flex shrink-0 items-center gap-2 ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
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
                className="h-4 w-4 accent-emerald-600"
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
    {reportingPeriod}
  </div>
);

/**
 * BiogenicScopeSection - Biogenic emission type selection
 */
export const BiogenicScopeSection = ({
  formData,
  setFormData,
  biogenicScopeSelection,
  setBiogenicScopeSelection,
  hasScope3Access,
  handleFuelSelect,
  loadingBiogenicCategories,
}) => {
  if (formData.scope !== 'biogenic') return null;
  
  return (
    <div className="space-y-1.5 p-3 bg-green-50 rounded-lg border border-green-200">
      <Label className="text-green-800">Select Biogenic Emission Type *</Label>
      <div className="flex gap-4 h-10 items-center">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            value="scope1"
            checked={biogenicScopeSelection === 'scope1'}
            onChange={(e) => {
              setBiogenicScopeSelection(e.target.value);
              setFormData(prev => ({ ...prev, category: '', fuel_id: '' }));
              handleFuelSelect('');
            }}
            className="h-4 w-4 accent-emerald-600"
            data-testid="biogenic-scope-radio-scope1"
          />
          <span className="text-green-800">Direct Biogenic</span>
        </label>
        <label className={`flex items-center gap-2 ${!hasScope3Access ? 'opacity-60 cursor-not-allowed' : ''}`}>
          <input
            type="radio"
            value="scope3"
            checked={biogenicScopeSelection === 'scope3'}
            disabled={!hasScope3Access}
            onChange={(e) => {
              setBiogenicScopeSelection(e.target.value);
              setFormData(prev => ({ ...prev, category: '', fuel_id: '' }));
              handleFuelSelect('');
            }}
            className="h-4 w-4 accent-emerald-600"
            data-testid="biogenic-scope-radio-scope3"
          />
          <span className="text-green-800">Indirect Biogenic</span>
          {!hasScope3Access && (
            <span className="px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-semibold rounded whitespace-nowrap">
              Not Available
            </span>
          )}
        </label>
      </div>
      {loadingBiogenicCategories && (
        <p className="text-xs text-green-600">Loading biogenic categories...</p>
      )}
    </div>
  );
};

/**
 * CategorySection - Category and Sub-category selection
 */
export const CategorySection = ({
  formData,
  setFormData,
  categoriesForScope,
  handleFuelSelect,
  markFormDirty,
}) => (
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
);

/**
 * Scope3MethodSection - Scope 3 calculation method selection
 */
export const Scope3MethodSection = ({
  formData,
  scope3Method,
  setScope3Method,
  availableScope3Methods,
  getMethodLabel,
  setScope3ActivityType,
  setScope3ActivityId,
  setScope3Subcategory,
  setUseCustomActivity,
  setScope3CustomActivity,
  markFormDirty,
  biogenicScopeSelection,
}) => {
  const isScope3Like = formData.scope === 'scope3' || 
    (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3');
  
  if (!isScope3Like || !formData.category) return null;
  
  return (
    <div className="space-y-1.5">
      <Label>Calculation Method *</Label>
      <select
        value={scope3Method}
        onChange={(e) => {
          setScope3Method(e.target.value);
          setScope3ActivityType('');
          setScope3ActivityId('');
          setScope3Subcategory('');
          setUseCustomActivity(false);
          setScope3CustomActivity('');
          markFormDirty();
        }}
        className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
        data-testid="scope3-method-select"
      >
        <option value="">Select Method</option>
        {availableScope3Methods.map(method => (
          <option key={method} value={method}>
            {getMethodLabel(method)}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * ResponsiblePersonSection - Person responsible fields
 */
export const ResponsiblePersonSection = ({
  formData,
  setFormData,
}) => (
  <div className="space-y-4 p-4 bg-stone-50 rounded-lg border border-stone-200">
    <h4 className="font-medium text-sm flex items-center gap-2">
      Person Responsible
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">
              <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
            <p>Person who is maintaining this data</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </h4>
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor="responsible_person">Name</Label>
        <Input
          id="responsible_person"
          value={formData.responsible_person}
          onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
          className="bg-white h-10"
          placeholder="Name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="responsible_person_designation">Designation</Label>
        <Input
          id="responsible_person_designation"
          value={formData.responsible_person_designation}
          onChange={(e) => setFormData({ ...formData, responsible_person_designation: e.target.value })}
          className="bg-white h-10"
          placeholder="e.g., Environmental Manager"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="responsible_person_contact">Contact Details</Label>
        <Input
          id="responsible_person_contact"
          value={formData.responsible_person_contact}
          onChange={(e) => setFormData({ ...formData, responsible_person_contact: e.target.value })}
          className="bg-white h-10"
          placeholder="Email or phone number"
        />
      </div>
    </div>
  </div>
);

/**
 * ProcessNamesSection - Process names and descriptions
 */
export const ProcessNamesSection = ({
  formData,
  setFormData,
  markFormDirty,
}) => {
  const addProcess = () => {
    setFormData(prev => ({
      ...prev,
      process_names: [...prev.process_names, { name: '', description: '' }]
    }));
    markFormDirty();
  };

  const removeProcess = (index) => {
    if (formData.process_names.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      process_names: prev.process_names.filter((_, i) => i !== index)
    }));
    markFormDirty();
  };

  const updateProcess = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      process_names: prev.process_names.map((p, i) => 
        i === index ? { ...p, [field]: value } : p
      )
    }));
    markFormDirty();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          Name of Process(es) *
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                <p>Enter the process names that generate this emission. Add descriptions for each process.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addProcess}
          className="text-primary hover:text-primary/90"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Process
        </Button>
      </div>
      
      {formData.process_names.map((process, index) => (
        <div key={index} className="space-y-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
          <div className="flex items-center gap-2">
            <Input
              value={process.name}
              onChange={(e) => updateProcess(index, 'name', e.target.value)}
              placeholder={`Process ${index + 1} name`}
              className="bg-white flex-1"
            />
            {formData.process_names.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProcess(index)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-stone-500">Description *</Label>
            <Textarea
              value={process.description}
              onChange={(e) => updateProcess(index, 'description', e.target.value)}
              placeholder="Describe this process..."
              className="bg-white min-h-[60px]"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * NotesSection - Additional notes
 */
export const NotesSection = ({
  formData,
  setFormData,
}) => (
  <div className="space-y-1.5">
    <Label htmlFor="notes">Additional Notes</Label>
    <Textarea
      id="notes"
      value={formData.notes}
      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
      className="bg-stone-50 min-h-[80px]"
      placeholder="Any additional information about this emission..."
    />
  </div>
);

/**
 * OverrideSection - Calorific Value and Density overrides
 */
export const OverrideSection = ({
  formData,
  setFormData,
  fuelDatabase,
  overrideCalorificValue,
  setOverrideCalorificValue,
  overrideDensity,
  setOverrideDensity,
  centralizedUnits,
  isVolumeUnit,
}) => {
  // Only show for Scope 1, Biogenic (not Scope 2), and not for Fugitive Emissions
  if (formData.scope === 'scope2' || formData.category?.toLowerCase()?.includes('fugitive')) {
    return null;
  }
  
  if (!formData.fuel_id) return null;

  return (
    <div className="p-4 bg-stone-50 rounded-lg border border-stone-200 space-y-4">
      {/* Calorific Value Override */}
      <div>
        <div className="flex items-start gap-4">
          <label className="flex items-center gap-2 min-w-[200px]">
            <input
              type="checkbox"
              data-testid="override-calorific-checkbox"
              checked={overrideCalorificValue}
              onChange={(e) => {
                setOverrideCalorificValue(e.target.checked);
                if (e.target.checked) {
                  setFormData(prev => ({
                    ...prev,
                    calorific_value: '',
                    calorific_value_justification: ''
                  }));
                } else {
                  const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                  if (fuel) {
                    setFormData(prev => ({
                      ...prev,
                      calorific_value: fuel.calorific_value?.toString() || '',
                      calorific_value_justification: ''
                    }));
                  }
                }
              }}
              className="text-primary"
            />
            <span className="text-sm">Calorific Value (if available)</span>
          </label>
          {overrideCalorificValue && (
            <div className="flex gap-2 flex-1 items-center">
              <Input
                type="number"
                step="any"
                min="0"
                data-testid="calorific-value-input"
                value={formData.calorific_value}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || parseFloat(val) >= 0) {
                    setFormData({ ...formData, calorific_value: val });
                  }
                }}
                onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                placeholder="Enter value"
                className="bg-white flex-1"
                required={overrideCalorificValue}
              />
              <span className="flex items-center text-sm text-text-muted px-2 py-1 bg-stone-100 rounded">
                {formData.calorific_value_unit || 'MJ/kg'}
              </span>
            </div>
          )}
        </div>
        {overrideCalorificValue && (
          <div className="ml-[216px] mt-2">
            <Input
              type="text"
              value={formData.calorific_value_justification || ''}
              onChange={(e) => setFormData({ ...formData, calorific_value_justification: e.target.value })}
              placeholder="Justifications/Comments *"
              className="bg-white"
              required={overrideCalorificValue}
            />
          </div>
        )}
      </div>

      {/* Density Override - Only show for volume units */}
      {isVolumeUnit(formData.quantity_unit, centralizedUnits) && (
        <div className="mt-4">
          <div className="flex items-start gap-4">
            <label className="flex items-center gap-2 min-w-[200px]">
              <input
                type="checkbox"
                data-testid="override-density-checkbox"
                checked={overrideDensity}
                onChange={(e) => {
                  setOverrideDensity(e.target.checked);
                  if (e.target.checked) {
                    setFormData(prev => ({
                      ...prev,
                      density: '',
                      density_justification: ''
                    }));
                  } else {
                    const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                    if (fuel) {
                      setFormData(prev => ({
                        ...prev,
                        density: fuel.density?.toString() || '',
                        density_justification: ''
                      }));
                    }
                  }
                }}
                className="text-primary"
              />
              <span className="text-sm">Density (if available)</span>
            </label>
            {overrideDensity && (
              <div className="flex gap-2 flex-1 items-center">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  data-testid="density-value-input"
                  value={formData.density}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || parseFloat(val) >= 0) {
                      setFormData({ ...formData, density: val });
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                  placeholder="Enter value"
                  className="bg-white flex-1"
                  required={overrideDensity}
                />
                <span className="flex items-center text-sm text-text-muted px-2 py-1 bg-stone-100 rounded">
                  kg/L
                </span>
              </div>
            )}
          </div>
          {overrideDensity && (
            <div className="ml-[216px] mt-2">
              <Input
                type="text"
                value={formData.density_justification || ''}
                onChange={(e) => setFormData({ ...formData, density_justification: e.target.value })}
                placeholder="Justifications/Comments *"
                className="bg-white"
                required={overrideDensity}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * SubmitButtonSection - Form submit buttons
 */
export const SubmitButtonSection = ({
  editingEmission,
  isSaving,
  isCalculating,
  handleDialogChange,
}) => (
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
        `${editingEmission ? 'Update' : 'Add'} Emission`
      )}
    </Button>
  </div>
);

export default {
  FacilityScopeSection,
  BiogenicScopeSection,
  CategorySection,
  Scope3MethodSection,
  ResponsiblePersonSection,
  ProcessNamesSection,
  NotesSection,
  OverrideSection,
  SubmitButtonSection,
};
