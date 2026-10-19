const parseApplicableYear = (value) => {
  const year = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(year) && year > 0 ? year : null;
};

const activityKey = (factor, index) => (
  factor?.activity
    ? String(factor.activity).trim().toLocaleLowerCase()
    : `__missing-activity-${index}`
);

const isPreferredFactor = (candidate, current, targetYear) => {
  const candidateYear = parseApplicableYear(candidate?.year_applicable);
  const currentYear = parseApplicableYear(current?.year_applicable);

  if (candidateYear === targetYear && currentYear !== targetYear) return true;
  if (currentYear === targetYear && candidateYear !== targetYear) return false;
  if (candidateYear === null) return false;
  if (currentYear === null) return true;

  const candidateDistance = Math.abs(candidateYear - targetYear);
  const currentDistance = Math.abs(currentYear - targetYear);
  if (candidateDistance !== currentDistance) return candidateDistance < currentDistance;

  return candidateYear > currentYear;
};

/**
 * Keeps one factor per displayed activity: the reporting-year factor when it
 * exists, otherwise the closest applicable year (preferring the newer year on
 * an equal-distance tie).
 */
export const selectClosestScope3Factors = (factors = [], reportingYear) => {
  const targetYear = parseApplicableYear(reportingYear);
  if (!targetYear) return factors;

  const selectedByActivity = new Map();
  factors.forEach((factor, index) => {
    const key = activityKey(factor, index);
    const current = selectedByActivity.get(key);
    if (!current || isPreferredFactor(factor, current, targetYear)) {
      selectedByActivity.set(key, factor);
    }
  });

  const emitted = new Set();
  return factors.reduce((selected, factor, index) => {
    const key = activityKey(factor, index);
    if (!emitted.has(key) && selectedByActivity.get(key) === factor) {
      emitted.add(key);
      selected.push(factor);
    }
    return selected;
  }, []);
};