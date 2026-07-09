/**
 * KPI Definition Wizard
 * 5-step wizard for creating/editing KPI definitions
 */
import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { WIZARD_STEPS, DEFAULT_VISIBILITY } from './constants';
import { IdentityStep, SourceStep, QueryStep, UnitsStep, SettingsStep } from './steps';
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';

const STEP_COMPONENTS = {
  identity: IdentityStep,
  source: SourceStep,
  query: QueryStep,
  units: UnitsStep,
  settings: SettingsStep,
};

const DEFAULT_FORM_DATA = {
  metric_name: '',
  short_name: '',
  description: '',
  section: '',
  category_name: '',
  subcategory: '',
  sub_subcategory: '',
  source_type: 'records',
  source_config: null,
  aggregation_type: 'sum',
  value_field: '',
  filters: [],
  dimensions: [],
  supported_scopes: ['organization', 'facility'],
  output_type: 'number',
  unit_config: {
    default_unit: '',
    supported_units: [],
    allow_unit_conversion: false,
  },
  display_config: {
    decimal_places: 2,
    display_order: 0,
  },
  visibility: DEFAULT_VISIBILITY,
  status: 'draft',
  tags: [],
  metadata: null,
};

const KPIDefinitionWizard = ({ 
  isOpen, 
  onClose, 
  onSave, 
  editData = null,
  isLoading = false 
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [errors, setErrors] = useState({});
  const [categoryData, setCategoryData] = useState({ categories: [], hierarchy: {} });

  // Reset form when opening/closing or when editData changes
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setFormData({ ...DEFAULT_FORM_DATA, ...editData });
      } else {
        setFormData(DEFAULT_FORM_DATA);
      }
      setCurrentStep(0);
      setErrors({});
      setCategoryData({ categories: [], hierarchy: {} });
    }
  }, [isOpen, editData]);

  const validateStep = (stepIndex) => {
    const step = WIZARD_STEPS[stepIndex];
    const newErrors = {};

    if (step.id === 'identity') {
      if (!formData.metric_name?.trim()) {
        newErrors.metric_name = 'Metric name is required';
      }
      if (!formData.section) {
        newErrors.section = 'ESG section is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, WIZARD_STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSave = () => {
    if (validateStep(currentStep)) {
      onSave(formData);
    }
  };

  const handleStepClick = (index) => {
    // Allow clicking on completed or current steps
    if (index <= currentStep) {
      setCurrentStep(index);
    }
  };

  const CurrentStepComponent = STEP_COMPONENTS[WIZARD_STEPS[currentStep].id];
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editData ? 'Edit KPI Definition' : 'Create KPI Definition'}
          </DialogTitle>
          <DialogDescription>
            Configure a reusable KPI metric for targets, dashboards, and reports.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg mb-4">
          {WIZARD_STEPS.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            
            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  onClick={() => handleStepClick(index)}
                  className={`
                    flex items-center gap-2 transition-all
                    ${isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600 cursor-pointer' : 'text-gray-400'}
                  `}
                  disabled={index > currentStep}
                >
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all
                    ${isCurrent 
                      ? 'bg-blue-600 text-white' 
                      : isCompleted 
                        ? 'bg-green-100 text-green-600 border-2 border-green-500' 
                        : 'bg-gray-100 text-gray-500'
                    }
                  `}>
                    {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <div className="hidden md:block text-left">
                    <p className={`text-sm font-medium ${isCurrent ? 'text-blue-900' : ''}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                </button>
                
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`
                    hidden md:block flex-1 h-0.5 mx-3 rounded
                    ${index < currentStep ? 'bg-green-300' : 'bg-gray-200'}
                  `} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto px-1 py-2">
          <CurrentStepComponent 
            formData={formData}
            setFormData={setFormData}
            errors={errors}
            categoryData={categoryData}
            setCategoryData={setCategoryData}
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isLoading}
            data-testid="kpi-wizard-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            
            {isLastStep ? (
              <Button
                type="button"
                onClick={handleSave}
                disabled={isLoading}
                data-testid="kpi-wizard-save"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    {editData ? 'Update KPI' : 'Create KPI'}
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleNext}
                disabled={isLoading}
                data-testid="kpi-wizard-next"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KPIDefinitionWizard;
