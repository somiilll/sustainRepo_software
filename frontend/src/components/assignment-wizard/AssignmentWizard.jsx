/**
 * Assignment Wizard
 * Main stepper dialog for creating ESG assignments
 */

import React from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Loader2,
  Check,
  Layers,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { useAssignmentWizard, STEPS } from './useAssignmentWizard';
import { StepSelectLevel } from './StepSelectLevel';
import { StepAssignUsers } from './StepAssignUsers';
import { StepSchedule } from './StepSchedule';
import { StepReview } from './StepReview';

export function AssignmentWizard({
  open,
  onOpenChange,
  category,
  subcategory,
  subSubcategory,
  facilities = [],
  users = [],
  reportingPeriod = '',
  approvalWorkflowEnabled = false,
  multiLevelApprovalEnabled = false,
  initialData = null,
  authToken = null,
  onSubmit,
}) {
  const wizard = useAssignmentWizard({
    category,
    subcategory,
    subSubcategory,
    facilities,
    users,
    reportingPeriod,
    approvalWorkflowEnabled,
    multiLevelApprovalEnabled,
    initialData,
    authToken,
    onSubmit,
    onClose: () => onOpenChange(false),
  });

  const handleClose = () => {
    wizard.resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleClose();
    }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" hideCloseButton>
        {/* Header */}
        <WizardHeader 
          category={category}
          subcategory={subcategory}
          subSubcategory={subSubcategory}
          onClose={handleClose}
        />

        {/* Stepper */}
        <StepperNav 
          steps={STEPS}
          currentStep={wizard.currentStep}
          stepValidation={wizard.stepValidation}
          onStepClick={wizard.goToStep}
        />

        {/* Sticky Summary (shows after step 1) */}
        {wizard.currentStep > 0 && (
          <StickyAssignmentSummary summary={wizard.summary} />
        )}

        {/* Content */}
        <div className="p-5 max-h-[55vh] overflow-y-auto">
          {wizard.currentStep === 0 && (
            <StepSelectLevel 
              form={wizard.form}
              updateForm={wizard.updateForm}
              facilities={facilities}
            />
          )}
          {wizard.currentStep === 1 && (
            <StepAssignUsers
              form={wizard.form}
              facilities={facilities}
              users={users}
              expandedFacilities={wizard.expandedFacilities}
              toggleFacility={wizard.toggleFacility}
              addUser={wizard.addUser}
              removeUser={wizard.removeUser}
              addUserToFacility={wizard.addUserToFacility}
              removeUserFromFacility={wizard.removeUserFromFacility}
              updateFacilityAssignment={wizard.updateFacilityAssignment}
              bulkAssignToFacilities={wizard.bulkAssignToFacilities}
              bulkEnableApproval={wizard.bulkEnableApproval}
              approvalWorkflowEnabled={approvalWorkflowEnabled}
              multiLevelApprovalEnabled={multiLevelApprovalEnabled}
              updateForm={wizard.updateForm}
              addApprover={wizard.addApprover}
              removeApprover={wizard.removeApprover}
            />
          )}
          {wizard.currentStep === 2 && (
            <StepSchedule
              form={wizard.form}
              updateForm={wizard.updateForm}
              reportingPeriod={reportingPeriod}
              frequencyConfig={wizard.frequencyConfig}
            />
          )}
          {wizard.currentStep === 3 && (
            <StepReview
              form={wizard.form}
              summary={wizard.summary}
              facilities={facilities}
              users={users}
            />
          )}
        </div>

        {/* Footer */}
        <WizardFooter
          currentStep={wizard.currentStep}
          totalSteps={STEPS.length}
          canGoNext={wizard.canGoNext}
          canGoPrev={wizard.canGoPrev}
          isLastStep={wizard.isLastStep}
          isSubmitting={wizard.isSubmitting}
          onPrev={wizard.goPrev}
          onNext={wizard.goNext}
          onSubmit={wizard.handleSubmit}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}

// Wizard Header Component
function WizardHeader({ category, subcategory, subSubcategory, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b bg-stone-50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold text-text-primary">Create Assignment</h2>
          <div className="text-xs text-text-muted">
            {category}
            {subcategory && <span> → {subcategory}</span>}
            {subSubcategory && <span> → {subSubcategory}</span>}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2 hover:bg-stone-200 rounded-lg transition-colors"
      >
        <X className="w-5 h-5 text-stone-500" />
      </button>
    </div>
  );
}

// Stepper Navigation Component
function StepperNav({ steps, currentStep, stepValidation, onStepClick }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b bg-white">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep && stepValidation[index];
        const isClickable = index < currentStep || (index > 0 && stepValidation[index - 1]);

        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              onClick={() => isClickable && onStepClick(index)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-2 group",
                isClickable ? "cursor-pointer" : "cursor-default"
              )}
            >
              {/* Step Circle */}
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                isActive && "bg-emerald-500 text-white ring-2 ring-emerald-200",
                isCompleted && "bg-emerald-500 text-white",
                !isActive && !isCompleted && "bg-stone-100 text-stone-400"
              )}>
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>

              {/* Step Label */}
              <div className="hidden sm:block">
                <div className={cn(
                  "text-xs font-medium transition-colors",
                  isActive && "text-emerald-600",
                  isCompleted && "text-emerald-600",
                  !isActive && !isCompleted && "text-stone-400"
                )}>
                  {step.title}
                </div>
              </div>
            </button>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2",
                index < currentStep ? "bg-emerald-500" : "bg-stone-200"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Sticky Assignment Summary Component
function StickyAssignmentSummary({ summary }) {
  return (
    <div className="flex items-center gap-4 px-5 py-2 bg-emerald-50 border-b border-emerald-200 text-xs">
      <span className="font-medium text-emerald-800">{summary.category}</span>
      <span className="text-emerald-600">•</span>
      <span className="text-emerald-700">
        {summary.isFacilityLevel ? `${summary.assignedFacilities} Facilities` : 'Organization'}
      </span>
      <span className="text-emerald-600">•</span>
      <span className="text-emerald-700">{summary.totalUsers} Users</span>
      <span className="text-emerald-600">•</span>
      <span className="text-emerald-700">{summary.expectedTasks} Tasks</span>
      {summary.hasReminders && (
        <>
          <span className="text-emerald-600">•</span>
          <span className="text-emerald-700">Reminders</span>
        </>
      )}
      {summary.hasApproval && (
        <>
          <span className="text-emerald-600">•</span>
          <span className="text-emerald-700">Approval</span>
        </>
      )}
    </div>
  );
}

// Wizard Footer Component
function WizardFooter({
  currentStep,
  totalSteps,
  canGoNext,
  canGoPrev,
  isLastStep,
  isSubmitting,
  onPrev,
  onNext,
  onSubmit,
  onCancel,
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-t bg-stone-50">
      <div className="flex items-center gap-2">
        {canGoPrev ? (
          <Button variant="outline" onClick={onPrev} className="gap-1">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        ) : (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      <div className="text-xs text-text-muted">
        Step {currentStep + 1} of {totalSteps}
      </div>

      <div className="flex items-center gap-2">
        {isLastStep ? (
          <Button 
            onClick={onSubmit} 
            disabled={!canGoNext || isSubmitting}
            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Create Assignment
              </>
            )}
          </Button>
        ) : (
          <Button 
            onClick={onNext} 
            disabled={!canGoNext}
            className="gap-1"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
