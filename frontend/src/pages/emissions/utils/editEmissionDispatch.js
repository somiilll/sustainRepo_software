/**
 * editEmissionDispatch — E4 modularization phase.
 *
 * The full hydration logic for the Edit Emission dialog. Lifted byte-identically
 * from the legacy `handleEdit(emission)` closure in src/pages/Emissions.js.
 *
 * Takes the page's state setters + reads (`scope3EFData`, `fugitiveEmissionsData`)
 * + helpers (`getAuthHeader`) as a `ctx` object. Behaviour preserved exactly.
 * 
 * Now internally uses hydrateEmissionForm for pure data transformation,
 * while preserving all original side effects and async operations.
 */
import axios from 'axios';
import { hydrateEmissionForm } from './hydrateEmissionForm';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export async function editEmissionDispatch(emission, ctx) {
  const {
    // State reads
    scope3EFData, fugitiveEmissionsData, fuelDatabase,
    // Setters
    setEditEmployees, setEditEmployeeMonthlyTotals, setEditEmployeeYearlyTotal,
    setDynamicFieldValues, setExistingEvidences, setEditingEmissionId,
    setEmissionAuditLog, setIsEditLoading, setDialogOpen, setIsFormDirty,
    setScope3Method, setScope3ActivityId, setScope3ActivityType,
    setScope3Subcategory, setTypeOfProduct, setScope3CustomActivity, setUseCustomActivity,
    setBiogenicScopeSelection, setEditFrequencyType, setEditingEmission,
    setOverrideCalorificValue, setOverrideDensity, setOverrideEmissionFactorHeat,
    setOverrideJustification, setSelectedCategory, setFormData, setEditC7Month,
    setEditUseCustomFuel, setEditCustomFuelName, setEditProcessType,
    // Helpers
    getAuthHeader,
  } = ctx;

    // CRITICAL: Clear stale employee state IMMEDIATELY before any hydration
    // This prevents previous edit session data from bleeding through
    setEditEmployees([]);
    setEditEmployeeMonthlyTotals({});
    setEditEmployeeYearlyTotal({});
    
    // =====================
    // Use hydrateEmissionForm for pure data transformation
    // =====================
    const hydrated = hydrateEmissionForm(emission, {
      fuelDatabase,
      scope3EFData,
      fugitiveEmissionsData,
    });
    
    // =====================
    // Apply hydrated values to state setters
    // =====================
    setIsFormDirty(false);
    setEditingEmission(emission);
    setEditFrequencyType(hydrated.frequencyType);
    
    // Set the category state for UI display
    setSelectedCategory(hydrated.selectedCategory);
    setEditProcessType?.(hydrated.processType || '');
    
    // Apply custom fuel state
    const isCustomFuel = emission.is_custom_fuel || false;
    setEditUseCustomFuel?.(isCustomFuel);
    setEditCustomFuelName?.(isCustomFuel ? (emission.custom_fuel_name || emission.fuel_type || '') : '');
    
    // Apply biogenic scope selection
    if (emission.scope === 'biogenic') {
      setBiogenicScopeSelection(hydrated.biogenicScopeSelection);
    }
    
    // Apply Scope 3 fields (works for both regular scope3 and biogenic scope3)
    if (emission.scope === 'scope3' || 
        (emission.scope === 'biogenic' && hydrated.biogenicScopeSelection === 'scope3')) {
      setScope3Method(hydrated.scope3Method);
      setScope3ActivityType(hydrated.scope3ActivityType);
      setScope3Subcategory(hydrated.scope3Subcategory);
      setTypeOfProduct?.(hydrated.typeOfProduct);
      setScope3ActivityId(hydrated.scope3ActivityId);
      setScope3CustomActivity(hydrated.scope3CustomActivity);
      setUseCustomActivity(hydrated.useCustomActivity);
      
      // Apply employee/C7 data
      if (hydrated.employees.length > 0) {
        setEditEmployees(hydrated.employees);
        setEditEmployeeMonthlyTotals(hydrated.employeeMonthlyTotals);
        setEditEmployeeYearlyTotal(hydrated.employeeYearlyTotal);
        setEditC7Month(hydrated.editC7Month);
      } else {
        // Reset C7 data if not applicable
        setEditEmployees([]);
        setEditEmployeeMonthlyTotals({});
        setEditEmployeeYearlyTotal({});
        setEditC7Month(null);
      }
    } else {
      // Non-scope3 - reset C7-specific employee data
      setEditEmployees([]);
      setEditEmployeeMonthlyTotals({});
      setEditEmployeeYearlyTotal({});
      setEditC7Month(null);
    }
    
    // Apply override flags
    setOverrideCalorificValue(hydrated.overrideCalorificValue);
    setOverrideDensity(hydrated.overrideDensity);
    setOverrideEmissionFactorHeat(hydrated.overrideEmissionFactorHeat);
    setOverrideJustification(hydrated.overrideJustification);
    
    // Apply form data
    setFormData(hydrated.formData);
    
    // Handle existing evidences (async filename resolution)
    if (emission.evidence_url) {
      const existingUrls = emission.evidence_url.split(',').filter(url => url.trim());
      
      // Fetch actual filenames for each file
      const evidencesWithFilenames = await Promise.all(
        existingUrls.map(async (url, idx) => {
          const trimmedUrl = url.trim();
          const fileIdMatch = trimmedUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
          if (fileIdMatch) {
            try {
              const response = await axios.get(`${API}/files/${fileIdMatch[1]}/info`);
              return {
                url: trimmedUrl,
                filename: response.data.filename || `Evidence ${idx + 1}`,
                file_id: fileIdMatch[1]
              };
            } catch (error) {
              console.error('Failed to fetch file info:', error);
              return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };
            }
          }
          return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };
        })
      );
      
      setExistingEvidences(evidencesWithFilenames);
    } else {
      setExistingEvidences([]);
    }
    
    // Dynamic field values will be populated from audit_log after form config loads
    setDynamicFieldValues({});
    
    // Clear previous audit log to prevent stale data showing
    setEmissionAuditLog([]);
    
    // Store the emission ID for fetching audit log
    setEditingEmissionId(hydrated.editingEmissionId);
    
    // Open dialog AFTER all data is set (original working flow)
    setIsEditLoading(true);
    setDialogOpen(true);
    
    // Small delay then clear loading - data is already set
    await new Promise(resolve => setTimeout(resolve, 50));
    setIsEditLoading(false);
}

export default editEmissionDispatch;
