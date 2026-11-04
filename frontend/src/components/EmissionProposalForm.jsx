import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import EmissionEditForm from './EmissionEditForm';
import { buildReadOnlyDraft, buildDynamicInputFields } from '../modules/supplier-assessment/components/SupplierEmissionReadOnlyDialog';

const API = process.env.REACT_APP_BACKEND_URL;
const LOCKED = ['scope', 'category', 'subcategory', 'methodology', 'fuel', 'meta'];
const titleCase = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const noop = () => {};

const proposalToEmission = (proposal, formConfig) => {
  const snapshot = proposal.entity_snapshot || {};
  const proposed = snapshot.proposed_changes || {};
  return {
    ...snapshot,
    id: snapshot.id || proposal.entity_id,
    dynamic_field_values: proposed.inputs || snapshot.dynamic_field_values || snapshot.inputs || {},
    outputs: proposed.outputs || snapshot.outputs || {},
    co2e_emissions: proposed.co2e_emissions ?? snapshot.co2e_emissions,
    input_field_mappings: formConfig?.input_field_mappings || snapshot.input_field_mappings || [],
  };
};

export default function EmissionProposalForm({ proposal, editing, onCancel, onSaved }) {
  const { getAuthHeader } = useAuth();
  const [formConfig, setFormConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const snapshot = proposal.entity_snapshot || {};

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let categoryId = snapshot.category_id;
        if (!categoryId && snapshot.category) {
          const { data } = await axios.get(`${API}/api/categories`, { headers: getAuthHeader() });
          categoryId = (data || []).find((c) => c.name === snapshot.category && c.scope_code === snapshot.scope)?.id;
        }
        if (categoryId) {
          const { data } = await axios.get(`${API}/api/calc-engine/form-config/${categoryId}?scope=${snapshot.scope}`, { headers: getAuthHeader() });
          if (active) setFormConfig(data);
        }
      } catch (err) {
        console.error('Failed to load emission form config', err);
      }
    })();
    return () => { active = false; };
  }, [snapshot.category_id, snapshot.category, snapshot.scope, getAuthHeader]);

  const emission = useMemo(() => proposalToEmission(proposal, formConfig), [proposal, formConfig]);
  const baseDraft = useMemo(() => buildReadOnlyDraft(emission), [emission]);
  useEffect(() => { setDraft(baseDraft); }, [baseDraft, editing]);
  const dynamicInputFields = useMemo(() => buildDynamicInputFields(emission), [emission]);

  const fuel = { id: baseDraft.values.fuel_id, fuel_name: emission.fuel_type || emission.custom_fuel_name || 'Recorded fuel', allowed_units: [baseDraft.values.quantity_unit].filter(Boolean) };
  const outputs = emission.outputs || {};
  const calculated = {
    co2Emissions: outputs.co2?.value ?? emission.co2_emissions ?? 0, ch4Emissions: outputs.ch4?.value ?? emission.ch4_emissions ?? 0,
    n2oEmissions: outputs.n2o?.value ?? emission.n2o_emissions ?? 0, co2eEmissions: outputs.co2e?.value ?? emission.co2e_emissions ?? emission.total_emissions ?? 0,
  };
  const evidence = (
    <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm" data-testid="proposal-emission-evidence">
      <p className="font-medium text-stone-900">Evidence Documents</p>
      {(emission.evidence_files || []).length === 0 ? <p className="text-stone-500">No evidence attached.</p>
        : emission.evidence_files.map((file) => <p key={file.id || file.original_filename} className="truncate text-stone-700">{file.original_filename}</p>)}
    </div>
  );

  const updateDynamic = (key, value) => setDraft((cur) => ({ ...cur, dynamicFieldValues: { ...cur.dynamicFieldValues, [key]: value } }));

  const handleSave = async () => {
    const changed = {};
    Object.entries(draft.dynamicFieldValues).forEach(([key, value]) => {
      if (value !== baseDraft.dynamicFieldValues[key]) changed[key] = value;
    });
    if (!Object.keys(changed).length) { onCancel(); return; }
    setSaving(true);
    try {
      await axios.put(`${API}/api/proposals/${proposal.id}`, { field_values: changed }, { headers: getAuthHeader() });
      toast.success('Saved and recalculated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return null;
  return (
    <div className="space-y-3" data-testid={`emission-proposal-form-${proposal.id}`}>
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3" data-testid={`emission-proposal-total-${proposal.id}`}>
        <span className="text-sm font-medium text-emerald-900">Total emissions</span>
        <span className="text-lg font-semibold text-emerald-900">{Number(calculated.co2eEmissions || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} tCO₂e</span>
      </div>
      <EmissionEditForm
        draft={draft} onDraftChange={setDraft} editingEmission={emission} activitySearchTerm="" loadingScope3EF={false} loadingBiogenicCategories={false}
        isCalculatingEditEmployee={false} isEditLoading={false} editFormConfigLoading={false} dynamicInputFields={dynamicInputFields}
        effectiveCalculatedEmissions={calculated} isCalculating={false} isSaving={saving} setActivitySearchTerm={noop}
        facilities={[{ id: draft.values.facility_id, name: emission.facility_name || 'Facility', is_active: true }]}
        dynamicScopes={[{ code: emission.scope, name: titleCase(emission.scope) }]} hasScope3Access={false} centralizedUnits={[]}
        fuelDatabase={[fuel]} selectedFuel={fuel} isEditC7EmployeeCommuting={false} editActiveMonths={[]} ModuleDynamicFieldsRenderer={null}
        getCategoriesForScope={[emission.category].filter(Boolean)} getFuelsForCategory={[fuel]} availableScope3Methods={[]} availableScope3ActivityTypes={[]}
        capabilities={{ requiresFuel: true, calculationMethodology: true, journeyLocations: true, customerCounterparty: false }} fieldOptions={{}}
        requiresSubcategory={false} availableSubcategories={[]} filteredScope3Activities={[]}
        availableQuantityUnits={[{ value: draft.values.quantity_unit, label: draft.values.quantity_unit }].filter((u) => u.value)}
        handleSubmit={(event) => event.preventDefault()} handleFuelSelect={noop} handleCategorySelect={noop} markFormDirty={noop}
        updateDynamicFieldValue={updateDynamic} getMethodLabel={titleCase} handleCalculateEditEmployeeMonth={noop} handleFileUpload={noop}
        handleRemoveEvidence={noop} handleDeleteExistingEvidence={noop} handleDeleteAllEvidences={noop} handleDialogChange={noop}
        hideSubmitButton assignedReportingPeriod={{ reporting_period: emission.reporting_period }} showAssignedReportingPeriodMessage={false}
        readOnly={!editing} lockedFields={LOCKED} readOnlyEvidenceContent={evidence}
      />
      {editing && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} data-testid={`emission-proposal-cancel-${proposal.id}`}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid={`emission-proposal-save-${proposal.id}`}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
