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
 * @param {string} props.responsiblePerson - Person responsible name
 * @param {Function} props.setResponsiblePerson - Setter for responsible person
 * @param {string} props.responsiblePersonDesignation - Person designation
 * @param {Function} props.setResponsiblePersonDesignation - Setter for designation
 * @param {string} props.responsiblePersonContact - Person contact
 * @param {Function} props.setResponsiblePersonContact - Setter for contact
 * @param {Array} props.processNames - Process names array
 * @param {Function} props.addProcessName - Function to add process name
 * @param {Function} props.removeProcessName - Function to remove process name
 * @param {Function} props.updateProcessName - Function to update process name
 * @param {boolean} props.showsLocationFields - Whether to show location fields
 * @param {boolean} props.isC7EmployeeCommuting - Whether category is C7
 * @param {string} props.fromLocation - From location value
 * @param {Function} props.setFromLocation - Setter for from location
 * @param {string} props.toLocation - To location value
 * @param {Function} props.setToLocation - Setter for to location
 */
export const Step2ProcessResponsibility = ({
  responsiblePerson,
  setResponsiblePerson,
  responsiblePersonDesignation,
  setResponsiblePersonDesignation,
  responsiblePersonContact,
  setResponsiblePersonContact,
  processNames,
  addProcessName,
  removeProcessName,
  updateProcessName,
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
  scope,
  category,
  capabilities = {},
  supplierName = '',
  setSupplierName = () => {},
  supplierCode = '',
  setSupplierCode = () => {},
}) => {
  const responsibilityFields = (
    <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2" data-testid="responsibility-fields-grid">
      <div className="flex flex-col gap-2">
        <div className="flex h-5 items-center gap-2">
          <Label htmlFor="responsible-person-input">Person Responsible</Label>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help" data-testid="responsible-person-help-trigger">
                  <Info className="h-4 w-4 text-text-muted transition-colors hover:text-primary" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs bg-stone-800 p-3 text-sm text-white">
                <p>Person responsible for maintaining data accuracy</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="responsible-person-input"
          value={responsiblePerson}
          onChange={(event) => setResponsiblePerson(event.target.value)}
          placeholder="Name of person responsible"
          className="h-10 bg-stone-50"
          data-testid="responsible-person-input"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-5 items-center">
          <Label htmlFor="responsible-person-designation">Designation</Label>
        </div>
        <Input
          id="responsible-person-designation"
          value={responsiblePersonDesignation}
          onChange={(event) => setResponsiblePersonDesignation(event.target.value)}
          placeholder="e.g., Environmental Manager"
          className="h-10 bg-stone-50"
          data-testid="responsible-person-designation"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-5 items-center">
          <Label htmlFor="responsible-person-contact">Contact Details</Label>
        </div>
        <Input
          id="responsible-person-contact"
          value={responsiblePersonContact}
          onChange={(event) => setResponsiblePersonContact(event.target.value)}
          placeholder="Email or phone number"
          className="h-10 bg-stone-50"
          data-testid="responsible-person-contact"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-5 items-center gap-2">
          <Label htmlFor="record-source-input">Source of Information</Label>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help" data-testid="record-source-help-trigger">
                  <Info className="h-4 w-4 text-text-muted transition-colors hover:text-primary" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs bg-stone-800 p-3 text-sm text-white">
                <p>Reference, document, or system this data was taken from, such as an invoice, meter reading, or supplier report.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="record-source-input"
          value={recordSource}
          onChange={(event) => setRecordSource(event.target.value)}
          placeholder="e.g., Invoice #4521, meter reading from supplier portal"
          className="h-10 bg-stone-50"
          data-testid="record-source-input"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <>
          {/* Process Names */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Name of Process(es)</Label>
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
                data-testid="add-process-button"
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
                      data-testid={`process-name-input-${idx}`}
                    />
                    <div className="space-y-1">
                      <label className="text-xs text-stone-500">Description</label>
                      <textarea
                        value={process.description}
                        onChange={(e) => updateProcessName(idx, 'description', e.target.value)}
                        placeholder="Add an optional description"
                        className="w-full resize-none border border-stone-200 bg-white px-3 py-2 text-sm"
                        rows={2}
                        data-testid={`process-description-input-${idx}`}
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
                      data-testid={`remove-process-button-${idx}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {responsibilityFields}
          
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

      {scope === 'scope3' && category && (
        <div className="space-y-4 border-t border-stone-100 pt-6" data-testid="supplier-information-section">
          <div>
            <h4 className="font-medium text-stone-900">{capabilities.customerCounterparty ? 'Customer' : 'Supplier'} information</h4>
            <p className="mt-1 text-sm text-stone-500">Optional counterparty reference for this emission record.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{capabilities.customerCounterparty ? 'Customer Name' : 'Supplier Name'}</Label>
              <Input
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                placeholder={capabilities.customerCounterparty ? 'Enter customer name' : 'Enter supplier name'}
                className="bg-stone-50"
                data-testid="supplier-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label>{capabilities.customerCounterparty ? 'Customer Code' : 'Supplier Code'}</Label>
              <Input
                value={supplierCode}
                onChange={(event) => setSupplierCode(event.target.value)}
                placeholder={capabilities.customerCounterparty ? 'Enter customer code' : 'Enter supplier code'}
                className="bg-stone-50"
                data-testid="supplier-code-input"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Step2ProcessResponsibility;
