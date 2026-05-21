/**
 * Scope 2 Module — Purchased Electricity, Steam, Heating, Cooling
 *
 * Single generic Scope 2 module — Scope 2 has fewer category variations
 * than Scope 1 / Scope 3, so one generic module covers all sub-categories.
 * UI rendering stays in `Emissions.js` (existing inline JSX) — only logic
 * is owned by this module.
 *
 * The edit-flow business logic (validation + payload construction) is
 * shared with Scope 1 via `Scope1Edit.js` — both scopes have the same
 * payload shape (no `scope3_*` keys, no `asset_name`, no
 * `journey-locations`) and the same CV/density/EFH override semantics.
 */

import { createCategoryModule, categoryRegistry } from '../core/CategoryRegistry';
import { z } from 'zod';

const GenericScope2Module = createCategoryModule({
  id: 'generic_scope2',
  name: 'Scope 2 Emission',
  scope: 'scope2',
  description: 'Generic Scope 2 emission entry (purchased electricity, steam, heating, cooling)',
  methods: [],
  supportsMonthly: true,
  supportsYearly: true,

  fields: [
    {
      key: 'fuel_id',
      label: 'Energy Source',
      type: 'select',
      required: true,
    },
    {
      key: 'qty',
      label: 'Quantity',
      type: 'number',
      required: true,
      unitSource: 'fuel',
    },
  ],

  validationSchema: z.object({
    fuel_id: z.string().min(1, 'Energy source is required'),
    qty: z.number().positive('Quantity must be positive'),
  }),

  getDefaultValues: () => ({
    fuel_id: '',
    qty: '',
    qty_unit: 'kWh',
  }),

  autoRegister: false,
});

// Register as generic fallback so `categoryRegistry.getGenericModule('scope2')` resolves.
categoryRegistry.registerGeneric('scope2', GenericScope2Module);

export { GenericScope2Module };
export default GenericScope2Module;
