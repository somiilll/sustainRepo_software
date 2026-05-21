/**
 * C1 Purchased Goods and Services — Edit-flow
 *
 * Thin proxy to the shared `Scope3FlatEdit` helpers. C1 has no special
 * capabilities (no asset_name, no journey-locations, no subcategory).
 *
 * To customise behaviour for C1 in future, override
 * `validateEditSubmission` or `buildEditPayload` directly on this module's
 * `editApi` — the page will call through unchanged.
 */

import {
  validateEditSubmission,
  buildEditPayload,
} from '../shared/Scope3FlatEdit';

export { validateEditSubmission, buildEditPayload };

export const editApi = { validateEditSubmission, buildEditPayload };

export default editApi;
