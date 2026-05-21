/**
 * C15 - Investments
 * Category Module Index
 */

import config from './config';
import { registerCategory } from '../../registry';
import { createCategoryModule } from '../../shared/base-category';

const c15Module = createCategoryModule({
  config,
});

registerCategory('c15', c15Module);

export { config };
export default c15Module;
