/**
 * C12 - End-of-Life Treatment of Sold Products
 * Category Module Index
 */

import config from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c12Module = createCategoryModule({
  config,
});

registerCategory('c12', c12Module);

export { config };
export default c12Module;
