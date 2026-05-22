/**
 * C10 - Processing of Sold Products
 * Category Module Index
 */

import config, { SUBCATEGORY_OPTIONS } from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c10Module = createCategoryModule({
  config,
});

registerCategory('c10', c10Module);

export { config, SUBCATEGORY_OPTIONS };
export default c10Module;
