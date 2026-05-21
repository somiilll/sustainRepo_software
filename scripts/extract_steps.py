#!/usr/bin/env python3
"""
Script to safely extract Step 1 and Step 3 JSX from EmissionEntryForm.js
and replace them with component calls.
"""

import re

def main():
    file_path = '/app/frontend/src/components/EmissionEntryForm.js'
    
    with open(file_path, 'r') as f:
        content = f.read()
        lines = content.split('\n')
    
    print(f"Original line count: {len(lines)}")
    
    # Step 1: Add Step3YearMonthlyData import (check if not already present)
    if 'Step3YearMonthlyData' not in content:
        # Find the line with Step4Notes import and add Step3 import
        for i, line in enumerate(lines):
            if "import { Step4Notes }" in line:
                # Add Step3 import before Step4
                lines.insert(i, "import { Step3YearMonthlyData } from '../modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData';")
                print(f"Added Step3YearMonthlyData import at line {i+1}")
                break
    else:
        print("Step3YearMonthlyData import already exists")
    
    # Re-join and find step markers with updated line numbers
    content = '\n'.join(lines)
    lines = content.split('\n')
    
    # Find Step 1 boundaries
    step1_start = None
    step1_end = None
    for i, line in enumerate(lines):
        if '{/* Step 1: Basic Selection */}' in line:
            step1_start = i
        if step1_start and '{/* Step 2: Process & Responsibility' in line:
            step1_end = i - 1  # Line before Step 2
            break
    
    print(f"Step 1: lines {step1_start+1} to {step1_end+1}")
    
    # Find Step 3 boundaries
    step3_start = None
    step3_end = None
    for i, line in enumerate(lines):
        if '{/* Step 3: Year & Monthly Data */}' in line:
            step3_start = i
        if step3_start and '{/* Step 4: Notes' in line:
            step3_end = i - 1  # Line before Step 4
            break
    
    print(f"Step 3: lines {step3_start+1} to {step3_end+1}")
    
    if not all([step1_start, step1_end, step3_start, step3_end]):
        print("ERROR: Could not find all step boundaries")
        return
    
    # Step 1 replacement JSX
    step1_replacement = '''      {/* Step 1: Basic Selection - Extracted to Step1BasicSelection component */}
      {currentStep === 1 && (
        <Step1BasicSelection
          facilityId={facilityId}
          setFacilityId={setFacilityId}
          facilities={facilities}
          scope={scope}
          setScope={setScope}
          dynamicScopes={dynamicScopes}
          hasScope3Access={hasScope3Access}
          setCategory={setCategory}
          setFuelId={setFuelId}
          setScope3Method={setScope3Method}
          setScope3ActivityType={setScope3ActivityType}
          setScope3ActivityId={setScope3ActivityId}
          setUseCustomFuel={setUseCustomFuel}
          setBiogenicScopeSelection={setBiogenicScopeSelection}
          setScope3Subcategory={setScope3Subcategory}
          setSelectedSubIndustry={setSelectedSubIndustry}
          setSelectedTemplate={setSelectedTemplate}
          setTemplateInputValues={setTemplateInputValues}
          biogenicScopeSelection={biogenicScopeSelection}
          loadingBiogenicCategories={loadingBiogenicCategories}
          category={category}
          categoriesForScope={categoriesForScope}
          scope3Method={scope3Method}
          availableScope3Methods={availableScope3Methods}
          getMethodLabel={getMethodLabel}
          scope3ActivityType={scope3ActivityType}
          availableScope3ActivityTypes={availableScope3ActivityTypes}
          requiresSubcategory={requiresSubcategory}
          availableSubcategories={availableSubcategories}
          scope3Subcategory={scope3Subcategory}
          scope3ActivityId={scope3ActivityId}
          filteredScope3Activities={filteredScope3Activities}
          useCustomActivity={useCustomActivity}
          setUseCustomActivity={setUseCustomActivity}
          scope3CustomActivity={scope3CustomActivity}
          setScope3CustomActivity={setScope3CustomActivity}
          fuelSearchTerm={fuelSearchTerm}
          setFuelSearchTerm={setFuelSearchTerm}
          loadingScope3EF={loadingScope3EF}
          fuelId={fuelId}
          useCustomFuel={useCustomFuel}
          customFuelName={customFuelName}
          setCustomFuelName={setCustomFuelName}
          customEmissionFactor={customEmissionFactor}
          setCustomEmissionFactor={setCustomEmissionFactor}
          customEmissionFactorUnit={customEmissionFactorUnit}
          setCustomEmissionFactorUnit={setCustomEmissionFactorUnit}
          customSource={customSource}
          setCustomSource={setCustomSource}
          selectedFuel={selectedFuel}
          filteredFuelsForCategory={filteredFuelsForCategory}
          getAvailableEFUnits={getAvailableEFUnits}
          getQuantityUnitFromEFUnit={getQuantityUnitFromEFUnit}
          isProcessEmissions={isProcessEmissions}
          selectedSubIndustry={selectedSubIndustry}
          availableSubIndustries={availableSubIndustries}
          selectedTemplate={selectedTemplate}
          templatesForSubIndustry={templatesForSubIndustry}
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          supplierCode={supplierCode}
          setSupplierCode={setSupplierCode}
          employeeName={employeeName}
          setEmployeeName={setEmployeeName}
          employeeId={employeeId}
          setEmployeeId={setEmployeeId}
        />
      )}'''
    
    # Step 3 replacement JSX
    step3_replacement = '''      {/* Step 3: Year & Monthly Data - Extracted to Step3YearMonthlyData component */}
      {currentStep === 3 && (
        <Step3YearMonthlyData
          reportingYearType={reportingYearType}
          setReportingYearType={setReportingYearType}
          hasOrgYearTypePreference={hasOrgYearTypePreference}
          reportingYear={reportingYear}
          setReportingYear={setReportingYear}
          frequencyType={frequencyType}
          setFrequencyType={setFrequencyType}
          editingEmission={editingEmission}
          setMonthlyData={setMonthlyData}
          setYearlyData={setYearlyData}
          setExpandedMonths={setExpandedMonths}
          activeMonths={activeMonths}
          monthlyData={monthlyData}
          expandedMonths={expandedMonths}
          yearlyData={yearlyData}
          dynamicInputFields={dynamicInputFields}
          formConfig={formConfig}
          loadingFormConfig={loadingFormConfig}
          getMonthStatus={getMonthStatus}
          filledMonthsCount={filledMonthsCount}
          updateMonthData={updateMonthData}
          getActualYearForMonth={getActualYearForMonth}
          isFutureMonth={isFutureMonth}
          getFieldUnitsForYearly={getFieldUnitsForYearly}
          renderDynamicField={renderDynamicField}
          isC7EmployeeCommuting={isC7EmployeeCommuting}
          scope3Method={scope3Method}
          scope3ActivityType={scope3ActivityType}
          scope3ActivityId={scope3ActivityId}
          employees={employees}
          setEmployees={setEmployees}
          employeeMonthlyTotals={employeeMonthlyTotals}
          employeeYearlyTotal={employeeYearlyTotal}
          isCalculatingEmployee={isCalculatingEmployee}
          handleCalculateEmployeeMonth={handleCalculateEmployeeMonth}
          filteredScope3Activities={filteredScope3Activities}
          useCustomActivity={useCustomActivity}
          scope3CustomActivity={scope3CustomActivity}
          isProcessEmissions={isProcessEmissions}
          selectedTemplate={selectedTemplate}
          scope={scope}
          biogenicScopeSelection={biogenicScopeSelection}
          useCustomFuel={useCustomFuel}
          selectedFuel={selectedFuel}
          centralizedUnits={centralizedUnits}
          defaultUnit={defaultUnit}
          allowedUnits={allowedUnits}
          customEmissionFactorUnit={customEmissionFactorUnit}
          getQuantityUnitFromEFUnit={getQuantityUnitFromEFUnit}
          handleEvidenceUpload={handleEvidenceUpload}
          removeEvidence={removeEvidence}
          BACKEND_URL={BACKEND_URL}
          category={category}
        />
      )}'''
    
    # Build new content: lines before Step1 + Step1 replacement + lines between Step1 and Step3 + Step3 replacement + lines after Step3
    new_lines = []
    
    # Lines before Step 1
    new_lines.extend(lines[:step1_start])
    
    # Step 1 replacement
    new_lines.extend(step1_replacement.split('\n'))
    
    # Empty line
    new_lines.append('')
    
    # Lines between Step 1 and Step 3 (Step 2 component call)
    # This is from step1_end+1 to step3_start-1
    new_lines.extend(lines[step1_end+1:step3_start])
    
    # Step 3 replacement
    new_lines.extend(step3_replacement.split('\n'))
    
    # Empty line
    new_lines.append('')
    
    # Lines after Step 3
    new_lines.extend(lines[step3_end+1:])
    
    new_content = '\n'.join(new_lines)
    
    print(f"New line count: {len(new_lines)}")
    print(f"Lines removed: {len(lines) - len(new_lines)}")
    
    # Write back
    with open(file_path, 'w') as f:
        f.write(new_content)
    
    print("File updated successfully!")

if __name__ == '__main__':
    main()
