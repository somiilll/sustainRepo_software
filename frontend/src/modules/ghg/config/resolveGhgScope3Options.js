import {
  C3_ACTIVITY_TYPE_OPTIONS,
  C5_ACTIVITY_TYPE_OPTIONS,
  TRANSPORT_ACTIVITY_TYPE_OPTIONS,
  getStandardActivityTypeLabel,
} from './standardGhgFormConfig';

const METHOD_ORDER = Object.freeze(['spend_basis', 'activity_basis', 'supplier_basis']);

const matchesCategory = (entry, category) => (
  Boolean(entry?.category && category)
  && entry.category.toLowerCase() === category.toLowerCase()
);

const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort();

const isC3Category = (category = '') => /^c3\b/i.test(String(category).trim());
const isC5Category = (category = '') => /^c5\b/i.test(String(category).trim());
const isTransportCategory = (category = '') => /^c[49]\b/i.test(String(category).trim());

const orderActivityTypes = (types, category) => {
  const available = new Set(types.filter(Boolean));
  if (isC3Category(category)) {
    return C3_ACTIVITY_TYPE_OPTIONS
      .map((option) => option.value)
      .filter((value) => available.has(value));
  }
  if (isC5Category(category)) {
    return C5_ACTIVITY_TYPE_OPTIONS.map((option) => option.value).filter((value) => available.has(value));
  }
  if (isTransportCategory(category)) {
    return TRANSPORT_ACTIVITY_TYPE_OPTIONS
      .map((option) => option.value)
      .filter((value) => available.has(value));
  }
  return uniqueSorted(types);
};

export const resolveScope3MethodsForCategory = ({
  scope,
  biogenicScopeSelection,
  category,
  scope3EFData = [],
} = {}) => {
  const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const isScope3Like = scope === 'scope3' || isBiogenicScope3;
  if (!isScope3Like || !category) return [];

  const scopedRecords = isBiogenicScope3
    ? scope3EFData.filter((entry) => entry.sub_scope === 'biogenic')
    : scope3EFData.filter((entry) => entry.sub_scope !== 'biogenic');
  const methods = new Set(
    scopedRecords
      .filter((entry) => matchesCategory(entry, category))
      .map((entry) => entry.method),
  );
  methods.add('supplier_basis');
  return [
    ...METHOD_ORDER.filter((method) => methods.has(method)),
    ...Array.from(methods).filter((method) => !METHOD_ORDER.includes(method)),
  ];
};

/**
 * Presentation-only Scope 3 option resolver shared by Create and Edit.
 * It consumes existing EF records and resolved capabilities; it never changes
 * formula choice, calculations, units, or request payloads.
 */
export const resolveGhgScope3Options = ({
  scope,
  biogenicScopeSelection,
  category,
  scope3Method,
  scope3EFData = [],
  capabilities = {},
  requiresSubcategory = false,
  fieldOptions = {},
  configLabels = {},
} = {}) => {
  const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const isScope3Like = scope === 'scope3' || isBiogenicScope3;
  if (!isScope3Like || !category) {
    return {
      isScope3Like,
      methods: [],
      activityTypes: [],
      subcategories: [],
    };
  }

  const scopedRecords = isBiogenicScope3
    ? scope3EFData.filter((entry) => entry.sub_scope === 'biogenic')
    : scope3EFData.filter((entry) => entry.sub_scope !== 'biogenic');
  const categoryRecords = scopedRecords.filter((entry) => matchesCategory(entry, category));
  const orderedMethods = resolveScope3MethodsForCategory({
    scope,
    biogenicScopeSelection,
    category,
    scope3EFData,
  });

  const activityTypes = scope === 'scope3' && capabilities.activityType
    ? orderActivityTypes([
      ...categoryRecords
        .filter((entry) => !scope3Method || scope3Method === 'supplier_basis' || entry.method === scope3Method)
        .map((entry) => entry.activity_type),
      ...(scope3Method === 'supplier_basis' && capabilities.supplierBasisOtherActivity ? ['others'] : []),
    ], category)
    : [];

  const subcategories = requiresSubcategory && scope3Method
    ? (fieldOptions.scope3_subcategory || []).map((option) => ({
      ...option,
      label: option.value === 'energy' ? 'Grid Power' : (configLabels[option.value] || option.label),
    }))
    : [];

  return {
    isScope3Like,
    methods: orderedMethods,
    activityTypes,
    subcategories,
  };
};

export { getStandardActivityTypeLabel };
export default resolveGhgScope3Options;