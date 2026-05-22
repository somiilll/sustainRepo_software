/**
 * BulkUpload Module Registry — pluggable per-scope upload modules.
 *
 * Each scope (Scope 1 / Scope 2 / Scope 3) registers a module describing:
 *   - id, label, description
 *   - requiredAccess (org enabled_access keys)
 *   - endpoints (template, upload, save, errors, jobs)
 *   - normalizers (file validation, response shape)
 *   - buildUploadPayload (FormData builder)
 *   - transformValidationResponse (backend → UI shape)
 *   - status (available | restricted | not_implemented)
 *
 * Consumed by:
 *   - useBulkUpload hook (orchestration)
 *   - BulkUpload page (scope tab selection + access gating)
 */
import { MODULE_STATUS } from './bulkUploadConstants';

class BulkUploadRegistry {
  constructor() {
    this.modules = new Map();
  }

  register(module) {
    if (!module?.id) throw new Error('BulkUpload module must have an id');
    if (!module.label) throw new Error(`BulkUpload module "${module.id}" missing label`);
    if (!module.endpoints) throw new Error(`BulkUpload module "${module.id}" missing endpoints`);
    this.modules.set(module.id, module);
    return module;
  }

  get(id) {
    return this.modules.get(id) || null;
  }

  /**
   * Returns all registered modules with computed runtime status for the
   * given organization. The page can then render tabs/buttons accordingly.
   */
  list(organization) {
    const enabledAccess = organization?.enabled_access || [];
    return Array.from(this.modules.values()).map((mod) => {
      let status = MODULE_STATUS.AVAILABLE;
      if (mod.notImplemented) status = MODULE_STATUS.NOT_IMPLEMENTED;
      else if (mod.requiredAccess && mod.requiredAccess.length > 0) {
        const hasAny = mod.requiredAccess.some((key) => enabledAccess.includes(key));
        if (!hasAny) status = MODULE_STATUS.RESTRICTED;
      }
      return { ...mod, status };
    });
  }

  /** Returns first module the org can use (for default selection). */
  firstAvailable(organization) {
    return this.list(organization).find((m) => m.status === MODULE_STATUS.AVAILABLE) || null;
  }
}

const bulkUploadRegistry = new BulkUploadRegistry();
export default bulkUploadRegistry;
