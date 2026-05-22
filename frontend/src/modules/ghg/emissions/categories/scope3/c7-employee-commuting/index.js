/**
 * C7 - Employee Commuting
 * Category Module Index
 */

import config, { C7_MONTHS, getEmployeeFields } from './config';
import validation, { 
  validateEmployee, 
  validateEmployees, 
  validateC7Form,
  validateCalculatedEmissions 
} from './validation';
import buildPayload, { 
  buildYearlyPayload, 
  buildMonthlyPayload,
  buildCalculationPayload 
} from './payload-builder';
import normalize, { 
  normalizeList, 
  denormalize,
  calculateMonthlyTotals,
  calculateYearlyTotal 
} from './normalizer';
import * as utils from './utils';
import { registerCategory } from '../../registry';

// Category module definition
const c7Module = {
  config,
  validation,
  payloadBuilder: buildPayload,
  normalizer: normalize,
  
  // Additional utilities specific to C7
  utils: {
    ...utils,
    validateForm: validateC7Form,
    validateEmployee,
    validateEmployees,
    validateCalculatedEmissions,
    buildYearlyPayload,
    buildMonthlyPayload,
    buildCalculationPayload,
    normalizeList,
    denormalize,
    calculateMonthlyTotals,
    calculateYearlyTotal,
    getEmployeeFields,
  },
  
  // Constants
  constants: {
    MONTHS: C7_MONTHS,
  },
  
  // Form components (to be added when forms are extracted)
  form: null,
  editForm: null,
};

// Register with category registry
registerCategory('c7', c7Module);

// Named exports
export { 
  config, 
  validation,
  validateEmployee,
  validateEmployees,
  validateC7Form,
  validateCalculatedEmissions,
  buildPayload,
  buildYearlyPayload,
  buildMonthlyPayload,
  buildCalculationPayload,
  normalize,
  normalizeList,
  denormalize,
  calculateMonthlyTotals,
  calculateYearlyTotal,
  C7_MONTHS,
  getEmployeeFields,
};

export * from './utils';

// Default export
export default c7Module;
