/**
 * Dynamic Form Renderer
 * 
 * Config-driven form rendering using react-hook-form and zod.
 * Renders forms based on field configurations from category modules.
 */

import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';
import { Info } from 'lucide-react';

/**
 * Field wrapper with label and error display
 */
const FieldWrapper = ({ field, error, children }) => (
  <div className="space-y-1.5">
    <Label htmlFor={field.key} className="flex items-center gap-2">
      {field.label}
      {field.required && <span className="text-red-500">*</span>}
      {field.helpText && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">
                <Info className="w-4 h-4 text-text-muted hover:text-primary" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
              <p>{field.helpText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Label>
    {children}
    {error && (
      <p className="text-xs text-red-500">{error.message}</p>
    )}
  </div>
);

/**
 * Text input field
 */
const TextField = ({ field, control, error }) => (
  <FieldWrapper field={field} error={error}>
    <Controller
      name={field.key}
      control={control}
      rules={{ required: field.required ? `${field.label} is required` : false }}
      render={({ field: inputField }) => (
        <Input
          {...inputField}
          id={field.key}
          type="text"
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          className="bg-stone-50"
          data-testid={`field-${field.key}`}
        />
      )}
    />
  </FieldWrapper>
);

/**
 * Number input field with unit selector
 */
const NumberField = ({ field, control, error, allowedUnits = [] }) => {
  const showUnitSelector = allowedUnits.length > 0 || field.allowedUnits?.length > 0;
  const units = allowedUnits.length > 0 ? allowedUnits : (field.allowedUnits || []);
  
  return (
    <FieldWrapper field={field} error={error}>
      <div className={showUnitSelector ? "grid grid-cols-3 gap-2" : ""}>
        <Controller
          name={field.key}
          control={control}
          rules={{ 
            required: field.required ? `${field.label} is required` : false,
            min: { value: 0, message: `${field.label} must be positive` },
          }}
          render={({ field: inputField }) => (
            <Input
              {...inputField}
              id={field.key}
              type="number"
              step="any"
              min="0"
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              className={`bg-stone-50 ${showUnitSelector ? 'col-span-2' : ''}`}
              onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
              data-testid={`field-${field.key}`}
            />
          )}
        />
        {showUnitSelector && (
          <Controller
            name={`${field.key}_unit`}
            control={control}
            render={({ field: unitField }) => (
              <select
                {...unitField}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid={`field-${field.key}-unit`}
              >
                {units.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}
          />
        )}
      </div>
    </FieldWrapper>
  );
};

/**
 * Select dropdown field
 */
const SelectField = ({ field, control, error, options = [] }) => {
  const selectOptions = options.length > 0 ? options : (field.options || []);
  
  return (
    <FieldWrapper field={field} error={error}>
      <Controller
        name={field.key}
        control={control}
        rules={{ required: field.required ? `${field.label} is required` : false }}
        render={({ field: selectField }) => (
          <select
            {...selectField}
            id={field.key}
            className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid={`field-${field.key}`}
          >
            <option value="">Select {field.label}</option>
            {selectOptions.map(opt => (
              <option key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </option>
            ))}
          </select>
        )}
      />
    </FieldWrapper>
  );
};

/**
 * Textarea field
 */
const TextareaField = ({ field, control, error }) => (
  <FieldWrapper field={field} error={error}>
    <Controller
      name={field.key}
      control={control}
      rules={{ required: field.required ? `${field.label} is required` : false }}
      render={({ field: textField }) => (
        <Textarea
          {...textField}
          id={field.key}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          className="bg-stone-50 min-h-[80px]"
          data-testid={`field-${field.key}`}
        />
      )}
    />
  </FieldWrapper>
);

/**
 * Checkbox field
 */
const CheckboxField = ({ field, control, error }) => (
  <div className="flex items-center gap-2">
    <Controller
      name={field.key}
      control={control}
      render={({ field: checkField }) => (
        <input
          {...checkField}
          id={field.key}
          type="checkbox"
          checked={checkField.value || false}
          onChange={(e) => checkField.onChange(e.target.checked)}
          className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary"
          data-testid={`field-${field.key}`}
        />
      )}
    />
    <Label htmlFor={field.key} className="font-normal">
      {field.label}
    </Label>
    {error && (
      <p className="text-xs text-red-500 ml-2">{error.message}</p>
    )}
  </div>
);

/**
 * Radio group field
 */
const RadioField = ({ field, control, error, options = [] }) => {
  const radioOptions = options.length > 0 ? options : (field.options || []);
  
  return (
    <FieldWrapper field={field} error={error}>
      <div className="flex gap-4 flex-wrap">
        <Controller
          name={field.key}
          control={control}
          rules={{ required: field.required ? `${field.label} is required` : false }}
          render={({ field: radioField }) => (
            <>
              {radioOptions.map(opt => (
                <label key={opt.value || opt} className="flex items-center gap-2">
                  <input
                    type="radio"
                    value={opt.value || opt}
                    checked={radioField.value === (opt.value || opt)}
                    onChange={() => radioField.onChange(opt.value || opt)}
                    className="text-primary"
                    data-testid={`field-${field.key}-${opt.value || opt}`}
                  />
                  <span>{opt.label || opt}</span>
                </label>
              ))}
            </>
          )}
        />
      </div>
    </FieldWrapper>
  );
};

/**
 * Override checkbox with value input
 */
const OverrideField = ({ field, control, error, allowedUnits = [] }) => {
  const { watch } = useFormContext();
  const isOverride = watch(`override_${field.key}`);
  const units = allowedUnits.length > 0 ? allowedUnits : (field.allowedUnits || []);
  
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4">
        <Controller
          name={`override_${field.key}`}
          control={control}
          render={({ field: overrideField }) => (
            <label className="flex items-center gap-2 min-w-[200px]">
              <input
                type="checkbox"
                checked={overrideField.value || false}
                onChange={(e) => overrideField.onChange(e.target.checked)}
                className="text-primary"
                data-testid={`override-${field.key}`}
              />
              <span className="text-sm">{field.label}</span>
            </label>
          )}
        />
        
        {isOverride && (
          <div className="flex gap-2 flex-1 items-center">
            <Controller
              name={field.key}
              control={control}
              render={({ field: inputField }) => (
                <Input
                  {...inputField}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Enter value"
                  className="bg-white flex-1"
                  onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                  data-testid={`field-${field.key}`}
                />
              )}
            />
            {units.length > 0 ? (
              <Controller
                name={`${field.key}_unit`}
                control={control}
                render={({ field: unitField }) => (
                  <select
                    {...unitField}
                    className="w-24 h-10 bg-stone-100 border border-stone-200 rounded-lg px-2"
                  >
                    {units.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                )}
              />
            ) : field.unit && (
              <span className="flex items-center text-sm text-text-muted px-2 py-1 bg-stone-100 rounded">
                {field.unit}
              </span>
            )}
          </div>
        )}
      </div>
      
      {isOverride && (
        <div className="ml-[216px]">
          <Controller
            name={`${field.key}_justification`}
            control={control}
            rules={{ required: 'Justification is required for override' }}
            render={({ field: justField }) => (
              <Input
                {...justField}
                type="text"
                placeholder="Justifications/Comments *"
                className="bg-white"
                data-testid={`field-${field.key}-justification`}
              />
            )}
          />
        </div>
      )}
      {error && (
        <p className="text-xs text-red-500 ml-[216px]">{error.message}</p>
      )}
    </div>
  );
};

/**
 * Field renderer - renders appropriate input based on field type
 */
export const DynamicField = ({ field, control, errors, context = {} }) => {
  const error = errors?.[field.key];
  const { allowedUnits = [], options = [] } = context;
  
  // Check visibility condition
  if (field.visibilityCondition && !field.visibilityCondition(context.formData, context)) {
    return null;
  }
  
  switch (field.type) {
    case 'text':
      return <TextField field={field} control={control} error={error} />;
    
    case 'number':
      return <NumberField field={field} control={control} error={error} allowedUnits={allowedUnits} />;
    
    case 'select':
      return <SelectField field={field} control={control} error={error} options={options} />;
    
    case 'textarea':
      return <TextareaField field={field} control={control} error={error} />;
    
    case 'checkbox':
      return <CheckboxField field={field} control={control} error={error} />;
    
    case 'radio':
      return <RadioField field={field} control={control} error={error} options={options} />;
    
    case 'override':
      return <OverrideField field={field} control={control} error={error} allowedUnits={allowedUnits} />;
    
    case 'custom':
      // Render custom component if provided
      if (field.CustomComponent) {
        return <field.CustomComponent field={field} control={control} error={error} context={context} />;
      }
      return null;
    
    default:
      return <TextField field={field} control={control} error={error} />;
  }
};

/**
 * Form section renderer - renders a group of fields
 */
export const FormSection = ({ 
  title, 
  description, 
  fields, 
  control, 
  errors, 
  context = {},
  columns = 2,
  className = '',
}) => {
  const visibleFields = fields.filter(field => {
    if (!field.visibilityCondition) return true;
    return field.visibilityCondition(context.formData, context);
  });
  
  if (visibleFields.length === 0) return null;
  
  return (
    <div className={`space-y-4 ${className}`}>
      {title && (
        <div>
          <h4 className="font-medium text-sm">{title}</h4>
          {description && <p className="text-xs text-stone-500 mt-1">{description}</p>}
        </div>
      )}
      <div className={`grid grid-cols-${columns} gap-4`}>
        {visibleFields.map(field => (
          <div key={field.key} className={field.fullWidth ? `col-span-${columns}` : ''}>
            <DynamicField 
              field={field} 
              control={control} 
              errors={errors}
              context={context}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Dynamic form renderer - renders entire form from config
 */
export const DynamicFormRenderer = ({
  sections,
  control,
  errors,
  context = {},
}) => {
  return (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <FormSection
          key={section.id || index}
          title={section.title}
          description={section.description}
          fields={section.fields}
          control={control}
          errors={errors}
          context={context}
          columns={section.columns}
          className={section.className}
        />
      ))}
    </div>
  );
};

export default DynamicFormRenderer;
