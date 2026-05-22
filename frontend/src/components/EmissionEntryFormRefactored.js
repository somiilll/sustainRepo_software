/**
 * EmissionEntryForm - Refactored Version
 * 
 * This is the refactored emission entry form that uses:
 * - Category registry for category detection (replacing if/else chains)
 * - Modular shared components
 * - Cleaner organization of business logic
 * 
 * Original: 6335 lines -> Target: ~2500 lines
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';

// UI Components
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { 
  Plus, Trash2, Upload, X, Check, ChevronRight, ChevronLeft, 
  Info, Eye, Download, FileText, Loader2, Search, Calculator 
} from 'lucide-react';
import { toast } from 'sonner';

// Utilities
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';

// Modular components (keeping MultiEmployeeInput for C7)
import MultiEmployeeInput from './MultiEmployeeInput';

// Import from refactored modules
import { API } from '../config/api';
import { CALENDAR_YEAR_MONTHS, FINANCIAL_YEAR_MONTHS, getMonthName } from '../constants/months';
import { 
  getCategoryConfig, 
  getCategoryModule,
  isCategoryRegistered 
} from '../modules/ghg/emissions/categories';
import {
  isC7Category,
  isC6Category,
  getCategoryCode,
  requiresSubcategory as checkRequiresSubcategory,
  requiresAssetName as checkRequiresAssetName,
  requiresLocation as checkRequiresLocation,
  hasActivityType as checkHasActivityType,
  SUBCATEGORY_OPTIONS,
} from '../constants/categories';
import { 
  isSupplierBased, 
  isSpendBased, 
  isActivityBased,
  getMethodLabel as getMethodLabelUtil 
} from '../constants/calculation-methods';
import logger from '../utils/logger';

// ============================================================================
// HELPER FUNCTIONS (moved from inline to reduce clutter)
// ============================================================================

/**
 * Check if unit is volume-based
 */
const isVolumeUnit = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => u.symbol?.toLowerCase() === unit?.toLowerCase());
  return unitDef?.unit_type === 'volume';
};

/**
 * Check if a month/year combination is in the future
 */
const isFutureMonth = (monthKey, year, yearType = 'calendar') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  let selectedYear = parseInt(year);
  const selectedMonth = parseInt(monthKey);
  
  if (yearType === 'financial' && selectedMonth >= 1 && selectedMonth <= 3) {
    selectedYear = selectedYear + 1;
  }
  
  if (selectedYear > currentYear) return true;
  if (selectedYear === currentYear && selectedMonth > currentMonth) return true;
  return false;
};

/**
 * Get display year for financial year months
 */
const getMonthDisplayYear = (monthKey, reportingYear, yearType) => {
  if (yearType === 'calendar') return reportingYear;
  const month = parseInt(monthKey);
  if (month >= 1 && month <= 3) {
    return (parseInt(reportingYear) + 1).toString();
  }
  return reportingYear;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EmissionEntryForm({
  facilities,
  fuelDatabase,
  centralizedUnits,
  formulaDefinitions = [],
  formulaParameters = [],
  emissionConfigurations = [],
  gwpConfig = null,
  processTemplates = [],
  dynamicScopes = [],
  dynamicCategories = [],
  hasScope3Access = false,
  getAuthHeader,
  onSuccess,
  onCancel,
  onFormChange,
  editingEmission = null,
  configLabels = null,
  organization = null
}) {
  // ============================================================================
  // STATE MANAGEMENT - Grouped by concern
  // ============================================================================

  // --- Form navigation ---
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // --- Basic selection (Step 1) ---
  const [facilityId, setFacilityId] = useState('');
  const [scope, setScope] = useState('scope1');
  const [category, setCategory] = useState('');
  
  // --- Fuel/Activity selection ---
  const [fuelId, setFuelId] = useState('');
  const [useCustomFuel, setUseCustomFuel] = useState(false);
  const [customFuelName, setCustomFuelName] = useState('');
  const [customEmissionFactor, setCustomEmissionFactor] = useState('');
  const [customEmissionFactorUnit, setCustomEmissionFactorUnit] = useState('tCO2/kg');
  const [customSource, setCustomSource] = useState('');
  const [fuelSearchTerm, setFuelSearchTerm] = useState('');

  // --- Scope 3 specific ---
  const [scope3Method, setScope3Method] = useState('');
  const [scope3EFData, setScope3EFData] = useState([]);
  const [scope3ActivityId, setScope3ActivityId] = useState('');
  const [scope3ActivityType, setScope3ActivityType] = useState('');
  const [scope3Subcategory, setScope3Subcategory] = useState('');
  const [scope3CustomActivity, setScope3CustomActivity] = useState('');
  const [useCustomActivity, setUseCustomActivity] = useState(false);
  const [loadingScope3EF, setLoadingScope3EF] = useState(false);

  // --- Category-specific fields ---
  const [assetName, setAssetName] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');

  // --- Biogenic ---
  const [biogenicScopeSelection, setBiogenicScopeSelection] = useState('');
  const [biogenicCategories, setBiogenicCategories] = useState([]);
  const [loadingBiogenicCategories, setLoadingBiogenicCategories] = useState(false);

  // --- C7 Employee Commuting ---
  const [employees, setEmployees] = useState([]);
  const [employeeMonthlyTotals, setEmployeeMonthlyTotals] = useState({});
  const [employeeYearlyTotal, setEmployeeYearlyTotal] = useState({});
  const [isCalculatingEmployee, setIsCalculatingEmployee] = useState(false);
  const [c7FormulaId, setC7FormulaId] = useState(null);
  const [c7FormulaName, setC7FormulaName] = useState('');

  // --- Calc Engine / Form Config ---
  const [formConfig, setFormConfig] = useState(null);
  const [loadingFormConfig, setLoadingFormConfig] = useState(false);
  const [calcEngineResult, setCalcEngineResult] = useState(null);
  const [isCalcEngineCalculating, setIsCalcEngineCalculating] = useState(false);
  const [matchedFormulaId, setMatchedFormulaId] = useState(null);
  const [decisionFieldValues, setDecisionFieldValues] = useState({});

  // --- Fugitive emissions ---
  const [fugitiveEmissionsData, setFugitiveEmissionsData] = useState([]);

  // --- Process emissions ---
  const [selectedSubIndustry, setSelectedSubIndustry] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateInputValues, setTemplateInputValues] = useState({});
  const [processNames, setProcessNames] = useState([{ name: '', description: '' }]);

  // --- Responsible person ---
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [responsiblePersonDesignation, setResponsiblePersonDesignation] = useState('');
  const [responsiblePersonContact, setResponsiblePersonContact] = useState('');

  // --- Reporting period ---
  const orgReportingYearType = organization?.reporting_year_type;
  const defaultYearType = orgReportingYearType === 'financial_year' ? 'financial' : 'calendar';
  const [reportingYearType, setReportingYearType] = useState(defaultYearType);
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear().toString());
  const [frequencyType, setFrequencyType] = useState('monthly');
  const [monthlyData, setMonthlyData] = useState({});
  const [yearlyData, setYearlyData] = useState({});
  const [yearlyCalcResult, setYearlyCalcResult] = useState(null);
  const [isCalculatingYearly, setIsCalculatingYearly] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState([]);

  // --- Notes ---
  const [notes, setNotes] = useState('');

  // --- Supplier/Employee info ---
  const [supplierName, setSupplierName] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  // --- UI state ---
  const [isSaving, setIsSaving] = useState(false);

  // ============================================================================
  // CATEGORY DETECTION - Using Category Registry
  // ============================================================================

  /**
   * Get category code from current category name
   */
  const categoryCode = useMemo(() => {
    return getCategoryCode(category);
  }, [category]);

  /**
   * Get category configuration from registry
   */
  const categoryConfig = useMemo(() => {
    return getCategoryConfig(category);
  }, [category]);

  /**
   * Check if current category is C7 Employee Commuting
   */
  const isC7EmployeeCommuting = useMemo(() => {
    return isC7Category(category) && scope === 'scope3';
  }, [category, scope]);

  /**
   * Check if current category requires subcategory
   */
  const requiresSubcategory = useMemo(() => {
    const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    if (scope !== 'scope3' || isBiogenicScope3 || !category) return false;
    return checkRequiresSubcategory(category);
  }, [scope, category, biogenicScopeSelection]);

  /**
   * Check if current category requires asset name
   */
  const requiresAssetName = useMemo(() => {
    if (scope !== 'scope3' || !category) return false;
    return checkRequiresAssetName(category);
  }, [scope, category]);

  /**
   * Check if current category shows location fields
   */
  const showsLocationFields = useMemo(() => {
    if (scope !== 'scope3' || !category) return false;
    return checkRequiresLocation(category);
  }, [scope, category]);

  /**
   * Check if current category has activity type selection
   */
  const hasActivityTypeSelection = useMemo(() => {
    if (scope !== 'scope3' || !category) return false;
    return checkHasActivityType(category);
  }, [scope, category]);

  // ============================================================================
  // HELPER CALLBACKS
  // ============================================================================

  /**
   * Get method label (uses centralized config if available)
   */
  const getMethodLabel = useCallback((method, short = false) => {
    if (!method) return '-';
    const defaultLabels = {
      activity_basis: short ? 'Average' : 'Average Data Based',
      spend_basis: short ? 'Spend' : 'Spend Based',
      supplier_basis: short ? 'Supplier' : 'Supplier Based'
    };
    if (configLabels) {
      const labels = short ? configLabels.calculation_methods_short : configLabels.calculation_methods;
      return labels?.[method] || defaultLabels[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return defaultLabels[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [configLabels]);

  /**
   * Get months based on year type
   */
  const getMonthsForYearType = useCallback(() => {
    return reportingYearType === 'financial' ? FINANCIAL_YEAR_MONTHS : CALENDAR_YEAR_MONTHS;
  }, [reportingYearType]);

  // ============================================================================
  // CONTINUE WITH REST OF COMPONENT...
  // (The complete implementation would continue here)
  // ============================================================================

  // For now, render a placeholder - the full migration would continue below
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Emission Entry Form (Refactored)</h2>
      <p className="text-stone-600">
        This component is being refactored. The full implementation continues with:
      </p>
      <ul className="list-disc ml-6 mt-2 text-stone-500">
        <li>Scope 3 EF data loading</li>
        <li>Form config fetching</li>
        <li>Calculation logic</li>
        <li>Step 1-4 rendering</li>
        <li>Save logic</li>
      </ul>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button disabled>Save (Refactoring in progress)</Button>
      </div>
    </div>
  );
}
