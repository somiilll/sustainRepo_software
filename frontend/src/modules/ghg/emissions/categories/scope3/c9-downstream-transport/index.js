/**
 * C9 - Downstream Transportation and Distribution
 * Category Module Index
 */

import config from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c9Module = createCategoryModule({
  config,
});

registerCategory('c9', c9Module);

export { config };
export default c9Module;
