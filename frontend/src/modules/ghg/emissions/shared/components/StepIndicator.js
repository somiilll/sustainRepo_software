/**
 * Step Indicator Component
 * Shows the current step in a multi-step form wizard
 */

import React from 'react';
import { Check } from 'lucide-react';

/**
 * Step indicator for multi-step forms
 * @param {Object} props
 * @param {Array} props.steps - Array of step objects { num, title, desc }
 * @param {number} props.currentStep - Current active step number
 * @param {string} props.className - Additional CSS classes
 */
export const StepIndicator = ({ 
  steps = [], 
  currentStep = 1,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between mb-6 ${className}`}>
      {steps.map((step, idx) => (
        <div key={step.num} className="flex items-center">
          <div 
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              currentStep >= step.num 
                ? 'bg-primary text-white' 
                : 'bg-stone-200 text-stone-500'
            }`}
          >
            {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
          </div>
          <div className="ml-2 hidden sm:block">
            <p className={`text-sm font-medium ${currentStep >= step.num ? 'text-primary' : 'text-stone-500'}`}>
              {step.title}
            </p>
            <p className="text-xs text-stone-400">{step.desc}</p>
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-12 h-0.5 mx-2 ${currentStep > step.num ? 'bg-primary' : 'bg-stone-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * Default steps for emission entry form
 */
export const DEFAULT_EMISSION_STEPS = [
  { num: 1, title: 'Selection', desc: 'Scope & Category' },
  { num: 2, title: 'Activity', desc: 'Fuel & Process' },
  { num: 3, title: 'Data', desc: 'Year & Values' },
  { num: 4, title: 'Notes', desc: 'Final Details' },
];

export default StepIndicator;
