import React, { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Plus, Trash2, User, Calculator, Users } from 'lucide-react';

/**
 * MultiEmployeeInput - Config-driven component for multi-entity data entry
 * Used for Category 7 (Employee Commuting) and potentially other categories
 * 
 * Props:
 * - entityLabel: string (e.g., "Employee", "Supplier", "Vehicle")
 * - fields: array of field configs [{variable, label, type, unit, required}]
 * - selectedActivityType: currently selected activity type (from step 1)
 * - employees: array of employee data
 * - onEmployeesChange: callback when employees data changes
 * - activeMonths: array of active month keys
 * - onCalculateEmployee: callback to calculate emissions for an employee
 * - monthlyTotals: aggregated monthly totals
 * - yearlyTotal: aggregated yearly total
 * - isCalculating: boolean indicating calculation in progress
 * - disabled: boolean to disable inputs
 */

const MONTHS = [
  { key: 'jan', label: 'January', days: 31 },
  { key: 'feb', label: 'February', days: 28 }, // Leap year handled separately
  { key: 'mar', label: 'March', days: 31 },
  { key: 'apr', label: 'April', days: 30 },
  { key: 'may', label: 'May', days: 31 },
  { key: 'jun', label: 'June', days: 30 },
  { key: 'jul', label: 'July', days: 31 },
  { key: 'aug', label: 'August', days: 31 },
  { key: 'sep', label: 'September', days: 30 },
  { key: 'oct', label: 'October', days: 31 },
  { key: 'nov', label: 'November', days: 30 },
  { key: 'dec', label: 'December', days: 31 },
];

// Helper to get days in a month for a specific year (handles leap years)
const getDaysInMonth = (monthKey, year) => {
  const month = MONTHS.find(m => m.key === monthKey);
  if (!month) return 31;
  
  // Handle February leap year
  if (monthKey === 'feb' && year) {
    const yearNum = parseInt(year);
    const isLeapYear = (yearNum % 4 === 0 && yearNum % 100 !== 0) || (yearNum % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  
  return month.days;
};

const MultiEmployeeInput = ({
  entityLabel = 'Employee',
  fields = [],
  selectedActivityType = '',
  calculationMethod = '', // New: for showing supplier units
  employees = [],
  onEmployeesChange,
  activeMonths = [],
  onCalculateEmployee,
  monthlyTotals = {},
  yearlyTotal = {},
  isCalculating = false,
  disabled = false,
  reportingYear = '', // New: for showing year in totals
  reportingYearType = 'calendar', // New: 'calendar' or 'financial'
  emissionFactorInfo = null, // New: for showing EF + formula
  isEditMode = false, // New: hide summary stats in edit mode
  showEmissionFactorCard = true, // New: control EF card visibility
  onValidationChange = null, // New: callback to report validation state
  frequencyType = 'monthly', // NEW: 'monthly' or 'yearly' for frequency support
  isFutureMonth = null, // NEW: Function to check if month is in future (monthKey) => boolean
}) => {
  // DEBUG: Log props received by MultiEmployeeInput
  console.log('[MultiEmployeeInput DEBUG] Props received:');
  console.log('[MultiEmployeeInput DEBUG] employees:', employees);
  console.log('[MultiEmployeeInput DEBUG] employees.length:', employees?.length);
  console.log('[MultiEmployeeInput DEBUG] frequencyType:', frequencyType);
  console.log('[MultiEmployeeInput DEBUG] isEditMode:', isEditMode);
  if (employees?.[0]) {
    console.log('[MultiEmployeeInput DEBUG] First employee:', employees[0]);
    console.log('[MultiEmployeeInput DEBUG] First employee yearly_data:', employees[0]?.yearly_data);
    console.log('[MultiEmployeeInput DEBUG] First employee yearly_data.emissions:', employees[0]?.yearly_data?.emissions);
    console.log('[MultiEmployeeInput DEBUG] First employee monthly_data:', employees[0]?.monthly_data);
  }
  
  // State for expanded accordions
  const [expandedAccordions, setExpandedAccordions] = useState([]);
  
  // Track selected month for calculation details (format: `${employeeId}-${monthKey}`)
  const [selectedMonthForDetails, setSelectedMonthForDetails] = useState(null);
  
  // State for add employee validation error
  const [addEmployeeError, setAddEmployeeError] = useState('');
  
  // State for validation errors per employee
  const [validationErrors, setValidationErrors] = useState({});

  // Check if we're in yearly mode
  const isYearlyMode = frequencyType === 'yearly';

  // Auto-select first month with emissions in edit mode for calculation details
  useEffect(() => {
    if (isEditMode && !isYearlyMode && employees.length > 0 && !selectedMonthForDetails) {
      // Find first employee with a month that has calculated emissions
      for (const emp of employees) {
        if (emp.monthly_data) {
          for (const [monthKey, monthData] of Object.entries(emp.monthly_data)) {
            if (monthData?.emissions?.co2e !== null && monthData?.emissions?.co2e !== undefined) {
              setSelectedMonthForDetails(`${emp.id}-${monthKey}`);
              return;
            }
          }
        }
      }
    }
  }, [isEditMode, isYearlyMode, employees, selectedMonthForDetails]);

  // Validate all employees - returns { isValid, errors }
  const validateEmployees = useCallback(() => {
    const errors = {};
    let isValid = true;
    
    // Check if supplier_basis method is used
    const isSupplierBasis = calculationMethod === 'supplier_basis';
    
    employees.forEach((employee, index) => {
      const empErrors = [];
      
      // Check employee name is required and not empty/whitespace
      if (!employee.name || employee.name.trim() === '') {
        empErrors.push('Employee Name is required.');
        isValid = false;
      }
      
      if (isYearlyMode) {
        // For yearly mode: check yearly_data has at least one input value
        const hasYearlyData = Object.values(employee.yearly_data?.inputs || {}).some(v => 
          v !== '' && v !== null && v !== undefined && v !== 0
        );
        
        if (!hasYearlyData) {
          empErrors.push('Please enter annual data or remove the employee entry.');
          isValid = false;
        }
        
        // For supplier_basis: validate units are provided for fields with values
        if (isSupplierBasis && hasYearlyData) {
          const inputs = employee.yearly_data?.inputs || {};
          fields.forEach(field => {
            const value = inputs[field.variable];
            const unit = inputs[`${field.variable}_unit`];
            // If value is entered, unit must also be provided
            if (value && value !== '' && value !== 0) {
              if (!unit || unit.trim() === '') {
                empErrors.push(`Unit is required for "${field.label}".`);
                isValid = false;
              }
            }
          });
        }
      } else {
        // For monthly mode: check at least one month has data
        const hasAnyMonthData = Object.values(employee.monthly_data || {}).some(monthData => {
          if (!monthData?.inputs) return false;
          return Object.values(monthData.inputs).some(v => 
            v !== '' && v !== null && v !== undefined && v !== 0
          );
        });
        
        if (!hasAnyMonthData) {
          empErrors.push('Please enter data for at least one month or remove the employee entry.');
          isValid = false;
        }
        
        // For supplier_basis in monthly mode: validate units for each month with data
        if (isSupplierBasis) {
          Object.entries(employee.monthly_data || {}).forEach(([monthKey, monthData]) => {
            const inputs = monthData?.inputs || {};
            const hasMonthData = Object.values(inputs).some(v => 
              v !== '' && v !== null && v !== undefined && v !== 0
            );
            if (hasMonthData) {
              fields.forEach(field => {
                const value = inputs[field.variable];
                const unit = inputs[`${field.variable}_unit`];
                if (value && value !== '' && value !== 0) {
                  if (!unit || unit.trim() === '') {
                    const monthLabel = MONTHS.find(m => m.key === monthKey)?.label || monthKey;
                    empErrors.push(`Unit is required for "${field.label}" in ${monthLabel}.`);
                    isValid = false;
                  }
                }
              });
            }
          });
        }
      }
      
      if (empErrors.length > 0) {
        errors[employee.id] = empErrors;
      }
    });
    
    setValidationErrors(errors);
    
    // Report validation state to parent
    if (onValidationChange) {
      onValidationChange({ isValid, errors });
    }
    
    return { isValid, errors };
  }, [employees, onValidationChange, isYearlyMode, calculationMethod, fields]);

  // Generate unique ID for new employee
  const generateEmployeeId = useCallback(() => {
    return `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add new employee with validation (#5)
  const handleAddEmployee = useCallback(() => {
    // Validate that activity type is selected first
    if (!selectedActivityType) {
      // Show validation message - parent should handle toast
      console.warn('Cannot add employee: No activity type selected');
      return { error: 'Please select an activity type before adding employees' };
    }
    
    const newEmployee = {
      id: generateEmployeeId(),
      name: '',
      employee_id: '',
      department: '',
      from_location: '', // Optional: Journey starting point
      to_location: '', // Optional: Journey destination
      activity_type: selectedActivityType, // Use activity type from step 1
      calculation_method: calculationMethod, // Store calculation method
      monthly_data: {},
      yearly_data: { inputs: {}, emissions: null }, // Always initialize yearly_data
    };
    
    // Initialize monthly data for active months
    activeMonths.forEach(monthKey => {
      newEmployee.monthly_data[monthKey] = {
        inputs: {},
        emissions: null,
      };
    });
    
    // Add new employee at the TOP of the list (UX improvement)
    const updatedEmployees = [newEmployee, ...employees];
    onEmployeesChange(updatedEmployees);
    
    // Expand the new employee accordion
    setExpandedAccordions(prev => [...prev, newEmployee.id]);
    return { success: true };
  }, [employees, onEmployeesChange, generateEmployeeId, activeMonths, selectedActivityType, calculationMethod]);

  // Wrapped add employee handler with error display
  const handleAddEmployeeWithValidation = useCallback(() => {
    const result = handleAddEmployee();
    if (result?.error) {
      setAddEmployeeError(result.error);
      setTimeout(() => setAddEmployeeError(''), 3000);
    } else {
      setAddEmployeeError('');
    }
  }, [handleAddEmployee]);

  // Format year display based on type (#4)
  const getYearDisplay = useCallback(() => {
    if (!reportingYear) return '';
    if (reportingYearType === 'financial') {
      return `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`;
    }
    return `CY ${reportingYear}`;
  }, [reportingYear, reportingYearType]);

  // Get display label for activity type
  const getActivityTypeLabel = useCallback((activityType) => {
    const labels = {
      'car_travel': 'Car Travel',
      'bus_travel': 'Bus Travel',
      'rail_travel': 'Rail Travel',
      'air_travel': 'Air Travel',
      'taxi_travel': 'Taxi Travel',
      'bike_travel': 'Bike Travel',
      'wfh': 'Work From Home',
      'hotel_stay': 'Hotel Stay',
    };
    return labels[activityType] || activityType?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
  }, []);

  // Remove employee
  const handleRemoveEmployee = useCallback((employeeId) => {
    const updatedEmployees = employees.filter(emp => emp.id !== employeeId);
    onEmployeesChange(updatedEmployees);
    setExpandedAccordions(prev => prev.filter(id => id !== employeeId));
  }, [employees, onEmployeesChange]);

  // Update employee info (name, id, department)
  const handleEmployeeInfoChange = useCallback((employeeId, field, value) => {
    const updatedEmployees = employees.map(emp => {
      if (emp.id === employeeId) {
        return { ...emp, [field]: value };
      }
      return emp;
    });
    onEmployeesChange(updatedEmployees);
  }, [employees, onEmployeesChange]);

  // Update monthly input value for an employee
  const handleMonthlyInputChange = useCallback((employeeId, monthKey, variable, value) => {
    // Validate working_days and qty_days_travelled don't exceed days in month
    if ((variable === 'working_days' || variable === 'qty_days_travelled') && value !== '') {
      const numValue = parseFloat(value);
      const maxDays = getDaysInMonth(monthKey, reportingYear);
      if (numValue > maxDays) {
        const fieldLabel = variable === 'working_days' ? 'Working days' : 'No. of days travelled';
        toast.error(`${fieldLabel} cannot exceed ${maxDays} for ${MONTHS.find(m => m.key === monthKey)?.label || monthKey}`);
        return;
      }
    }
    
    // Validate working_hour_per_day doesn't exceed 24 hours
    if (variable === 'working_hour_per_day' && value !== '') {
      const numValue = parseFloat(value);
      if (numValue > 24) {
        toast.error('Working hours per day cannot exceed 24 hours');
        return;
      }
    }
    
    const updatedEmployees = employees.map(emp => {
      if (emp.id === employeeId) {
        const monthData = emp.monthly_data?.[monthKey] || { inputs: {}, emissions: null };
        const oldValue = monthData.inputs?.[variable];
        
        // Compare values properly - convert to same type for comparison
        // Treat empty string, null, undefined as equivalent
        const normalizeValue = (v) => {
          if (v === '' || v === null || v === undefined) return null;
          return parseFloat(v);
        };
        const oldNormalized = normalizeValue(oldValue);
        const newNormalized = normalizeValue(value);
        const valueChanged = oldNormalized !== newNormalized;
        
        return {
          ...emp,
          monthly_data: {
            ...emp.monthly_data,
            [monthKey]: {
              ...monthData,
              inputs: {
                ...monthData.inputs,
                [variable]: value,
              },
              // Only clear emissions and calculation_details if value actually changed
              ...(valueChanged ? {
                emissions: null,
                calculation_details: null,
              } : {}),
            },
          },
        };
      }
      return emp;
    });
    onEmployeesChange(updatedEmployees);
  }, [employees, onEmployeesChange, reportingYear]);

  // NEW: Update yearly input value for an employee
  const handleYearlyInputChange = useCallback((employeeId, variable, value) => {
    // Validate working_hour_per_day doesn't exceed 24 hours
    if (variable === 'working_hour_per_day' && value !== '') {
      const numValue = parseFloat(value);
      if (numValue > 24) {
        toast.error('Working hours per day cannot exceed 24 hours');
        return;
      }
    }
    
    // Validate qty_days_travelled doesn't exceed 365 days for yearly mode
    if (variable === 'qty_days_travelled' && value !== '') {
      const numValue = parseFloat(value);
      const yearNum = parseInt(reportingYear) || new Date().getFullYear();
      const isLeapYear = (yearNum % 4 === 0 && yearNum % 100 !== 0) || (yearNum % 400 === 0);
      const maxDays = isLeapYear ? 366 : 365;
      if (numValue > maxDays) {
        toast.error(`No. of days travelled cannot exceed ${maxDays} days for the year`);
        return;
      }
    }
    
    const updatedEmployees = employees.map(emp => {
      if (emp.id === employeeId) {
        const yearlyData = emp.yearly_data || { inputs: {}, emissions: null };
        const oldValue = yearlyData.inputs?.[variable];
        
        // Compare values properly - convert to same type for comparison
        // Treat empty string, null, undefined as equivalent
        const normalizeValue = (v) => {
          if (v === '' || v === null || v === undefined) return null;
          return parseFloat(v);
        };
        const oldNormalized = normalizeValue(oldValue);
        const newNormalized = normalizeValue(value);
        const valueChanged = oldNormalized !== newNormalized;
        
        return {
          ...emp,
          yearly_data: {
            ...yearlyData,
            inputs: {
              ...yearlyData.inputs,
              [variable]: value,
            },
            // Only clear emissions if value actually changed
            ...(valueChanged ? {
              emissions: null,
              calculation_details: null,
            } : {}),
          },
        };
      }
      return emp;
    });
    onEmployeesChange(updatedEmployees);
  }, [employees, onEmployeesChange, reportingYear]);

  // NEW: Calculate yearly emissions for an employee
  const handleCalculateYearly = useCallback(async (employeeId) => {
    const employee = employees.find(emp => emp.id === employeeId);
    if (!employee) return;
    
    // Validate employee name before calculating
    if (!employee.name || employee.name.trim() === '') {
      toast.error('Employee Name is required before calculating.');
      setValidationErrors(prev => ({
        ...prev,
        [employeeId]: ['Employee Name is required.']
      }));
      return;
    }
    
    // For supplier_basis: validate units are provided before calculation
    const isSupplierBasis = calculationMethod === 'supplier_basis';
    if (isSupplierBasis) {
      const inputs = employee.yearly_data?.inputs || {};
      const missingUnits = [];
      
      fields.forEach(field => {
        const value = inputs[field.variable];
        const unit = inputs[`${field.variable}_unit`];
        if (value && value !== '' && value !== 0) {
          if (!unit || unit.trim() === '') {
            missingUnits.push(field.label);
          }
        }
      });
      
      if (missingUnits.length > 0) {
        toast.error(`Unit is required for: ${missingUnits.join(', ')}`);
        setValidationErrors(prev => ({
          ...prev,
          [employeeId]: missingUnits.map(label => `Unit is required for "${label}".`)
        }));
        return;
      }
    }
    
    // Clear validation error for this employee if all validations pass
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[employeeId];
      return newErrors;
    });
    
    if (onCalculateEmployee) {
      // For yearly mode, pass 'yearly' as the month key
      await onCalculateEmployee(employeeId, 'yearly', employee);
    }
  }, [employees, onCalculateEmployee, calculationMethod, fields]);

  // Calculate emissions for a specific employee and month
  const handleCalculateMonth = useCallback(async (employeeId, monthKey) => {
    if (onCalculateEmployee) {
      const employee = employees.find(emp => emp.id === employeeId);
      if (employee) {
        // Validate employee name before calculating
        if (!employee.name || employee.name.trim() === '') {
          toast.error('Employee Name is required before calculating.');
          return;
        }
        
        // For supplier_basis: validate units are provided before calculation
        const isSupplierBasis = calculationMethod === 'supplier_basis';
        if (isSupplierBasis) {
          const inputs = employee.monthly_data?.[monthKey]?.inputs || {};
          const missingUnits = [];
          
          fields.forEach(field => {
            const value = inputs[field.variable];
            const unit = inputs[`${field.variable}_unit`];
            if (value && value !== '' && value !== 0) {
              if (!unit || unit.trim() === '') {
                missingUnits.push(field.label);
              }
            }
          });
          
          if (missingUnits.length > 0) {
            const monthLabel = MONTHS.find(m => m.key === monthKey)?.label || monthKey;
            toast.error(`Unit is required for: ${missingUnits.join(', ')} in ${monthLabel}`);
            return;
          }
        }
        
        await onCalculateEmployee(employeeId, monthKey, employee);
      }
    }
  }, [employees, onCalculateEmployee, calculationMethod, fields]);

  // Calculate all months for an employee
  const handleCalculateAllMonths = useCallback(async (employeeId) => {
    const employee = employees.find(emp => emp.id === employeeId);
    if (!employee) return;
    
    // Validate employee name before calculating
    if (!employee.name || employee.name.trim() === '') {
      toast.error('Employee Name is required before calculating.');
      // Also update validation errors state
      setValidationErrors(prev => ({
        ...prev,
        [employeeId]: ['Employee Name is required.']
      }));
      return;
    }
    
    // For supplier_basis: validate units are provided for all months with data
    const isSupplierBasis = calculationMethod === 'supplier_basis';
    if (isSupplierBasis) {
      const allMissingUnits = [];
      
      for (const monthKey of activeMonths) {
        const monthData = employee.monthly_data?.[monthKey];
        const inputs = monthData?.inputs || {};
        const hasInputData = Object.values(inputs).some(v => v !== '' && v !== null && v !== undefined && v !== 0);
        
        if (hasInputData) {
          fields.forEach(field => {
            const value = inputs[field.variable];
            const unit = inputs[`${field.variable}_unit`];
            if (value && value !== '' && value !== 0) {
              if (!unit || unit.trim() === '') {
                const monthLabel = MONTHS.find(m => m.key === monthKey)?.label || monthKey;
                allMissingUnits.push(`${field.label} in ${monthLabel}`);
              }
            }
          });
        }
      }
      
      if (allMissingUnits.length > 0) {
        toast.error(`Units required for: ${allMissingUnits.slice(0, 3).join(', ')}${allMissingUnits.length > 3 ? ` and ${allMissingUnits.length - 3} more...` : ''}`);
        setValidationErrors(prev => ({
          ...prev,
          [employeeId]: allMissingUnits.map(item => `Unit required for ${item}`)
        }));
        return;
      }
    }
    
    // Clear validation error for this employee if all validations pass
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[employeeId];
      return newErrors;
    });
    
    if (onCalculateEmployee) {
      for (const monthKey of activeMonths) {
        const monthData = employee.monthly_data?.[monthKey];
        // Check if any input has a value
        const hasInputData = monthData?.inputs && Object.values(monthData.inputs).some(v => v !== '' && v !== null && v !== undefined);
        if (hasInputData) {
          await onCalculateEmployee(employeeId, monthKey, employee);
        }
      }
    }
  }, [employees, activeMonths, onCalculateEmployee, calculationMethod, fields]);

  // Get fields for the current activity type - use fields from parent (already filtered)
  const getFieldsForActivityType = useCallback(() => {
    // Fields are already filtered based on activity type from the parent
    // Just return the fields as-is
    return fields;
  }, [fields]);

  // Calculate filled months count - check for INPUT data, not just calculated emissions
  const getFilledMonthsCount = useCallback((employee) => {
    if (!employee?.monthly_data) return 0;
    const currentFields = getFieldsForActivityType();
    
    return Object.values(employee.monthly_data).filter(m => {
      if (!m?.inputs) return false;
      // Check if all required fields have values
      return currentFields.every(field => {
        const value = m.inputs[field.variable];
        return value !== '' && value !== null && value !== undefined;
      });
    }).length;
  }, [getFieldsForActivityType]);

  // Calculate months with calculated emissions
  const getCalculatedMonthsCount = useCallback((employee) => {
    if (!employee?.monthly_data) return 0;
    return Object.values(employee.monthly_data).filter(m => 
      m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined
    ).length;
  }, []);

  // Get employee total emissions
  const getEmployeeTotalEmissions = useCallback((employee) => {
    // For yearly mode, use yearly_data
    if (isYearlyMode && employee?.yearly_data?.emissions?.co2e) {
      return employee.yearly_data.emissions.co2e;
    }
    
    // For monthly mode, sum all months
    if (!employee?.monthly_data) return 0;
    return Object.values(employee.monthly_data).reduce((sum, m) => {
      return sum + (m?.emissions?.co2e || 0);
    }, 0);
  }, [isYearlyMode]);

  // Format number for display
  const formatNumber = (num, decimals = 4) => {
    if (num === null || num === undefined) return '-';
    return Number(num).toFixed(decimals);
  };

  // Check if a month has input data (ignore metadata fields)
  const monthHasInputData = useCallback((monthData) => {
    if (!monthData?.inputs) return false;
    // Fields to ignore when checking for input data
    const metadataFields = ['from_location', 'to_location', 'employee_name', 'employee_id', 'department'];
    return Object.entries(monthData.inputs).some(([key, value]) => {
      // Skip metadata fields and unit fields
      if (metadataFields.includes(key) || key.endsWith('_unit')) return false;
      return value !== '' && value !== null && value !== undefined;
    });
  }, []);

  return (
    <div className="space-y-4" data-testid="multi-employee-input">
      {/* Header with Year Label and Add Employee Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-gray-800">
            {entityLabel}s ({employees.length})
            {reportingYear && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                • {getYearDisplay()}
              </span>
            )}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddEmployeeWithValidation}
            disabled={disabled || !selectedActivityType}
            className={`flex items-center gap-2 ${!selectedActivityType ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="add-employee-btn"
          >
            <Plus className="h-4 w-4" />
            Add {entityLabel}
          </Button>
          {addEmployeeError && (
            <span className="text-xs text-red-500">{addEmployeeError}</span>
          )}
          {!selectedActivityType && !addEmployeeError && (
            <span className="text-xs text-amber-600">Select activity type first</span>
          )}
        </div>
      </div>

      {/* EF + Formula Info (#7) - Only show if showEmissionFactorCard is true */}
      {emissionFactorInfo && showEmissionFactorCard && (
        <Card className="p-3 bg-blue-50 border-blue-200">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Calculation Details</span>
              {emissionFactorInfo.activityType && (
                <span className="text-xs bg-blue-100 px-2 py-0.5 rounded-full text-blue-700">
                  {emissionFactorInfo.activityType}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {emissionFactorInfo.emissionFactor && (
                <div>
                  <span className="text-gray-600">Emission Factor: </span>
                  <span className="font-medium text-blue-700">
                    {emissionFactorInfo.emissionFactor} {emissionFactorInfo.efUnit || ''}
                  </span>
                </div>
              )}
              {emissionFactorInfo.source && (
                <div>
                  <span className="text-gray-600">Source: </span>
                  <span className="font-medium">{emissionFactorInfo.source}</span>
                </div>
              )}
              {emissionFactorInfo.formula && false && (
                <div className="col-span-full">
                  <span className="text-gray-600">Formula: </span>
                  <code className="text-xs bg-blue-100 px-2 py-1 rounded text-blue-800">
                    {emissionFactorInfo.formula}
                  </code>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Summary Stats - Simplified for edit mode */}
      {employees.length > 0 && !isEditMode && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Total {entityLabel}s</p>
              <p className="text-xl font-bold text-emerald-700">{employees.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Emissions</p>
              <p className="text-xl font-bold text-emerald-700">
                {formatNumber(employees.reduce((sum, emp) => sum + getEmployeeTotalEmissions(emp), 0))} tCO<sub>2</sub>e
              </p>
            </div>
          </div>
        </Card>
      )}
      
      {/* Edit mode: Simple employee count only */}
      {employees.length > 0 && isEditMode && (
        <div className="flex items-center justify-between px-2 py-1 bg-emerald-50 rounded">
          <span className="text-sm text-gray-600">Total {entityLabel}s: <strong>{employees.length}</strong></span>
          <span className="text-sm font-semibold text-emerald-700">
            {formatNumber(employees.reduce((sum, emp) => sum + getEmployeeTotalEmissions(emp), 0))} tCO<sub>2</sub>e
          </span>
        </div>
      )}

      {/* Employee List */}
      {employees.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2 border-gray-300">
          <User className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 mb-4">No {entityLabel.toLowerCase()}s added yet</p>
          <Button
            type="button"
            variant="default"
            onClick={handleAddEmployeeWithValidation}
            disabled={disabled || !selectedActivityType}
            className={`bg-emerald-600 hover:bg-emerald-700 ${!selectedActivityType ? 'opacity-50' : ''}`}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First {entityLabel}
          </Button>
          {!selectedActivityType && (
            <p className="text-xs text-amber-600 mt-2">Select an activity type first</p>
          )}
        </Card>
      ) : (
        <Accordion
          type="multiple"
          value={expandedAccordions}
          onValueChange={setExpandedAccordions}
          className="space-y-3"
        >
          {employees.map((employee, empIndex) => {
            const filledCount = getFilledMonthsCount(employee);
            const calculatedCount = getCalculatedMonthsCount(employee);
            const hasYearlyEmissions = employee.yearly_data?.emissions?.co2e !== null && employee.yearly_data?.emissions?.co2e !== undefined;
            
            return (
              <AccordionItem
                key={employee.id}
                value={employee.id}
                className="border rounded-lg bg-white shadow-sm"
                data-testid={`employee-item-${empIndex}`}
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800">
                          {employee.name || `${entityLabel} ${empIndex + 1}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {selectedActivityType && (
                            <span className="text-emerald-600 mr-2">
                              {getActivityTypeLabel(selectedActivityType)}
                            </span>
                          )}
                          {isYearlyMode ? (
                            <>
                              <span className="text-purple-600 mr-2">Annual Entry</span>
                              {hasYearlyEmissions && <span className="text-emerald-600">• Calculated</span>}
                            </>
                          ) : (
                            <>
                              {filledCount} / {activeMonths.length} months with data
                              {calculatedCount > 0 && ` • ${calculatedCount} calculated`}
                            </>
                          )}
                          {' • '}
                          {formatNumber(getEmployeeTotalEmissions(employee))} tCO2e
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveEmployee(employee.id);
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      data-testid={`remove-employee-${empIndex}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </AccordionTrigger>
                
                <AccordionContent className="px-4 pb-4">
                  {/* Validation Errors */}
                  {validationErrors[employee.id] && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                      {validationErrors[employee.id].map((error, idx) => (
                        <p key={idx} className="text-sm text-red-600 flex items-center gap-1">
                          <span className="text-red-500">•</span> {error}
                        </p>
                      ))}
                    </div>
                  )}
                  
                  {/* Employee Info Section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label className="text-sm text-gray-600">
                        {entityLabel} Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={employee.name || ''}
                        onChange={(e) => handleEmployeeInfoChange(employee.id, 'name', e.target.value)}
                        placeholder={`Enter ${entityLabel.toLowerCase()} name`}
                        disabled={disabled}
                        className={`mt-1 ${validationErrors[employee.id]?.some(e => e.includes('Name')) ? 'border-red-300 focus:ring-red-500' : ''}`}
                        data-testid={`employee-name-${empIndex}`}
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-gray-600">{entityLabel} ID (Optional)</Label>
                      <Input
                        value={employee.employee_id || ''}
                        onChange={(e) => handleEmployeeInfoChange(employee.id, 'employee_id', e.target.value)}
                        placeholder="E.g., EMP001"
                        disabled={disabled}
                        className="mt-1"
                        data-testid={`employee-id-${empIndex}`}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-gray-600">Department (Optional)</Label>
                      <Input
                        value={employee.department || ''}
                        onChange={(e) => handleEmployeeInfoChange(employee.id, 'department', e.target.value)}
                        placeholder="E.g., Engineering"
                        disabled={disabled}
                        className="mt-1"
                        data-testid={`employee-department-${empIndex}`}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-gray-600">From Location</Label>
                      <Input
                        value={employee.from_location || ''}
                        onChange={(e) => handleEmployeeInfoChange(employee.id, 'from_location', e.target.value)}
                        placeholder="E.g., Home, City A"
                        disabled={disabled}
                        className="mt-1"
                        data-testid={`employee-from-location-${empIndex}`}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-gray-600">To Location</Label>
                      <Input
                        value={employee.to_location || ''}
                        onChange={(e) => handleEmployeeInfoChange(employee.id, 'to_location', e.target.value)}
                        placeholder="E.g., Office, City B"
                        disabled={disabled}
                        className="mt-1"
                        data-testid={`employee-to-location-${empIndex}`}
                      />
                    </div>
                  </div>

                  {/* Monthly Data Grid OR Yearly Data Entry - Based on form-level frequencyType */}
                  {isYearlyMode ? (
                    /* YEARLY MODE: Single annual data entry */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-700">
                          Annual Data for {getYearDisplay()}
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCalculateYearly(employee.id)}
                          disabled={disabled || isCalculating}
                          className="text-xs"
                        >
                          <Calculator className="h-3 w-3 mr-1" />
                          Calculate
                        </Button>
                      </div>
                      
                      <Card className={`p-4 ${employee.yearly_data?.emissions?.co2e ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}`}>
                        {/* Input fields for yearly data */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          {getFieldsForActivityType().map((field) => {
                            // Check if this is supplier-basis and needs free-text unit
                            // Be consistent with monthly mode - only show unit input for supplier variables
                            const isSupplierBasis = calculationMethod === 'supplier_basis';
                            const needsUnitInput = isSupplierBasis && field.variable?.includes('supplier');
                            // Get stored unit for supplier-basis
                            const storedUnit = employee.yearly_data?.inputs?.[`${field.variable}_unit`] || '';
                            // Unitless count fields - should never show unit
                            const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days'].includes(field.variable);
                            
                            return (
                            <div key={field.variable} className="space-y-1">
                              <Label className="text-xs text-gray-600">
                                {field.label} (Annual Total)
                                {field.required && <span className="text-red-500"> *</span>}
                                {field.unit && !needsUnitInput && !isUnitlessCountField && (
                                  <span className="ml-1 text-gray-400">({field.unit})</span>
                                )}
                                {needsUnitInput && storedUnit && (
                                  <span className="ml-1 text-gray-400">({storedUnit})</span>
                                )}
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  max={field.variable === 'working_hour_per_day' ? 24 : (field.variable === 'qty_days_travelled' ? (((parseInt(reportingYear) || new Date().getFullYear()) % 4 === 0 && (parseInt(reportingYear) || new Date().getFullYear()) % 100 !== 0) || ((parseInt(reportingYear) || new Date().getFullYear()) % 400 === 0) ? 366 : 365) : undefined)}
                                  value={employee.yearly_data?.inputs?.[field.variable] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || parseFloat(val) >= 0) {
                                      handleYearlyInputChange(employee.id, field.variable, val);
                                    }
                                  }}
                                  placeholder={field.variable === 'working_hour_per_day' ? 'Max 24 hours' : (field.variable === 'qty_days_travelled' ? 'Max 365 days' : `Enter annual ${field.label.toLowerCase()}`)}
                                  disabled={disabled}
                                  className="flex-1"
                                />
                                {needsUnitInput && (
                                  <Input
                                    type="text"
                                    value={storedUnit}
                                    onChange={(e) => handleYearlyInputChange(
                                      employee.id, 
                                      `${field.variable}_unit`, 
                                      e.target.value
                                    )}
                                    placeholder="Unit"
                                    disabled={disabled}
                                    className="w-1/3"
                                  />
                                )}
                              </div>
                            </div>
                          )})}
                        </div>
                        
                        {/* DEBUG: Log yearly emissions check */}
                        {console.log('[MultiEmployeeInput DEBUG] Yearly emissions check for employee:', employee.id, {
                          'yearly_data': employee.yearly_data,
                          'emissions': employee.yearly_data?.emissions,
                          'co2e': employee.yearly_data?.emissions?.co2e,
                          'check_result': employee.yearly_data?.emissions?.co2e !== null && employee.yearly_data?.emissions?.co2e !== undefined
                        })}
                        
                        {/* Yearly emissions result */}
                        {employee.yearly_data?.emissions?.co2e !== null && employee.yearly_data?.emissions?.co2e !== undefined && (
                          <div className="pt-3 border-t border-emerald-200">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Annual Emissions:</span>
                              <span className="text-lg font-bold text-emerald-700">
                                {formatNumber(employee.yearly_data.emissions.co2e)} tCO<sub>2</sub>e
                              </span>
                            </div>
                            
                            {/* Calculation details for yearly - same detailed view as monthly */}
                            {employee.yearly_data?.calculation_details && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="text-xs text-gray-500 mb-2">Calculation Details</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {/* Formula Name - hidden for C7 */}
                                  
                                  {/* Input values */}
                                  {Object.entries(employee.yearly_data?.inputs || {})
                                    .filter(([k, v]) => v !== '' && v !== null && !k.includes('_unit'))
                                    .map(([k, v]) => {
                                      const field = getFieldsForActivityType().find(f => f.variable === k);
                                      const label = field?.label || k;
                                      const unitKey = `${k}_unit`;
                                      const unit = employee.yearly_data?.inputs?.[unitKey] || field?.unit || '';
                                      return (
                                        <div key={k} className="px-2 py-1 bg-blue-50 border-l-2 border-blue-300 rounded-r">
                                          <span className="text-gray-600 text-sm">Input: </span>
                                          <span className="text-blue-600 font-medium text-sm">{label}</span>
                                          <span className="text-gray-800 text-sm"> = {v}</span>
                                          {unit && <span className="text-gray-500 text-sm ml-1">{unit}</span>}
                                        </div>
                                      );
                                    })}
                                  
                                  {/* Applied factors from calculation (emission factors, etc.) */}
                                  {employee.yearly_data.calculation_details?.applied_factors && 
                                    Object.entries(employee.yearly_data.calculation_details.applied_factors).map(([key, factor]) => (
                                      <div key={key} className="px-2 py-1 bg-amber-50 border-l-2 border-amber-300 rounded-r">
                                        <span className="text-amber-700 font-medium text-sm">{factor.label || key}: </span>
                                        <span className="text-gray-800 text-sm">{typeof factor.value === 'number' ? factor.value.toFixed(6) : factor.value}</span>
                                        {factor.unit && <span className="text-gray-500 text-sm ml-1">{factor.unit}</span>}
                                      </div>
                                    ))
                                  }
                                  
                                  {/* Formula step from audit log - shows the calculation expression */}
                                  {employee.yearly_data.calculation_details?.audit_log?.filter(step => step.step === 'formula_step').map((step, idx) => (
                                    <div key={idx} className="col-span-1 md:col-span-2 lg:col-span-2 px-2 py-1.5 bg-cyan-50 border-l-2 border-cyan-400 rounded-r">
                                      <div className="text-xs text-cyan-600 mb-0.5">Calculation:</div>
                                      <div className="text-cyan-700 font-medium text-sm">{step.expression_readable || step.expression}</div>
                                      <div className="text-cyan-600 text-sm">= {typeof step.output === 'number' ? step.output.toFixed(6) : step.output}</div>
                                    </div>
                                  ))}
                                  
                                  {/* Final outputs */}
                                  <div className="px-2 py-1.5 bg-emerald-100 border-l-2 border-emerald-400 rounded-r">
                                    <div className="text-emerald-700 font-semibold text-sm">Output:</div>
                                    <div className="text-emerald-600 font-medium text-sm">
                                      CO₂e: {formatNumber(employee.yearly_data.emissions?.co2e || 0, 6)} tCO₂e
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    </div>
                  ) : (
                    /* MONTHLY MODE: Ledger table format for cleaner view */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-700">Monthly Data</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCalculateAllMonths(employee.id)}
                          disabled={disabled || isCalculating}
                          className="text-xs"
                        >
                          <Calculator className="h-3 w-3 mr-1" />
                          Calculate All
                        </Button>
                      </div>
                      
                      {/* Ledger Table */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              {/* Hide Month column in edit mode - already shown in dialog header */}
                              {!isEditMode && (
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 w-36">Month</th>
                              )}
                              {getFieldsForActivityType().map((field) => {
                                const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days'].includes(field.variable);
                                return (
                                  <th key={field.variable} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                                    {field.unit && !isUnitlessCountField && (
                                      <span className="font-normal text-gray-400 ml-1">({field.unit})</span>
                                    )}
                                  </th>
                                );
                              })}
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-28">Emissions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {activeMonths.map((monthKey, rowIndex) => {
                              const monthInfo = MONTHS.find(m => m.key === monthKey);
                              const monthData = employee.monthly_data?.[monthKey] || { inputs: {}, emissions: null };
                              const currentFields = getFieldsForActivityType();
                              const hasData = monthHasInputData(monthData);
                              const hasEmissions = monthData.emissions?.co2e !== null && monthData.emissions?.co2e !== undefined;
                              
                              // Check if this month is in the future
                              const isMonthInFuture = isFutureMonth ? isFutureMonth(monthKey) : false;
                              
                              // Get month label with year for financial year
                              const getMonthLabel = () => {
                                const monthIndex = MONTHS.findIndex(m => m.key === monthKey);
                                const year = parseInt(reportingYear);
                                if (reportingYearType === 'financial') {
                                  // For FY: Jan-Mar belong to next calendar year
                                  if (monthIndex >= 0 && monthIndex <= 2) {
                                    return `${monthInfo?.label} - ${year + 1}`;
                                  }
                                  return `${monthInfo?.label} - ${year}`;
                                }
                                return `${monthInfo?.label} - ${year}`;
                              };
                              
                              return (
                                <tr 
                                  key={monthKey} 
                                  onClick={() => {
                                    if (!isMonthInFuture && hasEmissions) {
                                      const detailKey = `${employee.id}-${monthKey}`;
                                      setSelectedMonthForDetails(selectedMonthForDetails === detailKey ? null : detailKey);
                                    }
                                  }}
                                  className={`${isMonthInFuture ? 'bg-gray-50 opacity-60' : rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${hasEmissions ? 'bg-emerald-50/30' : ''} ${selectedMonthForDetails === `${employee.id}-${monthKey}` ? 'ring-2 ring-emerald-400 ring-inset' : ''} ${!isMonthInFuture && hasEmissions ? 'cursor-pointer hover:bg-emerald-50/50' : ''}`}
                                >
                                  {/* Month Column - Hide in edit mode */}
                                  {!isEditMode && (
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <span className="text-sm font-medium text-gray-700">{getMonthLabel()}</span>
                                      {isMonthInFuture && (
                                        <span className="ml-1 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Future</span>
                                      )}
                                    </td>
                                  )}
                                  
                                  {/* Input Columns */}
                                  {currentFields.map((field) => {
                                    const isSupplierBasis = calculationMethod === 'supplier_basis';
                                    const needsUnitInput = isSupplierBasis && field.variable?.includes('supplier');
                                    const storedUnit = monthData.inputs?.[`${field.variable}_unit`] || '';
                                    const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days'].includes(field.variable);
                                    
                                    return (
                                      <td key={field.variable} className="px-3 py-1.5">
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            min="0"
                                            max={(field.variable === 'working_days' || field.variable === 'qty_days_travelled') ? getDaysInMonth(monthKey, reportingYear) : (field.variable === 'working_hour_per_day' ? 24 : undefined)}
                                            step="any"
                                            value={monthData.inputs?.[field.variable] ?? ''}
                                            onChange={(e) => handleMonthlyInputChange(
                                              employee.id, 
                                              monthKey, 
                                              field.variable, 
                                              e.target.value ? Math.max(0, parseFloat(e.target.value)) : ''
                                            )}
                                            placeholder={(field.variable === 'working_days' || field.variable === 'qty_days_travelled') ? `≤${getDaysInMonth(monthKey, reportingYear)}` : '—'}
                                            disabled={disabled || isMonthInFuture}
                                            className={`h-8 text-sm ${needsUnitInput ? 'w-20' : 'w-24'}`}
                                            data-testid={`employee-${empIndex}-${monthKey}-${field.variable}`}
                                          />
                                          {needsUnitInput && (
                                            <Input
                                              type="text"
                                              value={storedUnit}
                                              onChange={(e) => handleMonthlyInputChange(
                                                employee.id, 
                                                monthKey, 
                                                `${field.variable}_unit`, 
                                                e.target.value
                                              )}
                                              placeholder="unit"
                                              disabled={disabled || isMonthInFuture}
                                              className="h-8 text-sm w-16"
                                              data-testid={`employee-${empIndex}-${monthKey}-${field.variable}-unit`}
                                            />
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  
                                  {/* Emissions Column */}
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {isMonthInFuture ? (
                                      <span className="text-xs text-gray-400">—</span>
                                    ) : hasEmissions ? (
                                      <span className="text-sm font-semibold text-emerald-600">
                                        {formatNumber(monthData.emissions.co2e)} tCO₂e
                                      </span>
                                    ) : hasData ? (
                                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                        Pending
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Calculation Details Section - Shows when a month row is selected */}
                      {isEditMode && selectedMonthForDetails?.startsWith(`${employee.id}-`) && (() => {
                        const selectedMonthKey = selectedMonthForDetails.split('-').slice(1).join('-');
                        const monthData = employee.monthly_data?.[selectedMonthKey];
                        const currentFields = getFieldsForActivityType();
                        
                        if (!monthData?.emissions) return null;
                        
                        return (
                          <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-sm font-semibold text-slate-700">
                                Calculation Details
                              </div>
                              <button 
                                type="button"
                                onClick={() => setSelectedMonthForDetails(null)}
                                className="text-xs text-slate-500 hover:text-slate-700"
                              >
                                Close
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {/* Input values */}
                              {Object.entries(monthData.inputs || {})
                                .filter(([k, v]) => v !== '' && v !== null && !k.includes('_unit'))
                                .map(([k, v]) => {
                                  const field = currentFields.find(f => f.variable === k);
                                  const label = field?.label || k;
                                  const unitKey = `${k}_unit`;
                                  const unit = monthData.inputs?.[unitKey] || field?.unit || '';
                                  return (
                                    <div key={k} className="px-2 py-1 bg-blue-50 border-l-2 border-blue-300 rounded-r">
                                      <span className="text-gray-600 text-sm">Input: </span>
                                      <span className="text-blue-600 font-medium text-sm">{label}</span>
                                      <span className="text-gray-800 text-sm"> = {v}</span>
                                      {unit && <span className="text-gray-500 text-sm ml-1">{unit}</span>}
                                    </div>
                                  );
                                })}
                              
                              {/* Applied factors from calculation (emission factors, etc.) */}
                              {monthData.calculation_details?.applied_factors && 
                                Object.entries(monthData.calculation_details.applied_factors).map(([key, factor]) => (
                                  <div key={key} className="px-2 py-1 bg-amber-50 border-l-2 border-amber-300 rounded-r">
                                    <span className="text-amber-700 font-medium text-sm">{factor.label || key}: </span>
                                    <span className="text-gray-800 text-sm">{typeof factor.value === 'number' ? factor.value.toFixed(6) : factor.value}</span>
                                    {factor.unit && <span className="text-gray-500 text-sm ml-1">{factor.unit}</span>}
                                  </div>
                                ))
                              }
                              
                              {/* Formula step from audit log - shows the calculation expression */}
                              {monthData.calculation_details?.audit_log?.filter(step => step.step === 'formula_step').map((step, idx) => (
                                <div key={idx} className="col-span-1 md:col-span-2 lg:col-span-2 px-2 py-1.5 bg-cyan-50 border-l-2 border-cyan-400 rounded-r">
                                  <div className="text-xs text-cyan-600 mb-0.5">Calculation:</div>
                                  <div className="text-cyan-700 font-medium text-sm">{step.expression_readable || step.expression}</div>
                                  <div className="text-cyan-600 text-sm">= {typeof step.output === 'number' ? step.output.toFixed(6) : step.output}</div>
                                </div>
                              ))}
                              
                              {/* Final outputs */}
                              <div className="px-2 py-1.5 bg-emerald-100 border-l-2 border-emerald-400 rounded-r">
                                <div className="text-emerald-700 font-semibold text-sm">Output:</div>
                                <div className="text-emerald-600 font-medium text-sm">
                                  CO₂e: {formatNumber(monthData.emissions?.co2e || 0, 6)} tCO₂e
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}


                  {/* Employee Summary */}
                  <div className="mt-4 p-3 bg-emerald-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{entityLabel} Total Emissions:</span>
                      <span className="text-lg font-bold text-emerald-700">
                        {formatNumber(getEmployeeTotalEmissions(employee))} tCO2e
                      </span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Aggregated Monthly Totals Table with Year Label (#4) - Hide in edit mode and yearly mode */}
      {employees.length > 0 && Object.keys(monthlyTotals).length > 0 && !isEditMode && !isYearlyMode && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">
              Aggregated Monthly Totals
              {reportingYear && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({getYearDisplay()})
                </span>
              )}
            </h4>
            <span className="text-sm font-semibold text-emerald-700">
              Total: {formatNumber(yearlyTotal?.co2e || 0)} tCO2e
            </span>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {MONTHS.filter(m => activeMonths.includes(m.key)).map((month) => (
              <div key={month.key} className="text-center p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">{month.label.substring(0, 3)}</p>
                <p className="text-sm font-semibold text-emerald-700">
                  {formatNumber(monthlyTotals[month.key]?.co2e || 0, 2)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// Export validation function for use by parent components
MultiEmployeeInput.validateEmployees = (employees, isYearly = false) => {
  const errors = {};
  let isValid = true;
  
  employees.forEach((employee) => {
    const empErrors = [];
    
    // Check employee name is required and not empty/whitespace
    if (!employee.name || employee.name.trim() === '') {
      empErrors.push('Employee Name is required.');
      isValid = false;
    }
    
    if (isYearly) {
      // For yearly mode: check yearly_data has data OR direct inputs
      const hasYearlyData = Object.values(employee.yearly_data?.inputs || {}).some(v => 
        v !== '' && v !== null && v !== undefined && v !== 0
      );
      const hasDirectInputs = employee.inputs && Object.values(employee.inputs).some(v =>
        v !== '' && v !== null && v !== undefined && v !== 0
      );
      
      if (!hasYearlyData && !hasDirectInputs) {
        empErrors.push('Please enter annual data or remove the employee entry.');
        isValid = false;
      }
    } else {
      // For monthly mode: check at least one month has data
      const hasAnyMonthData = Object.values(employee.monthly_data || {}).some(monthData => {
        if (!monthData?.inputs) return false;
        return Object.values(monthData.inputs).some(v => 
          v !== '' && v !== null && v !== undefined && v !== 0
        );
      });
      
      // Also check direct inputs/emissions (for new monthly model)
      const hasDirectData = employee.inputs && Object.values(employee.inputs).some(v =>
        v !== '' && v !== null && v !== undefined && v !== 0
      );
      
      if (!hasAnyMonthData && !hasDirectData) {
        empErrors.push('Please enter data for at least one month or remove the employee entry.');
        isValid = false;
      }
    }
    
    if (empErrors.length > 0) {
      errors[employee.id] = empErrors;
    }
  });
  
  return { isValid, errors };
};

export default MultiEmployeeInput;
