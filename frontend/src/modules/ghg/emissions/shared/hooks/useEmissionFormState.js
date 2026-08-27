/**
 * useEmissionFormState - Centralized state management for EmissionEntryForm
 * 
 * This hook manages ALL useState declarations for the emission entry form.
 * State is grouped by step/section for better organization.
 */

import { useState, useEffect } from 'react';

/**
 * Creates initial state for the emission entry form
 * @param {Object} options - Configuration options
 * @param {Object} options.organization - Organization data
 * @param {Object} options.editingEmission - Emission being edited (if any)
 * @returns {Object} All state values and setters
 */
export function useEmissionFormState({ organization = null, editingEmission = null, assignedReportingPeriod = null } = {}) {
  // ============================================================================
  // STEP STATE - Form navigation
  // ============================================================================
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // ============================================================================
  // STEP 1: Basic Selection State
  // ============================================================================
  const [facilityId, setFacilityId] = useState('');
  const [scope, setScope] = useState('scope1');
  const [category, setCategory] = useState('');
  const [fuelId, setFuelId] = useState('');
  const [useCustomFuel, setUseCustomFuel] = useState(false);
  const [customFuelName, setCustomFuelName] = useState('');
  const [customEmissionFactor, setCustomEmissionFactor] = useState('');
  const [customEmissionFactorUnit, setCustomEmissionFactorUnit] = useState('tCO2/kg');
  const [customSource, setCustomSource] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fuelSearchTerm, setFuelSearchTerm] = useState('');

  // ============================================================================
  // SCOPE 3 SPECIFIC STATE
  // ============================================================================
  const [scope3Method, setScope3Method] = useState('');
  const [spendCurrencyConversionMethod, setSpendCurrencyConversionMethod] = useState('ppp_inflation');
  const [scope3EFData, setScope3EFData] = useState([]);
  const [scope3ActivityId, setScope3ActivityId] = useState('');
  const [scope3ActivityType, setScope3ActivityType] = useState('');
  const [scope3Subcategory, setScope3Subcategory] = useState('');
  // C11 only — picks between "continuous_usage" / "one_time_use" so the
  // decision tree can route to the right formula. Persisted top-level
  // AND in dynamic_field_values.type_of_product.
  const [typeOfProduct, setTypeOfProduct] = useState('');
  const [scope3CustomActivity, setScope3CustomActivity] = useState('');
  const [useCustomActivity, setUseCustomActivity] = useState(false);
  const [fugitiveEmissionsData, setFugitiveEmissionsData] = useState([]);
  const [loadingScope3EF, setLoadingScope3EF] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');

  // ============================================================================
  // BIOGENIC STATE
  // ============================================================================
  const [biogenicScopeSelection, setBiogenicScopeSelection] = useState('');
  const [biogenicCategories, setBiogenicCategories] = useState([]);
  const [loadingBiogenicCategories, setLoadingBiogenicCategories] = useState(false);

  // ============================================================================
  // MULTI-EMPLOYEE STATE (C7 Employee Commuting)
  // ============================================================================
  const [employees, setEmployees] = useState([]);
  const [employeeMonthlyTotals, setEmployeeMonthlyTotals] = useState({});
  const [employeeYearlyTotal, setEmployeeYearlyTotal] = useState({});
  const [isCalculatingEmployee, setIsCalculatingEmployee] = useState(false);
  const [c7FormulaId, setC7FormulaId] = useState(null);
  const [c7FormulaName, setC7FormulaName] = useState('');

  // ============================================================================
  // DECISION TREE STATE
  // ============================================================================
  const [decisionFieldValues, setDecisionFieldValues] = useState({});

  // ============================================================================
  // PROCESS EMISSIONS STATE
  // ============================================================================
  const [selectedSubIndustry, setSelectedSubIndustry] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateInputValues, setTemplateInputValues] = useState({});

  // ============================================================================
  // DYNAMIC FORM CONFIG STATE (Calc Engine Integration)
  // ============================================================================
  const [formConfig, setFormConfig] = useState(null);
  const [loadingFormConfig, setLoadingFormConfig] = useState(false);
  const [calcEngineResult, setCalcEngineResult] = useState(null);
  const [isCalcEngineCalculating, setIsCalcEngineCalculating] = useState(false);
  const [matchedFormulaId, setMatchedFormulaId] = useState(null);

  // ============================================================================
  // STEP 2: Process & Responsibility State
  // ============================================================================
  const [processNames, setProcessNames] = useState([{ name: '', description: '' }]);
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [responsiblePersonDesignation, setResponsiblePersonDesignation] = useState('');
  const [responsiblePersonContact, setResponsiblePersonContact] = useState('');

  // ============================================================================
  // STEP 3: Year & Monthly Data State
  // ============================================================================
  // Determine organization's reporting year type preference
  const orgReportingYearType = organization?.reporting_year_type;
  const hasOrgYearTypePreference = orgReportingYearType === 'financial_year' || orgReportingYearType === 'calendar_year';
  const defaultYearType = assignedReportingPeriod?.reporting_year_type
    || (orgReportingYearType === 'financial_year' ? 'financial' : 'calendar');
  const defaultReportingYear = assignedReportingPeriod?.reporting_year
    || new Date().getFullYear().toString();

  const [reportingYearType, setReportingYearType] = useState(defaultYearType);
  const [reportingYear, setReportingYear] = useState(defaultReportingYear);
  const [frequencyType, setFrequencyType] = useState('monthly');
  const [monthlyData, setMonthlyData] = useState({});
  const [yearlyData, setYearlyData] = useState({});
  const [yearlyCalcResult, setYearlyCalcResult] = useState(null);
  const [isCalculatingYearly, setIsCalculatingYearly] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState([]);

  // ============================================================================
  // STEP 2: Record Source (optional, all scopes/categories)
  // ============================================================================
  // Free-text field captured per emission record. Persisted as
  // `record_source` on the record. Independent of the auto-derived
  // `source_of_information` (which still holds fuel-source / template
  // metadata). Tracked in version history.
  const [recordSource, setRecordSource] = useState('');

  // ============================================================================
  // STEP 4: Notes State
  // ============================================================================
  const [notes, setNotes] = useState('');

  // ============================================================================
  // SCOPE 3 OPTIONAL FIELDS
  // ============================================================================
  const [supplierName, setSupplierName] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  // ============================================================================
  // EFFECTS: Sync state with organization preferences
  // ============================================================================
  useEffect(() => {
    if (assignedReportingPeriod?.reporting_year_type && assignedReportingPeriod?.reporting_year) {
      setReportingYearType(assignedReportingPeriod.reporting_year_type);
      setReportingYear(assignedReportingPeriod.reporting_year);
    } else if (hasOrgYearTypePreference) {
      setReportingYearType(defaultYearType);
    }
  }, [assignedReportingPeriod, hasOrgYearTypePreference, defaultYearType]);

  // Sync decision field values with scope3Method, scope3ActivityType,
  // scope3Subcategory and typeOfProduct (the keys must match decision-tree
  // field_name values).
  useEffect(() => {
    setDecisionFieldValues(prev => {
      const updated = { ...prev };
      if (scope3Method) {
        updated['calculation_method_scope3'] = scope3Method;
      }
      if (scope3Method === 'spend_basis') {
        updated['spend_currency_conversion_method'] = spendCurrencyConversionMethod || 'ppp_inflation';
      } else {
        delete updated['spend_currency_conversion_method'];
      }
      if (scope3ActivityType) {
        updated['activity_type'] = scope3ActivityType;
      }
      if (scope3Subcategory) {
        updated['subcategory_selection'] = scope3Subcategory;
      }
      if (typeOfProduct) {
        updated['type_of_product'] = typeOfProduct;
      }
      return updated;
    });
  }, [scope3Method, spendCurrencyConversionMethod, scope3ActivityType, scope3Subcategory, typeOfProduct]);

  // Auto-enable custom activity when "others" activity type is selected with supplier_basis
  useEffect(() => {
    if (scope3ActivityType === 'others' && scope3Method === 'supplier_basis') {
      setUseCustomActivity(true);
      setScope3ActivityId('');
    }
  }, [scope3ActivityType, scope3Method]);

  // Load frequencyType from editingEmission when editing
  useEffect(() => {
    if (editingEmission) {
      const freq = editingEmission.frequency_type || 'monthly';
      setFrequencyType(freq);

      if (freq === 'yearly') {
        const dfv = editingEmission.dynamic_field_values || editingEmission.inputs || {};
        const initialYearlyData = {};

        Object.entries(dfv).forEach(([key, val]) => {
          if (val && typeof val === 'object' && 'value' in val) {
            initialYearlyData[key] = val.value;
            if (val.unit) {
              initialYearlyData[`${key}_unit`] = val.unit;
            }
            if (['cv', 'density'].includes(key)) {
              initialYearlyData[`override_${key}`] = true;
            }
          } else {
            initialYearlyData[key] = val;
          }
        });

        const userOverrides = editingEmission.user_overrides || {};
        Object.keys(userOverrides).forEach(key => {
          initialYearlyData[`override_${key}`] = true;
        });

        setYearlyData(initialYearlyData);
      }
    }
  }, [editingEmission]);

  // Return all state grouped by section
  return {
    // Step navigation
    currentStep, setCurrentStep,
    totalSteps,

    // Step 1: Basic Selection
    facilityId, setFacilityId,
    scope, setScope,
    category, setCategory,
    fuelId, setFuelId,
    useCustomFuel, setUseCustomFuel,
    customFuelName, setCustomFuelName,
    customEmissionFactor, setCustomEmissionFactor,
    customEmissionFactorUnit, setCustomEmissionFactorUnit,
    customSource, setCustomSource,
    isSaving, setIsSaving,
    fuelSearchTerm, setFuelSearchTerm,

    // Scope 3
    scope3Method, setScope3Method,
    spendCurrencyConversionMethod, setSpendCurrencyConversionMethod,
    scope3EFData, setScope3EFData,
    scope3ActivityId, setScope3ActivityId,
    scope3ActivityType, setScope3ActivityType,
    scope3Subcategory, setScope3Subcategory,
    typeOfProduct, setTypeOfProduct,
    scope3CustomActivity, setScope3CustomActivity,
    useCustomActivity, setUseCustomActivity,
    fugitiveEmissionsData, setFugitiveEmissionsData,
    loadingScope3EF, setLoadingScope3EF,
    assetName, setAssetName,
    fromLocation, setFromLocation,
    toLocation, setToLocation,

    // Biogenic
    biogenicScopeSelection, setBiogenicScopeSelection,
    biogenicCategories, setBiogenicCategories,
    loadingBiogenicCategories, setLoadingBiogenicCategories,

    // Multi-Employee (C7)
    employees, setEmployees,
    employeeMonthlyTotals, setEmployeeMonthlyTotals,
    employeeYearlyTotal, setEmployeeYearlyTotal,
    isCalculatingEmployee, setIsCalculatingEmployee,
    c7FormulaId, setC7FormulaId,
    c7FormulaName, setC7FormulaName,

    // Decision tree
    decisionFieldValues, setDecisionFieldValues,

    // Process Emissions
    selectedSubIndustry, setSelectedSubIndustry,
    selectedTemplate, setSelectedTemplate,
    templateInputValues, setTemplateInputValues,

    // Dynamic Form Config
    formConfig, setFormConfig,
    loadingFormConfig, setLoadingFormConfig,
    calcEngineResult, setCalcEngineResult,
    isCalcEngineCalculating, setIsCalcEngineCalculating,
    matchedFormulaId, setMatchedFormulaId,

    // Step 2: Process & Responsibility
    processNames, setProcessNames,
    responsiblePerson, setResponsiblePerson,
    responsiblePersonDesignation, setResponsiblePersonDesignation,
    responsiblePersonContact, setResponsiblePersonContact,

    // Step 3: Year & Monthly Data
    reportingYearType, setReportingYearType,
    hasOrgYearTypePreference,
    reportingYear, setReportingYear,
    frequencyType, setFrequencyType,
    monthlyData, setMonthlyData,
    yearlyData, setYearlyData,
    yearlyCalcResult, setYearlyCalcResult,
    isCalculatingYearly, setIsCalculatingYearly,
    expandedMonths, setExpandedMonths,

    // Step 4: Notes
    notes, setNotes,
    recordSource, setRecordSource,

    // Scope 3 optional fields
    supplierName, setSupplierName,
    supplierCode, setSupplierCode,
    employeeName, setEmployeeName,
    employeeId, setEmployeeId,
  };
}

export default useEmissionFormState;
