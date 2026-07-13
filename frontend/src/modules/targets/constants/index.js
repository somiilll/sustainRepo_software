/**
 * Target module config (target modes + scope/category catalogs).
 *
 * Single source of truth for what scopes/categories the form renders.
 * Adding a new mode here + a corresponding form component is the only
 * change needed to extend the workspace (e.g. net-zero, sbt, intensity).
 */

export const TARGET_MODES = [
  { value: 'total', label: 'Total Emissions Target' },
  { value: 'scope', label: 'Scope Wise Target' },
  { value: 'category', label: 'Category Wise Target' },
];

export const TARGET_TYPES = [
  { value: 'absolute', label: 'Absolute (tCO₂e)' },
  { value: 'percentage', label: 'Reduction Percentage (%)' },
];

// Scopes shown in scope-wise + category-wise modes. Scope 3 visibility is
// controlled by org's enabled_access at render time.
export const ALL_SCOPES = [
  { id: 'scope1', label: 'Scope 1', requiresScope3: false },
  { id: 'scope2', label: 'Scope 2', requiresScope3: false },
  { id: 'scope3', label: 'Scope 3', requiresScope3: true },
  { id: 'biogenic', label: 'Biogenic', requiresScope3: false },
];

// Catalog used for category-wise targets. Keep aligned with the canonical
// CATEGORY_CONFIGS used by the emissions form, but lightweight (id+name only).
export const CATEGORY_CATALOG = {
  scope1: [
    { id: 'stationary_combustion', name: 'Stationary Combustion' },
    { id: 'mobile_combustion', name: 'Mobile Combustion' },
    { id: 'fugitive_emissions', name: 'Fugitive Emissions' },
    { id: 'process_emissions', name: 'Process Emissions' },
  ],
  scope2: [
    { id: 'purchased_electricity', name: 'Purchased Electricity' },
    { id: 'purchased_steam', name: 'Purchased Steam / Heat' },
  ],
  scope3: [
    { id: 'c1', name: 'C1 - Purchased Goods and Services' },
    { id: 'c2', name: 'C2 - Capital Goods' },
    { id: 'c3', name: 'C3 - Fuel and Energy Related Activities' },
    { id: 'c4', name: 'C4 - Upstream Transportation and Distribution' },
    { id: 'c5', name: 'C5 - Waste Generated in Operations' },
    { id: 'c6', name: 'C6 - Business Travel' },
    { id: 'c7', name: 'C7 - Employee Commuting' },
    { id: 'c8', name: 'C8 - Upstream Leased Assets' },
    { id: 'c9', name: 'C9 - Downstream Transportation and Distribution' },
    { id: 'c10', name: 'C10 - Processing of Sold Products' },
    { id: 'c11', name: 'C11 - Use of Sold Products' },
    { id: 'c12', name: 'C12 - End-of-Life Treatment of Sold Products' },
    { id: 'c13', name: 'C13 - Downstream Leased Assets' },
    { id: 'c14', name: 'C14 - Franchises' },
    { id: 'c15', name: 'C15 - Investments' },
  ],
  biogenic: [
    { id: 'biogenic_direct', name: 'Biogenic Direct' },
    { id: 'biogenic_indirect', name: 'Biogenic Indirect' },
  ],
};

// Helper: scope label by id.
export const scopeLabel = (id) =>
  ALL_SCOPES.find((s) => s.id === id)?.label || id;
