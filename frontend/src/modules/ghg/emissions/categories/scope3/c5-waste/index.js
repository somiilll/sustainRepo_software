/**
 * C5 - Waste Generated in Operations
 * Category Module Index
 */

import config from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c5Module = createCategoryModule({
  config,
});

registerCategory('c5', c5Module);

export { config };
export default c5Module;
