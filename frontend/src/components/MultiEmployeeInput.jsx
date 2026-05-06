import React, { useState, useCallback } from 'react';
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
  { key: 'jan', label: 'January' },
  { key: 'feb', label: 'February' },
  { key: 'mar', label: 'March' },
  { key: 'apr', label: 'April' },
  { key: 'may', label: 'May' },
  { key: 'jun', label: 'June' },
  { key: 'jul', label: 'July' },
  { key: 'aug', label: 'August' },
  { key: 'sep', label: 'September' },
  { key: 'oct', label: 'October' },
  { key: 'nov', label: 'November' },
  { key: 'dec', label: 'December' },
];

const MultiEmployeeInput = ({
  entityLabel = 'Employee',
  fields = [],
  selectedActivityType = '',
  employees = [],
  onEmployeesChange,
  activeMonths = [],
  onCalculateEmployee,
  monthlyTotals = {},
  yearlyTotal = {},
  isCalculating = false,
  disabled = false,
}) => {
  const [expandedAccordions, setExpandedAccordions] = useState([]);

  // Generate unique ID for new employee
  const generateEmployeeId = useCallback(() => {
    return `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add new employee
  const handleAddEmployee = useCallback(() => {
    const newEmployee = {
      id: generateEmployeeId(),
      name: '',
      employee_id: '',
      department: '',
      activity_type: selectedActivityType, // Use activity type from step 1
      monthly_data: {},
    };
    
    // Initialize monthly data for active months
    activeMonths.forEach(monthKey => {
      newEmployee.monthly_data[monthKey] = {
        inputs: {},
        emissions: null,
      };
    });
    
    const updatedEmployees = [...employees, newEmployee];
    onEmployeesChange(updatedEmployees);
    
    // Expand the new employee accordion
    setExpandedAccordions(prev => [...prev, newEmployee.id]);
  }, [employees, onEmployeesChange, generateEmployeeId, activeMonths, selectedActivityType]);

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
    const updatedEmployees = employees.map(emp => {
      if (emp.id === employeeId) {
        const monthData = emp.monthly_data?.[monthKey] || { inputs: {}, emissions: null };
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
              // Clear emissions when input changes (needs recalculation)
              emissions: null,
            },
          },
        };
      }
      return emp;
    });
    onEmployeesChange(updatedEmployees);
  }, [employees, onEmployeesChange]);

  // Calculate emissions for a specific employee and month
  const handleCalculateMonth = useCallback(async (employeeId, monthKey) => {
    if (onCalculateEmployee) {
      const employee = employees.find(emp => emp.id === employeeId);
      if (employee) {
        await onCalculateEmployee(employeeId, monthKey, employee);
      }
    }
  }, [employees, onCalculateEmployee]);

  // Calculate all months for an employee
  const handleCalculateAllMonths = useCallback(async (employeeId) => {
    const employee = employees.find(emp => emp.id === employeeId);
    if (employee && onCalculateEmployee) {
      for (const monthKey of activeMonths) {
        const monthData = employee.monthly_data?.[monthKey];
        // Check if any input has a value
        const hasInputData = monthData?.inputs && Object.values(monthData.inputs).some(v => v !== '' && v !== null && v !== undefined);
        if (hasInputData) {
          await onCalculateEmployee(employeeId, monthKey, employee);
        }
      }
    }
  }, [employees, activeMonths, onCalculateEmployee]);

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
    if (!employee?.monthly_data) return 0;
    return Object.values(employee.monthly_data).reduce((sum, m) => {
      return sum + (m?.emissions?.co2e || 0);
    }, 0);
  }, []);

  // Format number for display
  const formatNumber = (num, decimals = 4) => {
    if (num === null || num === undefined) return '-';
    return Number(num).toFixed(decimals);
  };

  // Check if a month has input data
  const monthHasInputData = useCallback((monthData) => {
    if (!monthData?.inputs) return false;
    return Object.values(monthData.inputs).some(v => v !== '' && v !== null && v !== undefined);
  }, []);

  return (
    <div className="space-y-4" data-testid="multi-employee-input">
      {/* Header with Add Employee Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-gray-800">
            {entityLabel}s ({employees.length})
          </h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddEmployee}
          disabled={disabled}
          className="flex items-center gap-2"
          data-testid="add-employee-btn"
        >
          <Plus className="h-4 w-4" />
          Add {entityLabel}
        </Button>
      </div>

      {/* Summary Stats */}
      {employees.length > 0 && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Total {entityLabel}s</p>
              <p className="text-xl font-bold text-emerald-700">{employees.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg Monthly</p>
              <p className="text-xl font-bold text-emerald-700">
                {formatNumber(Object.values(monthlyTotals).reduce((sum, m) => sum + (m?.co2e || 0), 0) / Math.max(Object.keys(monthlyTotals).length, 1))} tCO2e
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Yearly Total</p>
              <p className="text-xl font-bold text-emerald-700">
                {formatNumber(yearlyTotal?.co2e || 0)} tCO2e
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Employee List */}
      {employees.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2 border-gray-300">
          <User className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 mb-4">No {entityLabel.toLowerCase()}s added yet</p>
          <Button
            type="button"
            variant="default"
            onClick={handleAddEmployee}
            disabled={disabled}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First {entityLabel}
          </Button>
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
                          {filledCount} / {activeMonths.length} months with data
                          {calculatedCount > 0 && ` • ${calculatedCount} calculated`}
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
                  {/* Employee Info Section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label className="text-sm text-gray-600">{entityLabel} Name</Label>
                      <Input
                        value={employee.name || ''}
                        onChange={(e) => handleEmployeeInfoChange(employee.id, 'name', e.target.value)}
                        placeholder={`Enter ${entityLabel.toLowerCase()} name`}
                        disabled={disabled}
                        className="mt-1"
                        data-testid={`employee-name-${empIndex}`}
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
                  </div>

                  {/* Monthly Data Grid */}
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeMonths.map((monthKey) => {
                        const monthInfo = MONTHS.find(m => m.key === monthKey);
                        const monthData = employee.monthly_data?.[monthKey] || { inputs: {}, emissions: null };
                        const currentFields = getFieldsForActivityType();
                        const hasData = monthHasInputData(monthData);
                        const hasEmissions = monthData.emissions?.co2e !== null && monthData.emissions?.co2e !== undefined;
                        
                        return (
                          <Card 
                            key={monthKey} 
                            className={`p-3 ${hasEmissions ? 'border-emerald-300 bg-emerald-50/50' : hasData ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">{monthInfo?.label}</span>
                              {hasEmissions && (
                                <span className="text-xs font-semibold text-emerald-600">
                                  {formatNumber(monthData.emissions.co2e)} tCO2e
                                </span>
                              )}
                              {hasData && !hasEmissions && (
                                <span className="text-xs text-amber-600">
                                  Needs calculation
                                </span>
                              )}
                            </div>
                            
                            <div className="space-y-2">
                              {currentFields.map((field) => (
                                <div key={field.variable}>
                                  <Label className="text-xs text-gray-500">
                                    {field.label}
                                    {field.unit && <span className="ml-1 text-gray-400">({field.unit})</span>}
                                  </Label>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Input
                                      type="number"
                                      value={monthData.inputs?.[field.variable] ?? ''}
                                      onChange={(e) => handleMonthlyInputChange(
                                        employee.id, 
                                        monthKey, 
                                        field.variable, 
                                        e.target.value ? parseFloat(e.target.value) : ''
                                      )}
                                      placeholder={`Enter value`}
                                      disabled={disabled}
                                      className="h-8 text-sm flex-1"
                                      data-testid={`employee-${empIndex}-${monthKey}-${field.variable}`}
                                    />
                                    {field.unit && (
                                      <span className="text-xs text-gray-500 min-w-[40px]">{field.unit}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCalculateMonth(employee.id, monthKey)}
                              disabled={disabled || isCalculating || !hasData}
                              className="w-full mt-2 text-xs h-7"
                            >
                              <Calculator className="h-3 w-3 mr-1" />
                              Calculate
                            </Button>
                          </Card>
                        );
                      })}
                    </div>
                  </div>

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

      {/* Aggregated Monthly Totals Table */}
      {employees.length > 0 && Object.keys(monthlyTotals).length > 0 && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Aggregated Monthly Totals</h4>
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

export default MultiEmployeeInput;
