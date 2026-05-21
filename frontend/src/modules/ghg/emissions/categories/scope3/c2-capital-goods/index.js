/**
 * C2 - Capital Goods
 * Category Module Index
 */

import config from './config';
import validation, { validateC2Form } from './validation';
import buildPayload, { buildMonthlyPayload } from './payload-builder';
import normalize, { normalizeList } from './normalizer';
import { registerCategory } from '../../registry';

const c2Module = {
  config,
  validation,
  payloadBuilder: buildPayload,
  normalizer: normalize,
  utils: {
    validateForm: validateC2Form,
    buildMonthlyPayload,
    normalizeList,
  },
  form: null,
  editForm: null,
};

registerCategory('c2', c2Module);

export { config, validation, validateC2Form, buildPayload, buildMonthlyPayload, normalize, normalizeList };
export default c2Module;
