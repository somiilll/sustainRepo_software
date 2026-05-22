/**
 * C3 - Fuel and Energy Related Activities
 * Category Module Index
 */

import config from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c3Module = createCategoryModule({
  config,
});

registerCategory('c3', c3Module);

export { config };
export default c3Module;
