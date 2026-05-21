#!/usr/bin/env python3
"""
Script to integrate EditFormSections into Emissions.js
This replaces multiple sections of the edit form with component calls.
"""

def main():
    file_path = '/app/frontend/src/pages/Emissions.js'
    
    with open(file_path, 'r') as f:
        content = f.read()
        lines = content.split('\n')
    
    print(f"Original line count: {len(lines)}")
    
    # Step 1: Add import for EditFormSections
    import_added = False
    for i, line in enumerate(lines):
        if "import EmissionFilters from './emissions/EmissionFilters';" in line:
            lines.insert(i + 1, "import { FacilityScopeSection, BiogenicScopeSection, CategorySection, Scope3MethodSection, ResponsiblePersonSection, ProcessNamesSection, NotesSection, SubmitButtonSection } from './emissions/EditFormSections';")
            import_added = True
            print(f"Added EditFormSections import at line {i + 2}")
            break
    
    if not import_added:
        print("ERROR: Could not find import location")
        return
    
    # Re-join and work with content
    content = '\n'.join(lines)
    
    # Step 2: Replace the Facility and Scope Selection section
    # Find the section that starts with {/* Facility and Scope Selection */}
    # and ends before {/* Biogenic Scope Selection
    
    facility_scope_start = None
    facility_scope_end = None
    
    lines = content.split('\n')
    
    for i, line in enumerate(lines):
        if '{/* Facility and Scope Selection */}' in line and i > 4650:
            facility_scope_start = i
        if facility_scope_start and '{/* Biogenic Scope Selection' in line:
            facility_scope_end = i
            break
    
    if facility_scope_start and facility_scope_end:
        print(f"Facility/Scope section: lines {facility_scope_start + 1} to {facility_scope_end}")
        
        # Create replacement
        replacement = '''                {/* Facility and Scope Selection - Extracted Component */}
                <FacilityScopeSection
                  formData={formData}
                  setFormData={setFormData}
                  facilities={facilities}
                  dynamicScopes={dynamicScopes}
                  hasScope3Access={hasScope3Access}
                  handleFuelSelect={handleFuelSelect}
                  setBiogenicScopeSelection={setBiogenicScopeSelection}
                  markFormDirty={markFormDirty}
                />
                '''
        
        # Build new content
        new_lines = lines[:facility_scope_start]
        new_lines.extend(replacement.split('\n'))
        new_lines.extend(lines[facility_scope_end:])
        lines = new_lines
        
        print(f"Replaced Facility/Scope section. New line count: {len(lines)}")
    
    # Step 3: Replace Biogenic Scope Selection section
    content = '\n'.join(lines)
    lines = content.split('\n')
    
    biogenic_start = None
    biogenic_end = None
    
    for i, line in enumerate(lines):
        if "{/* Biogenic Scope Selection - Show when biogenic is selected */}" in line:
            biogenic_start = i
        if biogenic_start and i > biogenic_start and ")})})" in line.strip():
            # This is complex - need to find the right closing
            pass
    
    # Find biogenic section more carefully
    for i, line in enumerate(lines):
        if "{formData.scope === 'biogenic' && (" in line and biogenic_start is None:
            # Check if it's the biogenic selection (not something else)
            if i > 4650 and i < 4850:
                biogenic_start = i
        if biogenic_start and '{/* Reporting Period' in line:
            biogenic_end = i
            break
    
    if biogenic_start and biogenic_end:
        print(f"Biogenic section: lines {biogenic_start + 1} to {biogenic_end}")
        
        # Create replacement
        replacement = '''                {/* Biogenic Scope Selection - Extracted Component */}
                <BiogenicScopeSection
                  formData={formData}
                  setFormData={setFormData}
                  biogenicScopeSelection={biogenicScopeSelection}
                  setBiogenicScopeSelection={setBiogenicScopeSelection}
                  hasScope3Access={hasScope3Access}
                  handleFuelSelect={handleFuelSelect}
                  loadingBiogenicCategories={loadingBiogenicCategories}
                />

                '''
        
        new_lines = lines[:biogenic_start]
        new_lines.extend(replacement.split('\n'))
        new_lines.extend(lines[biogenic_end:])
        lines = new_lines
        
        print(f"Replaced Biogenic section. New line count: {len(lines)}")
    
    # Write back
    final_content = '\n'.join(lines)
    
    with open(file_path, 'w') as f:
        f.write(final_content)
    
    print(f"\nFinal line count: {len(lines)}")
    print("Integration complete!")

if __name__ == '__main__':
    main()
