/**
 * C1 - Purchased Goods and Services
 * Category Module Index
 * 
 * Exports all C1-related functionality
 */

import config from './config';
import validation, { validateC1Form } from './validation';
import buildPayload, { buildMonthlyPayload } from './payload-builder';
import normalize, { normalizeList, denormalize } from './normalizer';
import { registerCategory } from '../../registry';

// Category module definition
const c1Module = {
  config,
  validation,
  payloadBuilder: buildPayload,
  normalizer: normalize,
  
  // Additional utilities
  utils: {
    validateForm: validateC1Form,
    buildMonthlyPayload,
    normalizeList,
    denormalize,
  },
  
  // Form components (to be added when forms are extracted)
  form: null,
  editForm: null,
};

// Register with category registry
registerCategory('c1', c1Module);

// Named exports
export { config, validation, validateC1Form, buildPayload, buildMonthlyPayload, normalize, normalizeList, denormalize };

// Default export
export default c1Module;
