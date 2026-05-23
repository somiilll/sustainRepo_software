/**
 * Dashboard data transformers — pure functions that take the raw
 * `stats` / `filteredData` / `baseYearComparison` shape from
 * `useDashboardData` and return chart-ready data. No aggregation logic
 * lives inside chart components.
 */

// ---- Sparkline series for KPI cards ----
// Source: stats.emissions_trend = [{ period, scope1, scope2, scope3, biogenic, total }]
export function buildSparklineSeries(trend = [], metric = 'total') {
  return (trend || []).map((d, i) => ({ x: i, y: Number(d[metric] || 0) }));
}

// % change between current and previous bucket (last vs first non-zero).
export function computeChangePct(current = 0, previous = 0) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Derive "previous period" total from emissions_trend last vs second-last.
export function deriveTrendDeltas(trend = []) {
  if (!trend || trend.length < 2) return { totalDelta: null, scope1Delta: null, scope2Delta: null, scope3Delta: null };
  const last = trend[trend.length - 1] || {};
  const prev = trend[trend.length - 2] || {};
  return {
    totalDelta: computeChangePct(last.total, prev.total),
    scope1Delta: computeChangePct(last.scope1, prev.scope1),
    scope2Delta: computeChangePct(last.scope2, prev.scope2),
    scope3Delta: computeChangePct(last.scope3, prev.scope3),
  };
}

// ---- Donut: emissions-by-scope ----
export function buildEmissionsByScope(totals, hasScope3) {
  const items = [
    { id: 'scope1', name: 'Scope 1', value: totals.scope1 || 0 },
    { id: 'scope2', name: 'Scope 2', value: totals.scope2 || 0 },
  ];
  if (hasScope3) items.push({ id: 'scope3', name: 'Scope 3', value: totals.scope3 || 0 });
  items.push({ id: 'biogenic', name: 'Biogenic', value: totals.biogenic || 0 });
  const sum = items.reduce((s, x) => s + x.value, 0);
  return items.map((x) => ({ ...x, pct: sum > 0 ? (x.value / sum) * 100 : 0 }));
}

// ---- Facility-wise (vertical bars + sparkline per facility) ----
// emission_by_facility: [{ facility_id, facility_name, total_emissions, scope1, scope2, scope3, biogenic }]
// trend per facility is approximated from emissions_trend grouping when not available; use total only otherwise.
export function buildFacilitySeries(facilitiesData = []) {
  return (facilitiesData || []).map((f) => ({
    id: f.facility_id || f.id,
    name: f.facility_name || f.name,
    total: f.total_emissions || 0,
    scope1: f.scope1_emissions || 0,
    scope2: f.scope2_emissions || 0,
    scope3: f.scope3_emissions || 0,
    biogenic: f.biogenic_emissions || 0,
  }));
}

// Sparkline per facility — derived from monthly_comparison if available; else
// build a synthetic mini series from scope split (just for the glow visual).
export function buildFacilitySparkline(facility) {
  const seed = [
    facility.scope1 || 0,
    facility.scope2 || 0,
    facility.scope3 || 0,
    facility.biogenic || 0,
    facility.total || 0,
  ];
  // turn into a "trendy" line: prefix-sum normalized
  const norm = seed.map((_, i) => seed.slice(0, i + 1).reduce((a, b) => a + b, 0));
  return norm.map((y, x) => ({ x, y }));
}

// ---- Scope 3 hotspots: aggregate emissions_by_category for scope3 ----
export function buildScope3Hotspots(categories = []) {
  const s3 = (categories || []).filter((c) => (c.scope || '').toLowerCase() === 'scope3');
  return s3
    .map((c) => ({
      id: c.category || c.name,
      name: c.category || c.name,
      value: c.total_emissions || c.value || 0,
    }))
    .sort((a, b) => b.value - a.value);
}

// ---- Emission categories breakdown (all scopes, stacked) ----
export function buildCategoryBreakdown(categories = []) {
  return (categories || [])
    .map((c) => ({
      name: c.category || c.name,
      scope: c.scope || 'unknown',
      value: c.total_emissions || c.value || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

// ---- Base Year Sankey ----
// Build nodes/links for Recharts <Sankey>. Flow: BaseYear -> CurrentYear -> Scope contribution.
export function buildSankeyData(baseYearComparison, hasScope3) {
  if (!baseYearComparison) return { nodes: [], links: [] };
  const { directComparison = [], indirectComparison = [] } = baseYearComparison;

  const scopes = [
    ...directComparison,
    ...(hasScope3 ? indirectComparison.filter((x) => x.scope === 'Scope 3') : []),
  ].filter((s) => (s.base || 0) > 0 || (s.current || 0) > 0);

  const nodes = [
    { name: 'Base Year' },
    { name: 'Current Year' },
    ...scopes.map((s) => ({ name: s.scope })),
  ];

  const links = [];
  scopes.forEach((s, idx) => {
    const targetIdx = 2 + idx;
    // Base → Scope
    if ((s.base || 0) > 0) {
      links.push({ source: 0, target: targetIdx, value: Number(s.base.toFixed(2)) });
    }
    // Current → Scope (we represent current flow as a separate band)
    if ((s.current || 0) > 0) {
      links.push({ source: 1, target: targetIdx, value: Number(s.current.toFixed(2)) });
    }
  });

  return { nodes, links };
}

// ---- Heatmap: state → [lat, lng] mapping for Indian states ----
export const INDIAN_STATE_COORDS = {
  // major Indian states + union territories
  'Andhra Pradesh': [15.9129, 79.74],
  'Arunachal Pradesh': [28.218, 94.7278],
  'Assam': [26.2006, 92.9376],
  'Bihar': [25.0961, 85.3131],
  'Chhattisgarh': [21.2787, 81.8661],
  'Goa': [15.2993, 74.124],
  'Gujarat': [22.2587, 71.1924],
  'Haryana': [29.0588, 76.0856],
  'Himachal Pradesh': [31.1048, 77.1734],
  'Jharkhand': [23.6102, 85.2799],
  'Karnataka': [15.3173, 75.7139],
  'Kerala': [10.8505, 76.2711],
  'Madhya Pradesh': [22.9734, 78.6569],
  'Maharashtra': [19.7515, 75.7139],
  'Manipur': [24.6637, 93.9063],
  'Meghalaya': [25.467, 91.3662],
  'Mizoram': [23.1645, 92.9376],
  'Nagaland': [26.1584, 94.5624],
  'Odisha': [20.9517, 85.0985],
  'Punjab': [31.1471, 75.3412],
  'Rajasthan': [27.0238, 74.2179],
  'Sikkim': [27.533, 88.5122],
  'Tamil Nadu': [11.1271, 78.6569],
  'Telangana': [18.1124, 79.0193],
  'Tripura': [23.9408, 91.9882],
  'Uttar Pradesh': [26.8467, 80.9462],
  'Uttarakhand': [30.0668, 79.0193],
  'West Bengal': [22.9868, 87.855],
  'Delhi': [28.7041, 77.1025],
  'Jammu and Kashmir': [33.7782, 76.5762],
};

// Build heat points: [lat, lng, intensity] for leaflet.heat
export function buildHeatPoints(facilities = [], facilityEmissions = []) {
  // build a map: facility_id -> total_emissions
  const totals = {};
  (facilityEmissions || []).forEach((f) => {
    totals[f.facility_id || f.id] = f.total_emissions || 0;
  });
  const maxVal = Math.max(...Object.values(totals), 1);

  const points = [];
  (facilities || []).forEach((f) => {
    const emit = totals[f.id] || 0;
    if (emit <= 0) return;
    const stateCoords = INDIAN_STATE_COORDS[f.state];
    if (!stateCoords) return;
    // jitter slightly so multiple facilities in the same state don't stack identically
    const lat = stateCoords[0] + (Math.random() - 0.5) * 0.3;
    const lng = stateCoords[1] + (Math.random() - 0.5) * 0.3;
    const intensity = Math.max(0.2, emit / maxVal);
    points.push([lat, lng, intensity]);
  });
  return points;
}
