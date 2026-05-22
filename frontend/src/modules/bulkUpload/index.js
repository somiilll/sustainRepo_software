/**
 * BulkUpload module barrel — boots the registry by importing all scopes.
 *
 * Importing this barrel from the page (`import bulkUploadRegistry, { ... } from '../modules/bulkUpload'`)
 * guarantees Scope1/2/3 modules register themselves before any UI renders.
 */
import bulkUploadRegistry from './core/registry';

// Side-effect imports — each module self-registers on load.
import './scopes/Scope1Module';
import './scopes/Scope2Module';
import './scopes/Scope3Module';

export { bulkUploadRegistry };
export { default as Scope1Module } from './scopes/Scope1Module';
export { default as Scope2Module } from './scopes/Scope2Module';
export { default as Scope3Module } from './scopes/Scope3Module';
export { MODULE_STATUS, ROW_STATUS } from './core/bulkUploadConstants';

export default bulkUploadRegistry;
