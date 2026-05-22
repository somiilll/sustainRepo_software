#!/usr/bin/env python3
"""
Script to replace Notes and Submit button sections with extracted components
"""

def main():
    file_path = '/app/frontend/src/pages/Emissions.js'
    
    with open(file_path, 'r') as f:
        content = f.read()
        lines = content.split('\n')
    
    print(f"Original line count: {len(lines)}")
    
    # Find Notes section
    notes_start = None
    notes_end = None
    
    for i, line in enumerate(lines):
        if '{/* Notes */}' in line and i > 6000:
            notes_start = i
        if notes_start and '</textarea>' in line and notes_end is None:
            # Find the closing div
            for j in range(i, min(i + 5, len(lines))):
                if '</div>' in lines[j]:
                    notes_end = j
                    break
            break
    
    if notes_start and notes_end:
        print(f"Notes section: lines {notes_start + 1} to {notes_end + 1}")
        
        replacement = '''                {/* Notes - Extracted Component */}
                <NotesSection
                  formData={formData}
                  setFormData={(newData) => { setFormData(newData); markFormDirty(); }}
                />'''
        
        new_lines = lines[:notes_start]
        new_lines.extend(replacement.split('\n'))
        new_lines.extend(lines[notes_end + 1:])
        lines = new_lines
        
        print(f"Replaced Notes section. New line count: {len(lines)}")
    
    # Find Submit button section
    content = '\n'.join(lines)
    lines = content.split('\n')
    
    submit_start = None
    submit_end = None
    
    for i, line in enumerate(lines):
        if '<div className="flex justify-end gap-3 pt-4">' in line and i > 6000:
            submit_start = i
        if submit_start and '</Button>' in line and 'Update' in lines[i-1] or (submit_start and 'Add\' Emission' in line):
            # Find the closing div
            for j in range(i, min(i + 5, len(lines))):
                if '</div>' in lines[j] and lines[j].strip() == '</div>':
                    submit_end = j
                    break
            break
    
    if submit_start and submit_end:
        print(f"Submit section: lines {submit_start + 1} to {submit_end + 1}")
        
        replacement = '''                {/* Submit Buttons - Extracted Component */}
                <SubmitButtonSection
                  editingEmission={editingEmission}
                  isSaving={isSaving}
                  isCalculating={isCalculating}
                  handleDialogChange={handleDialogChange}
                />'''
        
        new_lines = lines[:submit_start]
        new_lines.extend(replacement.split('\n'))
        new_lines.extend(lines[submit_end + 1:])
        lines = new_lines
        
        print(f"Replaced Submit section. New line count: {len(lines)}")
    
    final_content = '\n'.join(lines)
    
    with open(file_path, 'w') as f:
        f.write(final_content)
    
    print(f"\nFinal line count: {len(lines)}")

if __name__ == '__main__':
    main()
