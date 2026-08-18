import React from 'react';
import { ChevronDown, Info, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { NotesSection } from './EditFormSections';

export const EditOptionalFields = ({
  formData,
  setFormData,
  markFormDirty,
  capabilities = {},
  selectedCategory,
  isEditC7EmployeeCommuting,
}) => {
  const updateForm = (updates) => {
    setFormData((previous) => ({ ...previous, ...updates }));
    markFormDirty?.();
  };

  const processes = formData.process_names || [];

  const updateProcess = (index, field, value) => {
    const nextProcesses = [...processes];
    const existing = nextProcesses[index];
    nextProcesses[index] = typeof existing === 'string'
      ? { name: field === 'name' ? value : existing, description: field === 'description' ? value : '' }
      : { ...existing, [field]: value };
    updateForm({ process_names: nextProcesses });
  };

  return (
    <Collapsible className="border border-stone-200 bg-white" data-testid="edit-optional-fields-section">
      <CollapsibleTrigger
        className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-stone-50"
        data-testid="edit-optional-fields-section-trigger"
      >
        <div>
          <h3 className="text-base font-semibold text-stone-900">Optional fields</h3>
          <p className="mt-1 text-sm text-stone-500">Add process context, ownership, references, routes, and notes when useful.</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-stone-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-stone-100 px-5 py-6">
        <div className="space-y-8" data-testid="edit-optional-fields-content">
          {!isEditC7EmployeeCommuting && (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Label>Name of process(es)</Label>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help"><Info className="h-4 w-4 text-stone-400" /></span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">Process context is optional and does not change the calculation.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateForm({ process_names: [...processes, { name: '', description: '' }] })}
                    data-testid="edit-add-process-button"
                  >
                    <Plus className="mr-1 h-4 w-4" />Add process
                  </Button>
                </div>
                {processes.map((process, index) => (
                  <div key={`${typeof process === 'string' ? process : process.name}-${index}`} className="space-y-3 border border-stone-200 bg-stone-50 p-3">
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-3">
                        <Input
                          value={typeof process === 'string' ? process : (process.name || '')}
                          onChange={(event) => updateProcess(index, 'name', event.target.value)}
                          placeholder={`Process name ${index + 1}`}
                          className="bg-white"
                          data-testid={`edit-process-name-input-${index}`}
                        />
                        <textarea
                          value={typeof process === 'string' ? '' : (process.description || '')}
                          onChange={(event) => updateProcess(index, 'description', event.target.value)}
                          placeholder="Optional description"
                          className="min-h-20 w-full resize-none border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                          data-testid={`edit-process-description-input-${index}`}
                        />
                      </div>
                      {processes.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => updateForm({ process_names: processes.filter((_, itemIndex) => itemIndex !== index) })}
                          className="text-red-500 hover:bg-red-50 hover:text-red-700"
                          data-testid={`edit-remove-process-button-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-responsible-person">Person responsible</Label>
                  <Input id="edit-responsible-person" value={formData.responsible_person || ''} onChange={(event) => updateForm({ responsible_person: event.target.value })} placeholder="Name" className="bg-stone-50" data-testid="edit-responsible-person-input" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-responsible-designation">Designation</Label>
                  <Input id="edit-responsible-designation" value={formData.responsible_person_designation || ''} onChange={(event) => updateForm({ responsible_person_designation: event.target.value })} placeholder="e.g., Environmental Manager" className="bg-stone-50" data-testid="edit-responsible-designation-input" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-responsible-contact">Contact</Label>
                  <Input id="edit-responsible-contact" value={formData.responsible_person_contact || ''} onChange={(event) => updateForm({ responsible_person_contact: event.target.value })} placeholder="Email or phone" className="bg-stone-50" data-testid="edit-responsible-contact-input" />
                </div>
              </div>
            </>
          )}

          {formData.scope === 'scope3' && selectedCategory && (
            <div className="space-y-4 border-t border-stone-100 pt-6" data-testid="edit-supplier-information-section">
              <div>
                <h4 className="font-medium text-stone-900">{capabilities.customerCounterparty ? 'Customer' : 'Supplier'} information</h4>
                <p className="mt-1 text-sm text-stone-500">Optional counterparty reference for this record.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-supplier-name">{capabilities.customerCounterparty ? 'Customer Name' : 'Supplier Name'}</Label>
                  <Input id="edit-supplier-name" value={formData.supplier_name || ''} onChange={(event) => updateForm({ supplier_name: event.target.value })} placeholder={capabilities.customerCounterparty ? 'Enter customer name' : 'Enter supplier name'} className="bg-stone-50" data-testid="edit-supplier-name-input" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-supplier-code">{capabilities.customerCounterparty ? 'Customer Code' : 'Supplier Code'}</Label>
                  <Input id="edit-supplier-code" value={formData.supplier_code || ''} onChange={(event) => updateForm({ supplier_code: event.target.value })} placeholder={capabilities.customerCounterparty ? 'Enter customer code' : 'Enter supplier code'} className="bg-stone-50" data-testid="edit-supplier-code-input" />
                </div>
              </div>
            </div>
          )}

          {formData.scope === 'scope3' && capabilities.journeyLocations && !isEditC7EmployeeCommuting && (
            <div className="grid grid-cols-1 gap-4 border-t border-stone-100 pt-6 md:grid-cols-2" data-testid="edit-journey-details-section">
              <div className="space-y-2">
                <Label htmlFor="edit-from-location">From location</Label>
                <Input id="edit-from-location" value={formData.from_location || ''} onChange={(event) => updateForm({ from_location: event.target.value })} placeholder="E.g., City A, Warehouse" className="bg-stone-50" data-testid="edit-from-location-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-to-location">To location</Label>
                <Input id="edit-to-location" value={formData.to_location || ''} onChange={(event) => updateForm({ to_location: event.target.value })} placeholder="E.g., City B, Distribution Center" className="bg-stone-50" data-testid="edit-to-location-input" />
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-stone-100 pt-6">
            <Label htmlFor="edit-record-source">Source of information</Label>
            <Input id="edit-record-source" value={formData.record_source || ''} onChange={(event) => updateForm({ record_source: event.target.value })} placeholder="e.g., Invoice #4521, meter reading from supplier portal" className="bg-stone-50" data-testid="edit-record-source-input" />
          </div>

          <NotesSection formData={formData} setFormData={(nextFormData) => { setFormData(nextFormData); markFormDirty?.(); }} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default EditOptionalFields;