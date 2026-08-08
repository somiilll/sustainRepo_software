export const CONTENT_TREE = [
  { id: 'environment', label: 'Environment', children: [{ id: 'ghg', label: 'GHG' }, { id: 'water', label: 'Water' }, { id: 'waste', label: 'Waste' }, { id: 'biodiversity', label: 'Biodiversity' }] },
  { id: 'social', label: 'Social' },
  { id: 'governance', label: 'Governance' },
  { id: 'targets', label: 'Targets', children: [{ id: 'voluntary', label: 'Voluntary', children: [{ id: 'voluntary_environment', label: 'Environment' }, { id: 'voluntary_social', label: 'Social' }, { id: 'voluntary_governance', label: 'Governance' }] }, { id: 'sbti', label: 'SBTi' }] },
  { id: 'supplier_assessment', label: 'Supplier Assessment' },
];

const leafIds = (node) => node.children ? node.children.flatMap(leafIds) : [node.id];

export const ALL_SECTION_IDS = CONTENT_TREE.flatMap(leafIds);

export const frequencyLabel = (frequency) => ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[frequency] || frequency);

export const periodLabel = () => {
  const today = new Date();
  const start = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `FY ${start}–${String(start + 1).slice(-2)}`;
};

export const defaultFilters = () => {
  const today = new Date();
  const start = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return { reporting_period_start: `${start}-04`, reporting_period_end: `${start + 1}-03`, facility_ids: [], scopes: ['scope1', 'scope2', 'scope3', 'biogenic'], categories: [] };
};

export const newSchedule = () => ({
  name: '', frequency: 'monthly', recipients: [], filters: defaultFilters(), content: { sections: ['ghg', 'water', 'social', 'governance', 'sbti'] }, facility_mode: 'all', run_time: '09:00', run_day: 1, timezone: 'UTC', reporting_period_label: periodLabel(), is_enabled: true,
});