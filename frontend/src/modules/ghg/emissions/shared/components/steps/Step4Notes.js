/**
 * Step 4: Notes Component
 * Final step for optional additional notes
 */

import React from 'react';
import { Label } from '../../../../../../components/ui/label';
import { FileUpload } from '../../../../../../components/ui/file-upload';

/**
 * Step 4 Notes Component
 * @param {Object} props
 * @param {string} props.notes - Additional notes text
 * @param {Function} props.setNotes - Notes setter
 */
export const Step4Notes = ({
  notes,
  setNotes,
  showEvidence = false,
  evidenceFile = null,
  onEvidenceUpload,
  onEvidenceRemove,
}) => {
  return (
    <div className="mt-4 space-y-3">
      <Label className="text-base font-medium">Additional Notes</Label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Enter any additional notes or comments..."
        className="h-32 w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20"
        data-testid="add-emission-additional-notes-input"
      />
      {showEvidence && (
        <FileUpload
          label="Evidence Document"
          uploadedFile={evidenceFile}
          onUpload={onEvidenceUpload}
          onRemove={onEvidenceRemove}
        />
      )}
    </div>
  );
};

export default Step4Notes;
