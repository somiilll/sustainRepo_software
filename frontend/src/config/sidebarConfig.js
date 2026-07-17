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
  // {
  //   key: 'organization',
  //   label: 'Organization',
  //   icon: 'Building2',
  //   path: '/organization',
  // },
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
      ] },
      { key: 'environment.energy', label: 'Energy', icon: 'Zap', path: '/environment/energy' },
      { key: 'environment.water', label: 'Water', icon: 'Droplets', path: '/environment/water' },
      { key: 'environment.waste', label: 'Waste', icon: 'Trash2', path: '/environment/waste' },
      { key: 'environment.biodiversity', label: 'Biodiversity', icon: 'TreeDeciduous', path: '/environment/biodiversity' },
      {
        key: 'environment.others',
        label: 'Others',
        icon: 'Leaf',
        children: [
          { key: 'environment.others.climate_change', label: 'Climate Change', path: '/environment/climate-change' },
          { key: 'environment.others.material', label: 'Material', path: '/environment/material' },
        ],
      },
    ],
  },
  {
    key: 'social',
    label: 'Social',
    icon: 'Users2',
    path: '/social',
  },
  {
    key: 'governance',
    label: 'Governance',
    icon: 'Shield',
    path: '/governance',
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
          // { key: 'targets.voluntary.ghg', label: 'GHG Targets', path: '/targets/voluntary/ghg' },
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
    icon: 'FileBarChart',
    path: '/reports',
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
