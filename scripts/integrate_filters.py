#!/usr/bin/env python3
"""
Script to integrate extracted modules into Emissions.js
Phase 1: Replace filter section with EmissionFilters component
"""

def main():
    file_path = '/app/frontend/src/pages/Emissions.js'
    
    with open(file_path, 'r') as f:
        content = f.read()
        lines = content.split('\n')
    
    print(f"Original line count: {len(lines)}")
    
    # Find import section to add new imports
    import_line_idx = None
    for i, line in enumerate(lines):
        if "import { Tabs, TabsContent, TabsList, TabsTrigger }" in line:
            import_line_idx = i
            break
    
    if import_line_idx is None:
        print("ERROR: Could not find import location")
        return
    
    # Add EmissionFilters import after Tabs import
    lines.insert(import_line_idx + 1, "import EmissionFilters from './emissions/EmissionFilters';")
    print(f"Added EmissionFilters import at line {import_line_idx + 2}")
    
    # Re-join to search for filter section
    content = '\n'.join(lines)
    lines = content.split('\n')
    
    # Find filter section boundaries
    # Filter starts with {showFilters && (
    # Filter ends with </Card>\n      )}
    filter_start = None
    filter_end = None
    
    for i, line in enumerate(lines):
        if '{showFilters && (' in line and filter_start is None:
            # Check if this is the main filter section (not inside history dialog)
            # The main filter section comes after the header/buttons
            if i > 4500:  # Main filter is in the JSX return section
                filter_start = i
        if filter_start and '</Card>' in line:
            # Check if next line closes the showFilters conditional
            if i + 1 < len(lines) and ')}' in lines[i + 1].strip() and lines[i + 1].strip() == ')}':
                filter_end = i + 1
                break
    
    print(f"Filter section: lines {filter_start + 1} to {filter_end + 1}")
    
    if not filter_start or not filter_end:
        print("ERROR: Could not find filter section boundaries")
        return
    
    # Create replacement for filter section
    filter_replacement = '''      {showFilters && (
        <EmissionFilters
          filterFacility={filterFacility}
          setFilterFacility={setFilterFacility}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterFrequency={filterFrequency}
          setFilterFrequency={setFilterFrequency}
          filterDateRange={filterDateRange}
          setFilterDateRange={setFilterDateRange}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          facilities={facilities}
          uniqueCategories={uniqueCategories}
        />
      )}'''
    
    # Build new content
    new_lines = []
    new_lines.extend(lines[:filter_start])
    new_lines.extend(filter_replacement.split('\n'))
    new_lines.extend(lines[filter_end + 1:])
    
    new_content = '\n'.join(new_lines)
    
    print(f"New line count: {len(new_lines)}")
    print(f"Lines removed: {len(lines) - len(new_lines)}")
    
    with open(file_path, 'w') as f:
        f.write(new_content)
    
    print("Filter section replaced successfully!")

if __name__ == '__main__':
    main()
