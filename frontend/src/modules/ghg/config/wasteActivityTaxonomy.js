import { C5_ACTIVITY_TYPE_OPTIONS } from './standardGhgFormConfig';

const DISPOSAL_SUFFIXES = C5_ACTIVITY_TYPE_OPTIONS
  .filter((option) => option.value !== 'other')
  .sort((left, right) => right.label.length - left.label.length);

const normalizedIdentity = (value) => String(value || '').trim().toLowerCase();

export const getWasteDisposalCategoryKey = (...identities) => {
  const normalized = identities.map(normalizedIdentity).filter(Boolean);
  if (normalized.some((value) => (
    value === 'end_of_life_treatment_of_sold_products'
    || /^c12\b/.test(value)
    || /end[-\s]?of[-\s]?life.*sold products/.test(value)
  ))) return 'c12';
  if (normalized.some((value) => (
    value === 'waste_generated_in_operations'
    || /^c5\b/.test(value)
    || /waste generated in operations/.test(value)
  ))) return 'c5';
  return null;
};

export const isWasteDisposalCategory = (...identities) => (
  Boolean(getWasteDisposalCategoryKey(...identities))
);

export const resolveWasteActivityFactor = (factor = {}) => {
  const rawActivity = String(factor.activity || factor.activity_name || '').trim();
  const explicitName = String(factor.activity_name || '').trim();
  const explicitType = String(factor.activity_type || '').trim();
  const matchedSuffix = DISPOSAL_SUFFIXES.find(({ label }) => (
    rawActivity.toLowerCase().endsWith(` - ${label.toLowerCase()}`)
  ));
  const parsedName = matchedSuffix
    ? rawActivity.slice(0, -(matchedSuffix.label.length + 3)).trim()
    : rawActivity;
  const hasDistinctExplicitName = explicitName
    && explicitName.toLowerCase() !== rawActivity.toLowerCase();

  return {
    ...factor,
    activity_name: hasDistinctExplicitName ? explicitName : parsedName,
    activity_type: explicitType || matchedSuffix?.value || 'other',
  };
};

export const resolveWasteActivityFactors = (factors = []) => (
  factors.map(resolveWasteActivityFactor)
);