/**
 * Step 2: Process & Responsibility Component
 * Handles process names, responsible person, asset names, and location fields
 */

import React from 'react';
import { Label } from '../../../../../../components/ui/label';
import { Input } from '../../../../../../components/ui/input';
import { Button } from '../../../../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../../../../components/ui/tooltip';
import { Plus, Trash2, Info } from 'lucide-react';

/**
 * Step 2 Process & Responsibility Component
 * @param {Object} props
 * @param {boolean} props.isProcessEmissions - Whether category is Process Emissions
 * @param {Object} props.selectedTemplate - Selected process template
 * @param {string} props.responsiblePerson - Person responsible name
 * @param {Function} props.setResponsiblePerson - Setter for responsible person
 * @param {string} props.responsiblePersonDesignation - Person designation
 * @param {Function} props.setResponsiblePersonDesignation - Setter for designation
 * @param {string} props.responsiblePersonContact - Person contact
 * @param {Function} props.setResponsiblePersonContact - Setter for contact
 * @param {Object} props.templateInputValues - Template input values
 * @param {Function} props.setTemplateInputValues - Setter for template input values
 * @param {Array} props.processNames - Process names array
 * @param {Function} props.addProcessName - Function to add process name
 * @param {Function} props.removeProcessName - Function to remove process name
 * @param {Function} props.updateProcessName - Function to update process name
 * @param {boolean} props.requiresAssetName - Whether asset name is required
 * @param {string} props.assetName - Asset name value
 * @param {Function} props.setAssetName - Setter for asset name
 * @param {boolean} props.showsLocationFields - Whether to show location fields
 * @param {boolean} props.isC7EmployeeCommuting - Whether category is C7
 * @param {string} props.fromLocation - From location value
 * @param {Function} props.setFromLocation - Setter for from location
 * @param {string} props.toLocation - To location value
 * @param {Function} props.setToLocation - Setter for to location
 */
export const Step2ProcessResponsibility = ({
  isProcessEmissions,
  selectedTemplate,
  responsiblePerson,
  setResponsiblePerson,
  responsiblePersonDesignation,
  setResponsiblePersonDesignation,
  responsiblePersonContact,
  setResponsiblePersonContact,
  templateInputValues,
  setTemplateInputValues,
  processNames,
  addProcessName,
  removeProcessName,
  updateProcessName,
  requiresAssetName,
  assetName,
  setAssetName,
  showsLocationFields,
  isC7EmployeeCommuting,
  fromLocation,
  setFromLocation,
  toLocation,
  setToLocation,
  // Optional Record Source (all scopes/categories — separate from
  // auto-derived `source_of_information`; tracked in version history)
  recordSource = '',
  setRecordSource = () => {},
}) => {
  return (
    <div className="space-y-4">
      {/* For Process Emissions: Show Person Responsible and Override Default Values */}
      {isProcessEmissions && selectedTemplate ? (
        <>
          {/* Person Responsible */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Person Responsible <span className="text-red-500">*</span></Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                    <p>Person responsible for maintaining data accuracy</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              value={responsiblePerson}
              onChange={(e) => setResponsiblePerson(e.target.value)}
              placeholder="Name of person responsible"
              className="bg-stone-50"
              data-testid="responsible-person-input"
            />
          </div>
          
          {/* Designation */}
          <div className="space-y-2">
            <Label>Designation</Label>
            <Input
              value={responsiblePersonDesignation}
              onChange={(e) => setResponsiblePersonDesignation(e.target.value)}
              placeholder="e.g., Environmental Manager"
              className="bg-stone-50"
              data-testid="responsible-person-designation"
            />
          </div>
          
          {/* Contact Details */}
          <div className="space-y-2">
            <Label>Contact Details</Label>
            <Input
              value={responsiblePersonContact}
              onChange={(e) => setResponsiblePersonContact(e.target.value)}
              placeholder="Email or phone number"
              className="bg-stone-50"
              data-testid="responsible-person-contact"
            />
          </div>

          {/* Modify Values - Only show predefined inputs that can be overridden */}
          {selectedTemplate.predefined_inputs?.filter(f => f.can_override).length > 0 && (
            <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Label className="text-amber-800 font-medium">Modify Values (if available)</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {selectedTemplate.predefined_inputs.filter(f => f.can_override).map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-sm">
                      {field.label}
                      {field.unit && <span className="text-text-muted ml-1">({field.unit})</span>}
                    </Label>
                    <Input
                      type={field.data_type === 'number' ? 'number' : 'text'}
                      step={field.data_type === 'number' ? 'any' : undefined}
                      value={templateInputValues[field.key] || ''}
                      onChange={(e) => setTemplateInputValues(prev => ({
                        ...prev,
                        [field.key]: e.target.value
                      }))}
                      placeholder={`Default: ${field.value}`}
                      className="bg-white"
                      data-testid={`override-${field.key}`}
                    />
                    <p className="text-xs text-amber-600">Default: {field.value} {field.unit}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show locked predefined values (non-overridable) for info */}
          {selectedTemplate.predefined_inputs?.filter(f => !f.can_override).length > 0 && (
            <div className="space-y-3 p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <Label className="text-stone-600 font-medium">Fixed Values (Cannot be changed)</Label>
              <div className="grid grid-cols-2 gap-3">
                {selectedTemplate.predefined_inputs.filter(f => !f.can_override).map((field) => (
                  <div key={field.key} className="flex justify-between items-center p-2 bg-white rounded border">
                    <span className="text-sm text-stone-600">{field.label}</span>
                    <span className="text-sm font-medium">{field.value} {field.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Regular emissions: Show Process Names and Person Responsible */
        <>
          {/* Process Names */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Name of Process(es) <span className="text-red-500">*</span></Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>Process in which the fuel is being used</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addProcessName}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Process
              </Button>
            </div>
            {processNames.map((process, idx) => (
              <div key={idx} className="border border-stone-200 rounded-lg p-3 space-y-2 bg-stone-50">
                <div className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={process.name}
                      onChange={(e) => updateProcessName(idx, 'name', e.target.value)}
                      placeholder={`Process Name ${idx + 1}`}
                      className="bg-white"
                    />
                    <div className="space-y-1">
                      <label className="text-xs text-stone-500">
                        Description {process.name && process.name.trim() && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        value={process.description}
                        onChange={(e) => updateProcessName(idx, 'description', e.target.value)}
                        placeholder="Process Description (required if name is provided)"
                        className={`w-full px-3 py-2 text-sm bg-white border rounded-lg resize-none ${
                          process.name && process.name.trim() && (!process.description || !process.description.trim())
                            ? 'border-red-300 focus:border-red-500'
                            : 'border-stone-200'
                        }`}
                        rows={2}
                      />
                    </div>
                  </div>
                  {processNames.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeProcessName(idx)}
                      className="text-red-500 mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Person Responsible for Regular Emissions */}
          <div className="space-y-2 my-6">
            <div className="flex items-center gap-2">
              <Label>Person Responsible <span className="text-red-500">*</span></Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                    <p>Person who is maintaining this data</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              value={responsiblePerson}
              onChange={(e) => setResponsiblePerson(e.target.value)}
              placeholder="Enter name of responsible person"
              className="bg-stone-50"
            />
          </div>
          
          {/* Designation */}
          <div className="space-y-2">
            <Label>Designation</Label>
            <Input
              value={responsiblePersonDesignation}
              onChange={(e) => setResponsiblePersonDesignation(e.target.value)}
              placeholder="e.g., Environmental Manager"
              className="bg-stone-50"
            />
          </div>
          
          {/* Contact Details */}
          <div className="space-y-2">
            <Label>Contact Details</Label>
            <Input
              value={responsiblePersonContact}
              onChange={(e) => setResponsiblePersonContact(e.target.value)}
              placeholder="Email or phone number"
              className="bg-stone-50"
            />
          </div>
          
          {/* Asset Name - Only for C8, C13, C14, C15 */}
          {requiresAssetName && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Asset Name <span className="text-red-500">*</span></Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                      <p>Name or identifier of the leased asset, franchise, or investment</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="Enter asset name"
                className="bg-stone-50"
                data-testid="asset-name-input"
              />
            </div>
          )}

          {/* From/To Location - Only for C4, C6, C9 (transportation/travel categories) */}
          {showsLocationFields && !isC7EmployeeCommuting && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Location</Label>
                <Input
                  value={fromLocation}
                  onChange={(e) => setFromLocation(e.target.value)}
                  placeholder="E.g., City A, Warehouse"
                  className="bg-stone-50"
                  data-testid="from-location-input"
                />
              </div>
              <div className="space-y-2">
                <Label>To Location</Label>
                <Input
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                  placeholder="E.g., City B, Distribution Center"
                  className="bg-stone-50"
                  data-testid="to-location-input"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Record Source (Optional) — common to all scopes / categories.
          Independent of auto-derived `source_of_information` (which carries
          fuel / template metadata). Persisted as `record_source`; tracked
          in version history. */}
      <div className="space-y-2 pt-2 border-t border-stone-100">
        <div className="flex items-center gap-2">
          <Label>Record Source <span className="text-xs text-stone-500">(Optional)</span></Label>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                <p>Reference, document, or system this data was taken from (e.g. invoice, meter reading, supplier report). Changes are tracked in version history.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          value={recordSource}
          onChange={(e) => setRecordSource(e.target.value)}
          placeholder="e.g., Invoice #4521, meter reading from supplier portal"
          className="bg-stone-50"
          data-testid="record-source-input"
        />
      </div>
    </div>
  );
};

export default Step2ProcessResponsibility;
