/**
 * C14 - Franchises
 * Category Module Index
 */

import config, { SUBCATEGORY_OPTIONS } from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c14Module = createCategoryModule({
  config,
});

registerCategory('c14', c14Module);

export { config, SUBCATEGORY_OPTIONS };
export default c14Module;
