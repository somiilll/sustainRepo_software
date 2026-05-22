/**
 * C4 - Upstream Transportation and Distribution
 * Category Module Index
 */

import config from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c4Module = createCategoryModule({
  config,
});

registerCategory('c4', c4Module);

export { config };
export default c4Module;
