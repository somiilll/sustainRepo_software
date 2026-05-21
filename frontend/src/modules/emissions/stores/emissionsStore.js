/**
 * Emissions Store (Zustand)
 * 
 * Centralized state management for emissions module.
 * Replaces prop drilling with clean store access.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

/**
 * Main emissions store
 * Contains global emissions state and actions
 */
export const useEmissionsStore = create(
  devtools(
    subscribeWithSelector((set, get) => ({
      // ============================================================
      // DATA STATE
      // ============================================================
      emissions: [],
      facilities: [],
      fuelDatabase: [],
      centralizedUnits: [],
      dynamicScopes: [],
      dynamicCategories: [],
      scope3EFData: [],
      processTemplates: [],
      formulaDefinitions: [],
      organization: null,
      
      // ============================================================
      // UI STATE
      // ============================================================
      activeScope: 'scope1',
      isLoading: false,
      error: null,
      
      // Filter state
      filters: {
        facility: '',
        category: '',
        frequency: '',
        dateRange: { from: null, to: null },
        sortBy: 'date',
        sortOrder: 'desc',
      },
      
      // ============================================================
      // ACTIONS - Data Loading
      // ============================================================
      setEmissions: (emissions) => set({ emissions }),
      setFacilities: (facilities) => set({ facilities }),
      setFuelDatabase: (fuelDatabase) => set({ fuelDatabase }),
      setCentralizedUnits: (centralizedUnits) => set({ centralizedUnits }),
      setDynamicScopes: (dynamicScopes) => set({ dynamicScopes }),
      setDynamicCategories: (dynamicCategories) => set({ dynamicCategories }),
      setScope3EFData: (scope3EFData) => set({ scope3EFData }),
      setProcessTemplates: (processTemplates) => set({ processTemplates }),
      setFormulaDefinitions: (formulaDefinitions) => set({ formulaDefinitions }),
      setOrganization: (organization) => set({ organization }),
      
      // Batch update for initial data load
      setInitialData: (data) => set({
        emissions: data.emissions || [],
        facilities: data.facilities || [],
        fuelDatabase: data.fuelDatabase || [],
        centralizedUnits: data.centralizedUnits || [],
        dynamicScopes: data.dynamicScopes || [],
        dynamicCategories: data.dynamicCategories || [],
        scope3EFData: data.scope3EFData || [],
        processTemplates: data.processTemplates || [],
        formulaDefinitions: data.formulaDefinitions || [],
        organization: data.organization || null,
      }),
      
      // ============================================================
      // ACTIONS - UI State
      // ============================================================
      setActiveScope: (scope) => set({ activeScope: scope }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      
      // Filter actions
      setFilter: (key, value) => set((state) => ({
        filters: { ...state.filters, [key]: value }
      })),
      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters }
      })),
      clearFilters: () => set({
        filters: {
          facility: '',
          category: '',
          frequency: '',
          dateRange: { from: null, to: null },
          sortBy: 'date',
          sortOrder: 'desc',
        }
      }),
      
      // ============================================================
      // SELECTORS (computed values)
      // ============================================================
      
      // Get emissions filtered by active scope
      getFilteredEmissions: () => {
        const state = get();
        let filtered = state.emissions.filter(e => e.scope === state.activeScope);
        
        // Apply filters
        if (state.filters.facility) {
          filtered = filtered.filter(e => e.facility_id === state.filters.facility);
        }
        if (state.filters.category) {
          filtered = filtered.filter(e => e.category === state.filters.category);
        }
        if (state.filters.frequency) {
          filtered = filtered.filter(e => e.frequency_type === state.filters.frequency);
        }
        
        // Sort
        filtered.sort((a, b) => {
          const order = state.filters.sortOrder === 'asc' ? 1 : -1;
          if (state.filters.sortBy === 'date') {
            return order * (new Date(b.created_at) - new Date(a.created_at));
          }
          if (state.filters.sortBy === 'emissions') {
            const aVal = a.outputs?.co2e?.value || a.co2e_emissions || 0;
            const bVal = b.outputs?.co2e?.value || b.co2e_emissions || 0;
            return order * (bVal - aVal);
          }
          return 0;
        });
        
        return filtered;
      },
      
      // Get categories for active scope
      getCategoriesForScope: () => {
        const state = get();
        return state.dynamicCategories.filter(c => c.scope_code === state.activeScope);
      },
      
      // Get facility by ID
      getFacility: (id) => {
        const state = get();
        return state.facilities.find(f => f.id === id);
      },
      
      // Get fuel by ID
      getFuel: (id) => {
        const state = get();
        return state.fuelDatabase.find(f => f.id === id);
      },
      
      // Check if user has Scope 3 access
      hasScope3Access: () => {
        const state = get();
        const enabledAccess = state.organization?.enabled_access || [];
        return enabledAccess.includes('scope3') || enabledAccess.includes('all');
      },
    })),
    { name: 'emissions-store' }
  )
);

/**
 * Edit form store
 * Isolated state for the emission edit dialog
 */
export const useEditFormStore = create(
  devtools(
    (set, get) => ({
      // ============================================================
      // EDIT STATE
      // ============================================================
      isOpen: false,
      editingEmission: null,
      isLoading: false,
      isSaving: false,
      isDirty: false,
      
      // Form data
      formData: {},
      
      // Category-specific state
      scope3Method: '',
      scope3ActivityType: '',
      scope3ActivityId: '',
      scope3Subcategory: '',
      biogenicScopeSelection: '',
      
      // Override states
      overrides: {
        calorificValue: false,
        density: false,
        emissionFactorHeat: false,
      },
      
      // C7 Employee state
      employees: [],
      employeeMonthlyTotals: {},
      employeeYearlyTotal: {},
      
      // Evidence
      existingEvidences: [],
      uploadedEvidence: null,
      
      // Calculation results
      calculatedEmissions: null,
      
      // ============================================================
      // ACTIONS
      // ============================================================
      openDialog: (emission = null) => set({
        isOpen: true,
        editingEmission: emission,
        isDirty: false,
      }),
      
      closeDialog: () => set({
        isOpen: false,
        editingEmission: null,
        formData: {},
        isDirty: false,
        scope3Method: '',
        scope3ActivityType: '',
        scope3ActivityId: '',
        scope3Subcategory: '',
        biogenicScopeSelection: '',
        overrides: {
          calorificValue: false,
          density: false,
          emissionFactorHeat: false,
        },
        employees: [],
        existingEvidences: [],
        uploadedEvidence: null,
        calculatedEmissions: null,
      }),
      
      setFormData: (data) => set({ formData: data, isDirty: true }),
      updateFormField: (key, value) => set((state) => ({
        formData: { ...state.formData, [key]: value },
        isDirty: true,
      })),
      
      setScope3Method: (method) => set({ scope3Method: method, isDirty: true }),
      setScope3ActivityType: (type) => set({ scope3ActivityType: type, isDirty: true }),
      setScope3ActivityId: (id) => set({ scope3ActivityId: id, isDirty: true }),
      setScope3Subcategory: (sub) => set({ scope3Subcategory: sub, isDirty: true }),
      setBiogenicScopeSelection: (selection) => set({ biogenicScopeSelection: selection, isDirty: true }),
      
      setOverride: (key, value) => set((state) => ({
        overrides: { ...state.overrides, [key]: value },
        isDirty: true,
      })),
      
      setEmployees: (employees) => set({ employees, isDirty: true }),
      setEmployeeMonthlyTotals: (totals) => set({ employeeMonthlyTotals: totals }),
      setEmployeeYearlyTotal: (total) => set({ employeeYearlyTotal: total }),
      
      setExistingEvidences: (evidences) => set({ existingEvidences: evidences }),
      setUploadedEvidence: (evidence) => set({ uploadedEvidence: evidence, isDirty: true }),
      
      setCalculatedEmissions: (emissions) => set({ calculatedEmissions: emissions }),
      
      setLoading: (isLoading) => set({ isLoading }),
      setSaving: (isSaving) => set({ isSaving }),
      markDirty: () => set({ isDirty: true }),
      markClean: () => set({ isDirty: false }),
    }),
    { name: 'edit-form-store' }
  )
);

/**
 * Entry form store
 * Isolated state for the new emission entry form
 */
export const useEntryFormStore = create(
  devtools(
    (set, get) => ({
      // ============================================================
      // FORM STATE
      // ============================================================
      currentStep: 1,
      totalSteps: 4,
      
      // Step 1: Basic Selection
      facilityId: '',
      scope: 'scope1',
      category: '',
      fuelId: '',
      useCustomFuel: false,
      
      // Scope 3 specific
      scope3Method: '',
      scope3ActivityType: '',
      scope3ActivityId: '',
      scope3Subcategory: '',
      scope3CustomActivity: '',
      useCustomActivity: false,
      
      // Biogenic
      biogenicScopeSelection: '',
      
      // Process emissions
      selectedSubIndustry: '',
      selectedTemplate: null,
      
      // Step 2: Process & Responsibility
      processNames: [{ name: '', description: '' }],
      responsiblePerson: '',
      responsiblePersonDesignation: '',
      responsiblePersonContact: '',
      assetName: '',
      fromLocation: '',
      toLocation: '',
      
      // Step 3: Year & Monthly Data
      reportingYearType: 'calendar',
      reportingYear: new Date().getFullYear().toString(),
      frequencyType: 'monthly',
      monthlyData: {},
      yearlyData: {},
      
      // Step 4: Notes
      notes: '',
      
      // Multi-employee (C7)
      employees: [],
      
      // Calculation results
      calcEngineResult: null,
      
      // Loading states
      isCalculating: false,
      isSaving: false,
      
      // ============================================================
      // ACTIONS
      // ============================================================
      setStep: (step) => set({ currentStep: step }),
      nextStep: () => set((state) => ({ 
        currentStep: Math.min(state.currentStep + 1, state.totalSteps) 
      })),
      prevStep: () => set((state) => ({ 
        currentStep: Math.max(state.currentStep - 1, 1) 
      })),
      
      // Step 1 actions
      setFacilityId: (id) => set({ facilityId: id }),
      setScope: (scope) => set({ 
        scope, 
        category: '', 
        fuelId: '',
        scope3Method: '',
        scope3ActivityType: '',
        scope3ActivityId: '',
      }),
      setCategory: (category) => set({ category, fuelId: '' }),
      setFuelId: (id) => set({ fuelId: id }),
      setUseCustomFuel: (use) => set({ useCustomFuel: use }),
      
      setScope3Method: (method) => set({ scope3Method: method }),
      setScope3ActivityType: (type) => set({ scope3ActivityType: type }),
      setScope3ActivityId: (id) => set({ scope3ActivityId: id }),
      setScope3Subcategory: (sub) => set({ scope3Subcategory: sub }),
      setScope3CustomActivity: (activity) => set({ scope3CustomActivity: activity }),
      setUseCustomActivity: (use) => set({ useCustomActivity: use }),
      
      setBiogenicScopeSelection: (selection) => set({ biogenicScopeSelection: selection }),
      
      setSelectedSubIndustry: (industry) => set({ selectedSubIndustry: industry }),
      setSelectedTemplate: (template) => set({ selectedTemplate: template }),
      
      // Step 2 actions
      setProcessNames: (names) => set({ processNames: names }),
      addProcess: () => set((state) => ({
        processNames: [...state.processNames, { name: '', description: '' }]
      })),
      updateProcess: (index, field, value) => set((state) => ({
        processNames: state.processNames.map((p, i) => 
          i === index ? { ...p, [field]: value } : p
        )
      })),
      removeProcess: (index) => set((state) => ({
        processNames: state.processNames.filter((_, i) => i !== index)
      })),
      
      setResponsiblePerson: (person) => set({ responsiblePerson: person }),
      setResponsiblePersonDesignation: (designation) => set({ responsiblePersonDesignation: designation }),
      setResponsiblePersonContact: (contact) => set({ responsiblePersonContact: contact }),
      setAssetName: (name) => set({ assetName: name }),
      setFromLocation: (location) => set({ fromLocation: location }),
      setToLocation: (location) => set({ toLocation: location }),
      
      // Step 3 actions
      setReportingYearType: (type) => set({ reportingYearType: type }),
      setReportingYear: (year) => set({ reportingYear: year }),
      setFrequencyType: (type) => set({ frequencyType: type }),
      setMonthlyData: (data) => set({ monthlyData: data }),
      updateMonthData: (monthKey, field, value) => set((state) => ({
        monthlyData: {
          ...state.monthlyData,
          [monthKey]: {
            ...state.monthlyData[monthKey],
            [field]: value,
          }
        }
      })),
      setYearlyData: (data) => set({ yearlyData: data }),
      updateYearlyField: (field, value) => set((state) => ({
        yearlyData: { ...state.yearlyData, [field]: value }
      })),
      
      // Step 4 actions
      setNotes: (notes) => set({ notes }),
      
      // Employee actions (C7)
      setEmployees: (employees) => set({ employees }),
      
      // Calculation
      setCalcEngineResult: (result) => set({ calcEngineResult: result }),
      setCalculating: (calculating) => set({ isCalculating: calculating }),
      setSaving: (saving) => set({ isSaving: saving }),
      
      // Reset form
      reset: () => set({
        currentStep: 1,
        facilityId: '',
        scope: 'scope1',
        category: '',
        fuelId: '',
        useCustomFuel: false,
        scope3Method: '',
        scope3ActivityType: '',
        scope3ActivityId: '',
        scope3Subcategory: '',
        scope3CustomActivity: '',
        useCustomActivity: false,
        biogenicScopeSelection: '',
        selectedSubIndustry: '',
        selectedTemplate: null,
        processNames: [{ name: '', description: '' }],
        responsiblePerson: '',
        responsiblePersonDesignation: '',
        responsiblePersonContact: '',
        assetName: '',
        fromLocation: '',
        toLocation: '',
        reportingYearType: 'calendar',
        reportingYear: new Date().getFullYear().toString(),
        frequencyType: 'monthly',
        monthlyData: {},
        yearlyData: {},
        notes: '',
        employees: [],
        calcEngineResult: null,
        isCalculating: false,
        isSaving: false,
      }),
    }),
    { name: 'entry-form-store' }
  )
);

export default useEmissionsStore;
