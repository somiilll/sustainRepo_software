import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Download, Eye, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import EmissionEditForm from './EmissionEditForm';
import { downloadSecureFile, openSecureFile } from '../lib/secureFileAccess';
import { createDraftEvidence, persistedEvidence, revokeDraftEvidences, toEvidencePayload, uploadDraftEvidences } from '../lib/draftEvidence';
import hydrateEmissionForm from '../pages/emissions/utils/hydrateEmissionForm';
import { buildReadOnlyDraft, buildDynamicInputFields } from '../modules/supplier-assessment/components/SupplierEmissionReadOnlyDialog';

const API = process.env.REACT_APP_BACKEND_URL;
const LOCKED = ['scope', 'category', 'subcategory', 'methodology', 'fuel', 'employees'];
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const DETAIL_KEYS = ['notes', 'record_source', 'responsible_person', 'responsible_person_designation', 'responsible_person_contact'];
const allocationValue = (emission) => {
  const raw = emission.allocation_method ?? emission.dynamic_field_values?.allocation_method;
  return (raw && typeof raw === 'object' ? raw.value : raw) || '';
};
const processList = (items = []) => items.map((p) => (typeof p === 'string' ? { name: p, description: '' } : { name: p?.name || '', description: p?.description || '' }));
const evidenceItem = (file) => ({ ...file, filename: file.filename || file.original_filename, url: file.url || (file.file_id || file.id ? `/api/files/${file.file_id || file.id}` : undefined) });
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
  const isC7 = emission.scope === 'scope3' && /^C7\b/.test(emission.category || '') && Array.isArray(emission.employees);
  const c7 = useMemo(() => (isC7 ? hydrateEmissionForm(emission) : null), [isC7, emission]);
  const baseDraft = useMemo(() => ({ ...buildReadOnlyDraft(emission),
    ...(c7 ? { employees: c7.employees, employeeMonthlyTotals: c7.employeeMonthlyTotals, employeeYearlyTotal: c7.employeeYearlyTotal, frequencyType: c7.frequencyType,
      scope3Method: c7.scope3Method, scope3ActivityType: c7.scope3ActivityType, scope3Subcategory: c7.scope3Subcategory, scope3CustomActivity: c7.scope3CustomActivity } : {}), existingEvidences: (emission.evidence_files || []).map(evidenceItem), allocationMethod: allocationValue(emission) }), [emission, c7]);
  useEffect(() => { setDraft(baseDraft); }, [baseDraft, editing]);
  const dynamicInputFields = useMemo(() => {
    if (!isC7) return buildDynamicInputFields(emission);
    const keys = [...new Set(emission.employees.flatMap((e) => Object.keys(e.inputs || {})))];
    return keys.map((variable, index) => ({ variable, label: titleCase(variable), fieldType: 'number', expectedUnit: '', required: false, displayOrder: index }));
  }, [isC7, emission]);
  const c7Months = useMemo(() => {
    if (!isC7) return [];
    if (c7.frequencyType === 'yearly') return ['yearly'];
    return c7.editC7Month ? [c7.editC7Month] : [];
  }, [isC7, c7]);

  const fuel = { id: baseDraft.values.fuel_id, fuel_name: emission.fuel_type || emission.custom_fuel_name || 'Recorded fuel', allowed_units: [baseDraft.values.quantity_unit].filter(Boolean) };
  const outputs = emission.outputs || {};
  const calculated = {
    co2Emissions: outputs.co2?.value ?? emission.co2_emissions ?? 0, ch4Emissions: outputs.ch4?.value ?? emission.ch4_emissions ?? 0,
    n2oEmissions: outputs.n2o?.value ?? emission.n2o_emissions ?? 0, co2eEmissions: outputs.co2e?.value ?? emission.co2e_emissions ?? emission.total_emissions ?? 0,
  };
  const evidence = (
    <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm" data-testid="proposal-emission-evidence">
      <p className="font-medium text-stone-900">Evidence Documents</p>
      {baseDraft.existingEvidences.length === 0 ? <p className="text-stone-500">No evidence attached.</p>
        : baseDraft.existingEvidences.map((file, idx) => {
          const fileId = file.file_id || file.id;
          return (
            <div key={fileId || idx} className="mt-2 flex items-center justify-between gap-2 rounded-md border border-stone-200 bg-stone-50 p-2">
              <span className="min-w-0 truncate text-stone-700">{file.filename || `Evidence ${idx + 1}`}</span>
              {fileId && (
                <span className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openSecureFile(fileId).catch(console.error)} data-testid={`proposal-evidence-view-${idx}`}><Eye className="mr-1 h-4 w-4" />View</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => downloadSecureFile(fileId)} data-testid={`proposal-evidence-download-${idx}`}><Download className="mr-1 h-4 w-4" />Download</Button>
                </span>
              )}
            </div>
          );
        })}
    </div>
  );

  const addEvidence = (file, sha256Hash = null) => {
    if (file.size > MAX_EVIDENCE_BYTES) { toast.error(`${file.name} exceeds 5MB limit`); return; }
    setDraft((cur) => ({ ...cur, existingEvidences: [...cur.existingEvidences, createDraftEvidence(file, { sha256_hash: sha256Hash })] }));
  };
  const removeEvidence = (index) => setDraft((cur) => ({ ...cur, existingEvidences: cur.existingEvidences.filter((_, i) => i !== index) }));
  const clearEvidence = () => setDraft((cur) => ({ ...cur, existingEvidences: [] }));

  const updateDynamic = (key, value) => setDraft((cur) => ({ ...cur, dynamicFieldValues: { ...cur.dynamicFieldValues, [key]: value } }));

  const handleSave = async () => {
    const payload = {};
    const changed = {};
    Object.entries(draft.dynamicFieldValues).forEach(([key, value]) => {
      if (value !== baseDraft.dynamicFieldValues[key]) changed[key] = value;
    });
    if (Object.keys(changed).length) payload.field_values = changed;
    if (isC7) {
      const periodKey = c7.frequencyType === 'yearly' ? 'yearly' : c7.editC7Month;
      const inputsOf = (employee) => (periodKey === 'yearly' ? employee.yearly_data?.inputs : employee.monthly_data?.[periodKey]?.inputs) || {};
      const employeeInputs = (draft.employees || []).flatMap((employee) => {
        const before = (baseDraft.employees || []).find((e) => e.id === employee.id);
        return periodKey && before && JSON.stringify(inputsOf(employee)) !== JSON.stringify(inputsOf(before))
          ? [{ id: employee.id, period_key: periodKey, inputs: inputsOf(employee) }] : [];
      });
      if (employeeInputs.length) payload.employee_inputs = employeeInputs;
    }
    DETAIL_KEYS.forEach((key) => {
      if ((draft.values[key] || '') !== (baseDraft.values[key] || '')) payload[key] = draft.values[key] || '';
    });
    if (payload.record_source !== undefined) payload.source_of_information = payload.record_source;
    const processes = processList(draft.values.process_names);
    if (JSON.stringify(processes) !== JSON.stringify(processList(baseDraft.values.process_names))) {
      const named = processes.filter((p) => p.name.trim());
      payload.process_names = named.map((p) => p.name.trim());
      payload.process_descriptions = named.map((p) => ({ name: p.name.trim(), description: p.description }));
    }
    const evidenceChanged = draft.existingEvidences.length !== baseDraft.existingEvidences.length || draft.existingEvidences.some((e) => e.is_draft);
    if (!Object.keys(payload).length && !evidenceChanged) { onCancel(); return; }
    setSaving(true);
    try {
      const headers = getAuthHeader();
      if (evidenceChanged) {
        const uploadResult = await uploadDraftEvidences({
          items: draft.existingEvidences,
          uploadUrl: `${API}/api/upload/evidence?bucket_type=emission_evidence`,
          headers,
          mapUploaded: (uploaded, item) => ({
            url: uploaded.url, filename: item.filename, file_id: uploaded.file_id, sha256_hash: item.sha256_hash || null, uploaded_at: new Date().toISOString(),
          }),
        });
        if (uploadResult.failed.length) toast.error(`${uploadResult.failed.length} evidence file(s) could not be uploaded`);
        payload.evidence_files = [...persistedEvidence(draft.existingEvidences).map(toEvidencePayload), ...uploadResult.uploaded];
      }
      await axios.put(`${API}/api/proposals/${proposal.id}`, payload, { headers });
      revokeDraftEvidences(draft.existingEvidences);
      toast.success(payload.field_values ? 'Saved and recalculated' : 'Changes saved');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return null;
  return (
    <div className="min-w-0 space-y-3" data-testid={`emission-proposal-form-${proposal.id}`}>
      <EmissionEditForm
        draft={draft} onDraftChange={setDraft} editingEmission={emission} activitySearchTerm="" loadingScope3EF={false} loadingBiogenicCategories={false}
        isCalculatingEditEmployee={false} isEditLoading={false} editFormConfigLoading={false} dynamicInputFields={dynamicInputFields}
        effectiveCalculatedEmissions={calculated} isCalculating={false} isSaving={saving} setActivitySearchTerm={noop}
        facilities={[{ id: draft.values.facility_id, name: emission.facility_name || 'Facility', is_active: true }]}
        dynamicScopes={[{ code: emission.scope, name: titleCase(emission.scope) }]} hasScope3Access centralizedUnits={[]}
        fuelDatabase={[fuel]} selectedFuel={fuel} isEditC7EmployeeCommuting={isC7} editActiveMonths={c7Months} ModuleDynamicFieldsRenderer={null}
        getCategoriesForScope={[emission.category].filter(Boolean)} getFuelsForCategory={[fuel]} availableScope3Methods={[]} availableScope3ActivityTypes={[]}
        capabilities={{ requiresFuel: true, calculationMethodology: true, journeyLocations: true, customerCounterparty: false }} fieldOptions={{}}
        requiresSubcategory={false} availableSubcategories={[]} filteredScope3Activities={[]}
        availableQuantityUnits={[{ value: draft.values.quantity_unit, label: draft.values.quantity_unit }].filter((u) => u.value)}
        handleSubmit={(event) => event.preventDefault()} handleFuelSelect={noop} handleCategorySelect={noop} markFormDirty={noop}
        updateDynamicFieldValue={updateDynamic} getMethodLabel={titleCase} handleCalculateEditEmployeeMonth={noop} handleFileUpload={addEvidence}
        handleRemoveEvidence={noop} handleDeleteExistingEvidence={removeEvidence} handleDeleteAllEvidences={clearEvidence} handleDialogChange={noop}
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
