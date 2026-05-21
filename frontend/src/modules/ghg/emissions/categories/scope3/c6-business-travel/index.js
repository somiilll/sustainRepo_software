/**
 * C6 - Business Travel
 * Category Module Index
 */

import config from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c6Module = createCategoryModule({
  config,
});

registerCategory('c6', c6Module);

export { config };
export default c6Module;
