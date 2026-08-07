/**
 * Sidebar menu configuration.
 * `icon` is a string key mapped to lucide-react components in the Sidebar.
 * `key` is used for access flag matching.
 * `path` is the route path.
 * `adminOnly` restricts to admin/super_admin roles.
 */
const sidebarConfig = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    path: '/dashboard',
  },
  {
    key: 'organization',
    label: 'Organization',
    icon: 'Building2',
    path: '/organization',
  },
  {
    key: 'facilities',
    label: 'Facilities',
    icon: 'Factory',
    path: '/facilities',
    adminOnly: true,
  },
  {
    key: 'repo_pilot',
    label: 'Repo-Pilot',
    icon: 'Bot',
    path: '/repo-pilot',
  },
  {
    key: 'environment',
    label: 'Environment',
    icon: 'Leaf',
    children: [
      { key: 'environment.ghg', label: 'GHG Module', icon: 'Cloud', children: [
          { key: 'environment.ghg.logs', label: 'Logs', icon: 'FileText', path: '/ghg' },
          { key: 'environment.ghg.sinks', label: 'Sinks', icon: 'TreeDeciduous', path: '/sinks' },
          { key: 'environment.ghg.base_year', label: 'Base Year', icon: 'CalendarDays', path: '/ghg/base-year' },
          { key: 'environment.ghg.analysis', label: 'Analysis', icon: 'BarChart3', path: '/ghg/analysis' },
      ] },
      { key: 'environment.energy', label: 'Energy', icon: 'Zap', children: [
          { key: 'environment.energy.kpi', label: 'KPI', icon: 'FileText', path: '/environment/energy' },
          { key: 'environment.energy.analysis', label: 'Analysis', icon: 'BarChart3', path: '/environment/energy/analysis' },
      ] },
      { key: 'environment.water', label: 'Water', icon: 'Droplets', children: [
          { key: 'environment.water.kpi', label: 'KPI', icon: 'FileText', path: '/environment/water' },
          { key: 'environment.water.analysis', label: 'Analysis', icon: 'BarChart3', path: '/environment/water/analysis' },
      ] },
      { key: 'environment.waste', label: 'Waste', icon: 'Trash2', children: [
          { key: 'environment.waste.kpi', label: 'KPI', icon: 'FileText', path: '/environment/waste' },
          { key: 'environment.waste.analysis', label: 'Analysis', icon: 'BarChart3', path: '/environment/waste/analysis' },
      ] },
      { key: 'environment.biodiversity', label: 'Biodiversity', icon: 'TreeDeciduous', path: '/environment/biodiversity' },
      { key: 'environment.others', label: 'Others', icon: 'Leaf', path: '/environment/others' },
      { key: 'environment.analysis', label: 'Analysis', icon: 'BarChart3', path: '/environment/analysis' },
    ],
  },
  {
    key: 'social',
    label: 'Social',
    icon: 'Users2',
    children: [
      { key: 'social.kpi', label: 'KPI', icon: 'FileText', path: '/social' },
      { key: 'social.analysis', label: 'Analysis', icon: 'BarChart3', path: '/social/analysis' },
    ],
  },
  {
    key: 'governance',
    label: 'Governance',
    icon: 'Shield',
    children: [
      { key: 'governance.kpi', label: 'KPI', icon: 'FileText', path: '/governance' },
      { key: 'governance.analysis', label: 'Analysis', icon: 'BarChart3', path: '/governance/analysis' },
    ],
  },
  {
    key: 'materiality',
    label: 'Materiality Assessment',
    icon: 'BarChart3',
    path: '/materiality',
  },
  {
    key: 'reporting',
    label: 'Reporting',
    icon: 'FileText',
    children: [
      { key: 'reporting.brsr', label: 'BRSR', icon: 'ScrollText', path: '/reporting/brsr' },
      { key: 'reporting.gri', label: 'GRI', icon: 'BookOpen', path: '/reporting/gri' },
    ],
  },
  {
    key: 'workflow',
    label: 'Workflow',
    icon: 'ClipboardCheck',
    children: [
      { key: 'workflow.tracker', label: 'Tracker', icon: 'ClipboardCheck', path: '/workflow/tracker' },
      { key: 'workflow.my_task', label: 'My Task', icon: 'Inbox', path: '/workflow/my-task' },
      { key: 'workflow.approver_queue', label: 'Approver Queue', icon: 'CheckSquare', path: '/workflow/approver-queue' },
    ],
  },
  {
    key: 'uploads',
    label: 'Uploads',
    icon: 'Upload',
    children: [
      { key: 'uploads.bulk', label: 'Bulk Uploads', icon: 'Upload', path: '/uploads/bulk' },
      { key: 'uploads.ocr', label: 'OCR Detection', icon: 'ScanText', path: '/uploads/ocr' },
    ],
  },
  {
    key: 'targets',
    label: 'Targets',
    icon: 'Target',
    children: [
      {
        key: 'targets.voluntary',
        label: 'Voluntary Targets',
        icon: 'Sprout',
        children: [
          { key: 'targets.voluntary.environment', label: 'Environment Targets', path: '/targets/voluntary/environment' },
          { key: 'targets.voluntary.social', label: 'Social Targets', path: '/targets/voluntary/social' },
          { key: 'targets.voluntary.governance', label: 'Governance Targets', path: '/targets/voluntary/governance' },
        ],
      },
      { key: 'targets.sbti', label: 'SBTi Targets', icon: 'Target', path: '/targets/sbti' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'FileText',
    path: '/reports',
  },
  {
    key: 'mis_reports',
    label: 'MIS Reports',
    icon: 'FileBarChart',
    path: '/mis-reports',
  },
  {
    key: 'peer_benchmarking',
    label: 'Peer Benchmarking',
    icon: 'GitCompareArrows',
    path: '/peer-benchmarking',
  },
  {
    key: 'supplier_assessment',
    label: 'Supplier Assessment',
    icon: 'Truck',
    children: [
      { key: 'supplier_assessment.suppliers', label: 'Suppliers', icon: 'Building2', path: '/supplier-assessment/suppliers', adminOnly: true },
      { key: 'supplier_assessment.esg', label: 'ESG Questionnaire', icon: 'ClipboardList', path: '/supplier-assessment/esg', adminOnly: true },
      { key: 'supplier_assessment.ghg', label: 'GHG Emissions', icon: 'Cloud', path: '/supplier-assessment/ghg', adminOnly: true },
      { key: 'supplier_assessment.ranking', label: 'Ranking', icon: 'Trophy', path: '/supplier-assessment/ranking', adminOnly: true },
      // Supplier-side routes (shown only for supplier users)
      { key: 'supplier_assessment.supplier', label: 'Supplier', icon: 'User', path: '/supplier-assessment/supplier', supplierOnly: true },
      { key: 'supplier_assessment.my_esg', label: 'ESG', icon: 'ClipboardList', path: '/supplier-assessment/supplier', supplierOnly: true },
      { key: 'supplier_assessment.my_ghg', label: 'GHG', icon: 'Cloud', path: '/supplier-assessment/emissions', supplierOnly: true },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    icon: 'Users',
    path: '/users',
    adminOnly: true,
  },
  {
    key: 'audit_trails',
    label: 'Audit Trails',
    icon: 'ScrollText',
    path: '/audit-trails',
    adminOnly: true,
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: 'User',
    path: '/profile',
  },
];

export default sidebarConfig;
