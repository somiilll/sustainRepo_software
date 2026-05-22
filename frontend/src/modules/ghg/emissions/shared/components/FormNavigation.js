/**
 * Form Navigation Component
 * Handles previous/next/save buttons for multi-step forms
 */

import React from 'react';
import { Button } from '../../../../../components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react';

/**
 * Form navigation buttons
 * @param {Object} props
 * @param {number} props.currentStep - Current step number
 * @param {number} props.totalSteps - Total number of steps
 * @param {Function} props.onPrevious - Previous button handler
 * @param {Function} props.onNext - Next button handler
 * @param {Function} props.onCancel - Cancel button handler
 * @param {Function} props.onSave - Save button handler
 * @param {boolean} props.canProceed - Whether user can proceed to next step
 * @param {boolean} props.isSaving - Whether form is being saved
 * @param {boolean} props.showSaveOnLastStep - Show save button on last step
 * @param {string} props.saveLabel - Label for save button
 * @param {string} props.cancelLabel - Label for cancel/back button
 * @param {string} props.nextLabel - Label for next button
 * @param {string} props.previousLabel - Label for previous button
 * @param {string} props.className - Additional CSS classes
 */
export const FormNavigation = ({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onCancel,
  onSave,
  canProceed = true,
  isSaving = false,
  showSaveOnLastStep = true,
  saveLabel = 'Save Entry',
  cancelLabel = 'Cancel',
  nextLabel = 'Next',
  previousLabel = 'Previous',
  className = '',
}) => {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;
  
  const handleBackClick = () => {
    if (isFirstStep) {
      onCancel && onCancel();
    } else {
      onPrevious && onPrevious();
    }
  };
  
  const handleNextClick = () => {
    if (isLastStep && showSaveOnLastStep) {
      onSave && onSave();
    } else {
      onNext && onNext();
    }
  };
  
  return (
    <div className={`flex justify-between pt-4 border-t border-stone-200 ${className}`}>
      {/* Back/Cancel Button */}
      <Button
        type="button"
        variant="outline"
        onClick={handleBackClick}
        disabled={isSaving}
        className="flex items-center gap-2"
        data-testid="form-back-button"
      >
        <ChevronLeft className="h-4 w-4" />
        {isFirstStep ? cancelLabel : previousLabel}
      </Button>
      
      {/* Next/Save Button */}
      <Button
        type="button"
        onClick={handleNextClick}
        disabled={!canProceed || isSaving}
        className="flex items-center gap-2 bg-primary hover:bg-primary/90"
        data-testid={isLastStep ? "form-save-button" : "form-next-button"}
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : isLastStep && showSaveOnLastStep ? (
          <>
            <Save className="h-4 w-4" />
            {saveLabel}
          </>
        ) : (
          <>
            {nextLabel}
            <ChevronRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
};

export default FormNavigation;
