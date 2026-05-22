/**
 * C11 - Use of Sold Products
 * Category Module Index
 */

import config, { SUBCATEGORY_OPTIONS } from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c11Module = createCategoryModule({
  config,
});

registerCategory('c11', c11Module);

export { config, SUBCATEGORY_OPTIONS };
export default c11Module;
