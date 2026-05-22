/**
 * C6 - Business Travel
 * Category Module
 */

export const config = {
  code: 'c6',
  name: 'C6 - Business Travel',
  scope: 'scope3',
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: true, // Requires from/to location
  hasActivityType: true, // Requires activity type selection (air, rail, road)
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false, // C6 doesn't use multi-employee (unlike C7)
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from business travel by employees',
  helpText: {
    activity_basis: 'Use average emission factors based on travel mode and distance',
    spend_basis: 'Calculate emissions based on travel spend',
    supplier_basis: 'Use supplier-specific emission factors from travel providers',
  },
  activityTypes: [
    { value: 'air_travel', label: 'Air Travel' },
    { value: 'rail_travel', label: 'Rail Travel' },
    { value: 'road_travel', label: 'Road Travel' },
    { value: 'bus_travel', label: 'Bus Travel' },
    { value: 'car_travel', label: 'Car/Taxi Travel' },
    { value: 'hotel_stay', label: 'Hotel Stay' },
  ],
  locationFields: {
    from: { label: 'Departure', placeholder: 'Enter departure location', required: false },
    to: { label: 'Arrival', placeholder: 'Enter arrival location', required: false },
  },
};

export default config;
