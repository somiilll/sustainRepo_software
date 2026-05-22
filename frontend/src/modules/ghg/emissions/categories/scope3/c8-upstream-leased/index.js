/**
 * C8 - Upstream Leased Assets
 * Category Module Index
 */

import config, { SUBCATEGORY_OPTIONS } from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c8Module = createCategoryModule({
  config,
});

registerCategory('c8', c8Module);

export { config, SUBCATEGORY_OPTIONS };
export default c8Module;
