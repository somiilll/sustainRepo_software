/**
 * C13 - Downstream Leased Assets
 * Category Module Index
 */

import config, { SUBCATEGORY_OPTIONS } from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c13Module = createCategoryModule({
  config,
});

registerCategory('c13', c13Module);

export { config, SUBCATEGORY_OPTIONS };
export default c13Module;
