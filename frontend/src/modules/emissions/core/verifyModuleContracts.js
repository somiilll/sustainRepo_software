/**
 * Module Contract Verification
 *
 * Runs once at app boot inside `initializeCategoryModules()`. For each
 * registered module, asserts the EDIT + CREATE surfaces are wired and
 * that the resulting payload has the expected scope-specific keys.
 *
 * Output is `console.warn` only — never throws or breaks the runtime.
 * Catches:
 *   - missing methods (e.g. forgot to wire a new module)
 *   - capability flag drift (asset-name leaks into a non-asset module)
 *   - scope3 keys missing from a Scope 3 module's payload
 *
 * Designed to surface regressions during Phase D/E rollout before users
 * hit a broken save.
 */

const REQUIRED_EDIT_METHODS = ['validateEditSubmission', 'buildEditPayload'];
const REQUIRED_CREATE_METHODS = [
  'validateCreateSubmission',
  'buildCreatePayload',
  'extractInputsForCalcEngine',
  'buildDynamicFieldValues',
  'buildDecisionContext',
];

// Synthetic ctx generator
function makeSyntheticEditCtx(scope) {
  return {
    formData: {
      facility_id: 'facility-test',
      reporting_period_start: '2026-01',
      reporting_period_end: '2026-01',
      scope,
      category: 'TestCategory',
      sub_category: '',
      fuel_type: 'Test Fuel',
      fuel_id: 'fuel-test',
      process_names: [{ name: 'P1', description: 'D1' }],
      responsible_person: 'X',
      responsible_person_designation: '',
      responsible_person_contact: '',
      notes: '',
      justification: null,
      evidence_url: '',
      source_of_information: '',
      asset_name: scope === 'scope3' ? 'asset-test' : '',
      from_location: '',
      to_location: '',
    },
    editingEmission: { id: 'r1', frequency_type: 'monthly', formula_id: 'f1' },
    scope3Method: 'spend_basis',
    scope3ActivityId: 'a1',
    scope3ActivityType: 't1',
    scope3Subcategory: '',
    scope3CustomActivity: '',
    useCustomActivity: false,
    biogenicScopeSelection: '',
    dynamicInputFields: [],
    dynamicFieldValues: {},
    effectiveCalculatedEmissions: { co2Emissions: 0, ch4Emissions: 0, n2oEmissions: 0, co2eEmissions: 0, formulaId: 'f1' },
    selectedFuel: { allowed_units: ['kg'] },
    filteredScope3Activities: [{ id: 'a1', activity: 'TestActivity' }],
    centralizedUnits: [{ symbol: 'kg' }],
  };
}

function makeSyntheticCreateCtx(scope, biogenicScopeSelection) {
  return {
    scope,
    category: 'TestCategory',
    facilityId: 'facility-test',
    reportingPeriod: '2026-01',
    fuelId: 'fuel-test',
    selectedFuel: { fuel_name: 'TestFuel', allowed_units: ['kg'], source: 'test' },
    useCustomFuel: false,
    customFuelName: '',
    customSource: '',
    biogenicScopeSelection: biogenicScopeSelection || '',
    scope3Method: 'spend_basis',
    scope3ActivityId: 'a1',
    scope3ActivityType: 't1',
    scope3Subcategory: '',
    scope3CustomActivity: '',
    useCustomActivity: false,
    supplierName: 'Sup',
    supplierCode: 'C1',
    employeeName: '',
    employeeId: '',
    assetName: 'asset-test',
    fromLocation: '',
    toLocation: '',
    notes: '',
    responsiblePerson: 'X',
    responsiblePersonDesignation: '',
    responsiblePersonContact: '',
    validProcesses: [{ name: 'P1', description: 'D1' }],
    dynamicInputFields: [],
    filteredScope3Activities: [{ id: 'a1', activity: 'TestActivity' }],
    requiresSubcategory: false,
    centralizedUnits: [{ symbol: 'kg' }],
    defaultUnit: 'kg',
    buildDecisionInputs: () => ({}),
    isOverrideCV: false,
    isOverrideDensity: false,
    overrideEmissionFactorHeat: false,
    overrideJustification: '',
    calculatedCO2: 0,
    calculatedCH4: 0,
    calculatedN2O: 0,
    calculatedCO2e: 0,
    resolvedFormulaId: 'f1',
  };
}

/**
 * Run the verification across the registry. Logs a single summary line
 * with the result; per-module issues are logged at warn level.
 */
export function verifyModuleContracts(registry, options = {}) {
  const { silent = false } = options;
  const issues = [];
  const stats = { checked: 0, missingEdit: 0, missingCreate: 0, payloadIssues: 0 };

  // Categories we care about for contract verification (avoid alias entries
  // like 'employee_commuting' which are duplicates of canonical IDs).
  const CANONICAL_IDS = [
    'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9',
    'c10', 'c11', 'c12', 'c13', 'c14', 'c15',
    'stationary_combustion', 'mobile_combustion', 'fugitive_emissions',
  ];

  for (const id of CANONICAL_IDS) {
    const mod = registry.get(id);
    if (!mod) {
      issues.push(`[${id}] not registered`);
      continue;
    }
    stats.checked += 1;

    // EDIT contract
    for (const m of REQUIRED_EDIT_METHODS) {
      if (typeof mod[m] !== 'function') {
        issues.push(`[${id}] missing EDIT method: ${m}`);
        stats.missingEdit += 1;
      }
    }

    // CREATE contract — C7 is exempt (multi-employee uses different shape)
    if (id !== 'c7') {
      for (const m of REQUIRED_CREATE_METHODS) {
        if (typeof mod[m] !== 'function') {
          issues.push(`[${id}] missing CREATE method: ${m}`);
          stats.missingCreate += 1;
        }
      }

      // Payload shape spot-check (only if all CREATE methods present)
      const hasAllCreate = REQUIRED_CREATE_METHODS.every((m) => typeof mod[m] === 'function');
      if (hasAllCreate) {
        try {
          const scope =
            id.startsWith('c') && /^c\d+/.test(id)
              ? 'scope3'
              : id.includes('combustion') || id.includes('fugitive')
              ? 'scope1'
              : 'scope1';
          const ctx = makeSyntheticCreateCtx(scope);
          const payload = mod.buildCreatePayload({}, ctx);

          // Universal keys
          const REQUIRED_KEYS = ['facility_id', 'reporting_period', 'scope', 'category', 'outputs', 'process_names'];
          for (const k of REQUIRED_KEYS) {
            if (!(k in payload)) {
              issues.push(`[${id}] CREATE payload missing key: ${k}`);
              stats.payloadIssues += 1;
            }
          }

          // Scope-3 specific keys
          if (scope === 'scope3') {
            const scope3Keys = ['scope3_ef_id', 'calculation_method_scope3', 'scope3_activity'];
            for (const k of scope3Keys) {
              if (!(k in payload)) {
                issues.push(`[${id}] Scope 3 CREATE payload missing key: ${k}`);
                stats.payloadIssues += 1;
              }
            }
          }

          // Capability-aware: asset_name should ONLY be in payload when capability set
          const hasAssetCap = mod.hasCapability?.('asset-name');
          const payloadHasAsset = 'asset_name' in payload;
          if (hasAssetCap && !payloadHasAsset && scope === 'scope3') {
            issues.push(`[${id}] has 'asset-name' capability but payload missing asset_name`);
            stats.payloadIssues += 1;
          }
          if (!hasAssetCap && payloadHasAsset) {
            issues.push(`[${id}] payload contains asset_name without 'asset-name' capability (drift)`);
            stats.payloadIssues += 1;
          }

          // Capability-aware: from_location / to_location
          const hasJourneyCap = mod.hasCapability?.('journey-locations');
          const payloadHasJourney = 'from_location' in payload || 'to_location' in payload;
          if (hasJourneyCap && !payloadHasJourney && scope === 'scope3') {
            issues.push(`[${id}] has 'journey-locations' capability but payload missing from/to_location`);
            stats.payloadIssues += 1;
          }
          if (!hasJourneyCap && payloadHasJourney) {
            issues.push(`[${id}] payload contains from/to_location without 'journey-locations' capability (drift)`);
            stats.payloadIssues += 1;
          }
        } catch (e) {
          issues.push(`[${id}] CREATE payload synth threw: ${e.message}`);
          stats.payloadIssues += 1;
        }
      }
    }

    // EDIT payload shape spot-check
    if (typeof mod.buildEditPayload === 'function' && id !== 'c7') {
      try {
        const scope = /^c\d+/.test(id)
          ? 'scope3'
          : 'scope1';
        const editPayload = mod.buildEditPayload(makeSyntheticEditCtx(scope));
        if (!('facility_id' in editPayload) || !('outputs' in editPayload)) {
          issues.push(`[${id}] EDIT payload missing required keys`);
          stats.payloadIssues += 1;
        }
      } catch (e) {
        issues.push(`[${id}] EDIT payload synth threw: ${e.message}`);
        stats.payloadIssues += 1;
      }
    }
  }

  if (!silent) {
    if (issues.length === 0) {
       
      console.log(
        `[Emissions] Module contract verification PASSED — ${stats.checked} modules checked, EDIT+CREATE surfaces clean.`
      );
    } else {
       
      console.warn(
        `[Emissions] Module contract verification: ${issues.length} issue(s) across ${stats.checked} modules`,
        { stats, issues }
      );
    }
  }

  return { stats, issues };
}

export default verifyModuleContracts;
