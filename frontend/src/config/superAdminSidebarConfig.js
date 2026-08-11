/**
 * Super Admin sidebar configuration.
 * Same structure as sidebarConfig.js — config-driven, rendered by Sidebar.js MenuItem.
 */
const superAdminSidebarConfig = [
  { key: 'sa-dashboard', label: 'Dashboard', path: '/super-admin', icon: 'Globe' },
  { key: 'sa-orgs', label: 'Organizations', path: '/super-admin/organizations', icon: 'Building' },
  { key: 'sa-admins', label: 'Admins', path: '/super-admin/admins', icon: 'UserCog' },
  { key: 'sa-sectors', label: 'Sectors', path: '/super-admin/sectors', icon: 'Layers' },
  { key: 'sa-esg-config', label: 'ESG Config', path: '/super-admin/esg-config', icon: 'Settings2' },
  { key: 'sa-kpi-defs', label: 'KPI Definitions', path: '/super-admin/kpi-definitions', icon: 'Gauge' },
  {
    key: 'sa-ghg',
    label: 'GHG',
    icon: 'Leaf',
    children: [
      { key: 'sa-scopes-cats', label: 'Scopes & Categories', path: '/super-admin/scopes-categories', icon: 'FolderTree' },
      {
        key: 'sa-ghg-data',
        label: 'GHG Data',
        icon: 'HardDrive',
        children: [
          { key: 'sa-emission-factors', label: 'Emission Factors', path: '/super-admin/emission-factors', icon: 'Flame' },
          { key: 'sa-fuel-db', label: 'Fuel Database', path: '/super-admin/fuel-database', icon: 'Database' },
          { key: 'sa-scope3-ef', label: 'Scope 3 EF', path: '/super-admin/scope3-ef', icon: 'FileSpreadsheet' },
          { key: 'sa-units', label: 'Units', path: '/super-admin/units', icon: 'Ruler' },
          { key: 'sa-ce-units', label: 'Calc Engine Units', path: '/super-admin/calc-engine-units', icon: 'Scale' },
          { key: 'sa-gwp', label: 'GWP Config', path: '/super-admin/gwp-config', icon: 'Thermometer' },
          { key: 'sa-currency', label: 'Currency Conversion', path: '/super-admin/currency-conversion', icon: 'DollarSign' },
        ],
      },
      {
        key: 'sa-ghg-calc',
        label: 'GHG Calculation',
        icon: 'FlaskConical',
        children: [
          { key: 'sa-var-reg', label: 'Variable Registry', path: '/super-admin/variable-registry', icon: 'Variable' },
          { key: 'sa-prop-src', label: 'Property Sources', path: '/super-admin/property-sources', icon: 'Link2' },
          { key: 'sa-formula', label: 'Formula Builder', path: '/super-admin/formula-builder', icon: 'Code2' },
          { key: 'sa-decision', label: 'Decision Trees', path: '/super-admin/decision-trees', icon: 'GitFork' },
          { key: 'sa-input-map', label: 'Input Field Mapping', path: '/super-admin/input-field-mapping', icon: 'FormInput' },
          { key: 'sa-sandbox', label: 'Calculation Sandbox', path: '/super-admin/calc-sandbox', icon: 'Beaker' },
        ],
      },
  {
    key: 'sustainability_config',
    label: 'Org Config',
    icon: 'Settings2',
    path: '/super-admin/org-config',
  },
  { key: 'sa-proc-tpl', label: 'Process Templates', path: '/super-admin/process-templates', icon: 'FileCode2' },
    ],
  },
];

export default superAdminSidebarConfig;
