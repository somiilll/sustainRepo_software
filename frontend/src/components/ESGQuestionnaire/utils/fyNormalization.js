/**
 * Utility functions to normalize FY-suffixed response data.
 * 
 * The backend adds _current_fy/_previous_fy suffixes for fy_comparison mode,
 * but renderers expect simple keys like 'mode', 'review_by', etc.
 * 
 * USAGE: Normalize once at the response boundary (when API data is received),
 * so all renderers receive clean data without FY suffixes.
 */

/**
 * Normalize FY-suffixed response data back to simple keys.
 * Recursively processes nested objects.
 * 
 * @param {any} data - The response data from backend
 * @param {boolean} preferCurrentFY - Whether to prefer current FY values (default: true)
 * @returns {any} Normalized data with FY suffixes stripped
 */
export function normalizeFYResponse(data, preferCurrentFY = true) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => normalizeFYResponse(item, preferCurrentFY));
  }
  
  const normalized = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip null/undefined
    if (value === null || value === undefined) continue;
    
    // If key has FY suffix, strip it
    if (key.endsWith('_current_fy')) {
      const baseKey = key.slice(0, -11); // Remove '_current_fy'
      // Only set if we prefer current FY or base key not set
      if (preferCurrentFY || !(baseKey in normalized)) {
        normalized[baseKey] = typeof value === 'object' ? normalizeFYResponse(value, preferCurrentFY) : value;
      }
    } else if (key.endsWith('_previous_fy')) {
      const baseKey = key.slice(0, -12); // Remove '_previous_fy'
      // Only set if we prefer previous FY or base key not set
      if (!preferCurrentFY || !(baseKey in normalized)) {
        normalized[baseKey] = typeof value === 'object' ? normalizeFYResponse(value, preferCurrentFY) : value;
      }
    } else {
      // No suffix - recursively normalize nested objects
      normalized[key] = typeof value === 'object' ? normalizeFYResponse(value, preferCurrentFY) : value;
    }
  }
  
  return normalized;
}

/**
 * Normalize all responses in a questionnaire response object.
 * This is the main entry point - call this once when API data is received.
 * 
 * @param {Object} responses - The responses object from API (keyed by question_key)
 * @param {boolean} preferCurrentFY - Whether to prefer current FY values (default: true)
 * @returns {Object} Normalized responses object
 */
export function normalizeAllResponses(responses, preferCurrentFY = true) {
  if (!responses || typeof responses !== 'object') return responses;
  
  const normalized = {};
  for (const [questionKey, responseValue] of Object.entries(responses)) {
    normalized[questionKey] = normalizeFYResponse(responseValue, preferCurrentFY);
  }
  return normalized;
}

/**
 * Add FY suffixes back when saving.
 * Converts simple keys to _current_fy suffixed keys for backend storage.
 * 
 * @param {any} data - The data to add suffixes to
 * @param {string} suffix - The suffix to add (default: '_current_fy')
 * @returns {any} Data with FY suffixes added
 */
export function addFYSuffixForSave(data, suffix = '_current_fy') {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => addFYSuffixForSave(item, suffix));
  }
  
  const suffixed = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    
    // Don't double-suffix if already has FY suffix
    if (key.endsWith('_current_fy') || key.endsWith('_previous_fy')) {
      suffixed[key] = typeof value === 'object' ? addFYSuffixForSave(value, suffix) : value;
    } else {
      suffixed[`${key}${suffix}`] = typeof value === 'object' ? addFYSuffixForSave(value, suffix) : value;
    }
  }
  
  return suffixed;
}
