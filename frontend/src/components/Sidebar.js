import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { LayoutDashboard, Building2, Gauge, FileText, Users, LogOut, Building, UserCog, Flame, Globe, User, Calculator, Layers, Database, Ruler, Settings2, TreeDeciduous, Thermometer, FileCode2, CalendarClock, FolderTree, Beaker, Variable, Code2, GitFork, Scale, FormInput, Link2, ChevronDown, ChevronRight, FlaskConical, HardDrive, History, FileSpreadsheet, Upload, DollarSign, ClipboardCheck, Leaf, Sprout, Users2, Shield, Cog, Inbox } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, getAuthHeader } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState({ 
    ghgCalc: false, 
    ghgData: false, 
    ghg: false,
    ghgEmissions: false,  // GHG Emissions sub-group under GHG parent
    adminGhg: false,  // Parent GHG menu for admin/user
    superAdminGhg: false,  // Parent GHG menu for super admin
    esg: false,  // ESG parent menu containing Environment, Social, Governance
  });
  const [enabledAccess, setEnabledAccess] = useState([]);
  const [approvalEnabled, setApprovalEnabled] = useState(false);
  const [moduleConfig, setModuleConfig] = useState({ has_ghg: true, has_esg: true });

  // Pull the current org's scope-access + approval flag + module config once on mount
  useEffect(() => {
    let cancelled = false;
    if (!user || user.role === 'super_admin' || !user.organization_id) return;
    (async () => {
      try {
        // Fetch org details for enabled_access and approval
        const { data } = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
        if (cancelled) return;
        setEnabledAccess(data?.enabled_access || []);
        setApprovalEnabled(!!data?.approval_workflow_enabled);
        
        // Fetch module config for sidebar visibility
        const configRes = await axios.get(`${API}/organization/module-config`, { headers: getAuthHeader() });
        if (cancelled) return;
        setModuleConfig({
          has_ghg: configRes.data?.has_ghg ?? true,
          has_esg: configRes.data?.has_esg ?? true,
        });
      } catch {
        /* ignore — fall back to showing all */
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.organization_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMenu = (menu) => {
    setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // GHG Data sub-module items (for Super Admin)
  const ghgDataItems = [
    { path: '/super-admin/fuel-database', label: 'Fuel Database', icon: Database },
    { path: '/super-admin/scope3-ef', label: 'Scope 3 EF', icon: FileSpreadsheet },
    { path: '/super-admin/units', label: 'Units', icon: Ruler },
    { path: '/super-admin/calc-engine-units', label: 'Calc Engine Units', icon: Scale },
    { path: '/super-admin/gwp-config', label: 'GWP Config', icon: Thermometer },
    { path: '/super-admin/currency-conversion', label: 'Currency Conversion', icon: DollarSign },
  ];

  // GHG Emissions Calculations sub-module items (for Super Admin)
  const ghgCalcItems = [
    { path: '/super-admin/variable-registry', label: 'Variable Registry', icon: Variable },
    { path: '/super-admin/property-sources', label: 'Property Sources', icon: Link2 },
    { path: '/super-admin/formula-builder', label: 'Formula Builder', icon: Code2 },
    { path: '/super-admin/decision-trees', label: 'Decision Trees', icon: GitFork },
    { path: '/super-admin/input-field-mapping', label: 'Input Field Mapping', icon: FormInput },
    { path: '/super-admin/calc-sandbox', label: 'Calculation Sandbox', icon: Beaker },
  ];

  // Check if any GHG module item is active (for Super Admin)
  const isGhgDataActive = ghgDataItems.some(item => location.pathname === item.path);
  const isGhgCalcActive = ghgCalcItems.some(item => location.pathname === item.path);
  const isScopesCategoriesActive = location.pathname === '/super-admin/scopes-categories';
  const isSuperAdminGhgActive = isGhgDataActive || isGhgCalcActive || isScopesCategoriesActive;

  // Super Admin base items (without GHG-related items)
  const superAdminBaseItems = [
    { path: '/super-admin', label: 'Super Dashboard', icon: Globe },
    { path: '/super-admin/organizations', label: 'Organizations', icon: Building },
    { path: '/super-admin/admins', label: 'Admins', icon: UserCog },
    { path: '/super-admin/sectors', label: 'Sectors', icon: Layers },
    { path: '/super-admin/esg-config', label: 'ESG Config', icon: Cog },
  ];

  // Visibility flags driven by the org's enabled_access list.
  const hasScope12 = enabledAccess.includes('scope1_2') || enabledAccess.includes('scope1_2_3');
  const hasScope123 = enabledAccess.includes('scope1_2_3');

  // GHG Emissions sub-menu items (per-org filtered for Admin/User).
  const ghgEmissionsItems = [
    hasScope12 && { path: '/ghg/scope1', label: 'Scope 1', icon: Gauge },
    hasScope12 && { path: '/ghg/scope2', label: 'Scope 2', icon: Gauge },
    hasScope123 && { path: '/ghg/scope3', label: 'Scope 3', icon: Gauge },
    (hasScope12 || hasScope123) && { path: '/ghg/biogenic', label: 'Biogenic', icon: TreeDeciduous },
    approvalEnabled && user?.role === 'admin' && {
      path: '/ghg/approvals', label: 'Approvals', icon: ClipboardCheck,
    },
  ].filter(Boolean);

  const isGhgActive = ghgEmissionsItems.some((i) => location.pathname.startsWith(i.path)) ||
    location.pathname.startsWith('/ghg') || location.pathname === '/emissions';

  // GHG sub-items for Admin (under GHG parent module)
  const adminGhgSubItems = [
    { 
      type: 'subgroup', 
      key: 'ghgEmissions', 
      label: 'GHG Emissions', 
      icon: Gauge, 
      items: ghgEmissionsItems 
    },
    { path: '/sinks', label: 'GHG Sinks', icon: TreeDeciduous },
    { path: '/bulk-upload', label: 'Bulk Upload', icon: Upload },
    { path: '/base-year-emissions', label: 'Base Year and Target Settings', icon: CalendarClock },
  ];

  // Check if any admin GHG item is active
  const isAdminGhgActive = 
    ghgEmissionsItems.some((i) => location.pathname.startsWith(i.path)) ||
    location.pathname === '/sinks' ||
    location.pathname === '/bulk-upload' ||
    location.pathname.startsWith('/base-year-emissions') ||
    location.pathname.startsWith('/ghg');

  // Check if any ESG item is active
  const isEsgActive = 
    location.pathname === '/environment' ||
    location.pathname === '/social' ||
    location.pathname === '/governance' ||
    location.pathname === '/approver-queue';

  // ESG sub-items (Environment, Social, Governance)
  // Dynamically add Approver Queue for admins when approval workflow is enabled
  const esgSubItems = [
    { path: '/environment', label: 'Environment', icon: Sprout },
    { path: '/social', label: 'Social', icon: Users2 },
    { path: '/governance', label: 'Governance', icon: Shield },
    // Add Approver Queue for admins when approval is enabled
    ...(approvalEnabled && user?.role === 'admin' ? [
      { path: '/approver-queue', label: 'Approver Queue', icon: Inbox }
    ] : []),
  ];

  // Build admin items dynamically based on module config
  const buildAdminItems = () => {
    const items = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/organization', label: 'Organization', icon: Building },
      { path: '/facilities', label: 'Facilities', icon: Building2 },
    ];
    
    // Add GHG if enabled
    if (moduleConfig.has_ghg) {
      items.push({ 
        type: 'parent', 
        key: 'adminGhg', 
        label: 'GHG', 
        icon: Leaf, 
        items: adminGhgSubItems,
        isActive: isAdminGhgActive
      });
    }
    
    // Add ESG if enabled
    if (moduleConfig.has_esg) {
      items.push({ 
        type: 'parent', 
        key: 'esg', 
        label: 'ESG', 
        icon: Globe, 
        items: esgSubItems,
        isActive: isEsgActive
      });
    }
    
    // Add remaining items
    items.push({ path: '/reports', label: 'Reports', icon: FileText });
    items.push({ path: '/users', label: 'Users', icon: Users });
    items.push({ path: '/audit-trails', label: 'Audit Trails', icon: History });
    
    return items;
  };

  // Build user items dynamically based on module config
  const buildUserItems = () => {
    const items = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/organization', label: 'Organization', icon: Building },
      { path: '/facilities', label: 'Facilities', icon: Building2 },
    ];
    
    // Add GHG if enabled
    if (moduleConfig.has_ghg) {
      items.push({ 
        type: 'parent', 
        key: 'adminGhg', 
        label: 'GHG', 
        icon: Leaf, 
        items: adminGhgSubItems,
        isActive: isAdminGhgActive
      });
    }
    
    // Add ESG if enabled
    if (moduleConfig.has_esg) {
      items.push({ 
        type: 'parent', 
        key: 'esg', 
        label: 'ESG', 
        icon: Globe, 
        items: esgSubItems,
        isActive: isEsgActive
      });
    }
    
    // Add Reports
    items.push({ path: '/reports', label: 'Reports', icon: FileText });
    
    return items;
  };

  const adminItems = buildAdminItems();
  const userItems = buildUserItems();

  const navItems = user?.role === 'super_admin' ? superAdminBaseItems : 
                   user?.role === 'admin' ? adminItems : userItems;

  // Render nested sub-menu for GHG Data or GHG Calculation
  const renderNestedSubMenu = (items, menuKey, borderColor) => {
    const isExpanded = expandedMenus[menuKey];
    return (
      <div className="ml-4 mt-1 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-stone-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="w-64 bg-white border-r border-stone-200 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-stone-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} alt="SustainRepo Logo" className="w-10 h-10 rounded-lg" />
          <div>
            <h1 className="text-xl font-heading font-bold text-text-primary">SustainRepo</h1>
            <p className="text-xs text-text-muted">ESG Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {user?.role === 'super_admin' && (
          <>
            {/* Regular super admin items */}
            {superAdminBaseItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:bg-stone-50'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}

            {/* GHG Parent Module - Collapsible */}
            <div className="pt-2">
              <button
                onClick={() => toggleMenu('superAdminGhg')}
                data-testid="nav-ghg-module"
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                  isSuperAdminGhgActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'text-text-secondary hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Leaf className="w-5 h-5" />
                  <span className="font-medium">GHG</span>
                </div>
                {expandedMenus.superAdminGhg ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              
              {expandedMenus.superAdminGhg && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-emerald-200 pl-2">
                  {/* Scopes & Categories - Direct Link */}
                  <Link
                    to="/super-admin/scopes-categories"
                    data-testid="nav-scopes-categories"
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                      isScopesCategoriesActive
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:bg-stone-50'
                    }`}
                  >
                    <FolderTree className="w-4 h-4" />
                    <span className="font-medium">Scopes & Categories</span>
                  </Link>

                  {/* GHG Data - Nested Collapsible */}
                  <div>
                    <button
                      onClick={() => toggleMenu('ghgData')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-sm ${
                        isGhgDataActive
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-text-secondary hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <HardDrive className="w-4 h-4" />
                        <span className="font-medium">GHG Data</span>
                      </div>
                      {expandedMenus.ghgData ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                    
                    {expandedMenus.ghgData && renderNestedSubMenu(ghgDataItems, 'ghgData', 'border-blue-200')}
                  </div>

                  {/* GHG Calculation - Nested Collapsible */}
                  <div>
                    <button
                      onClick={() => toggleMenu('ghgCalc')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-sm ${
                        isGhgCalcActive
                          ? 'bg-violet-50 text-violet-700 border border-violet-200'
                          : 'text-text-secondary hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <FlaskConical className="w-4 h-4" />
                        <span className="font-medium">GHG Calculation</span>
                      </div>
                      {expandedMenus.ghgCalc ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                    
                    {expandedMenus.ghgCalc && renderNestedSubMenu(ghgCalcItems, 'ghgCalc', 'border-violet-200')}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Admin and User navigation */}
        {user?.role !== 'super_admin' && navItems.map((item) => {
          // Render parent module with collapsible sub-items (e.g. GHG)
          if (item.type === 'parent') {
            const Icon = item.icon;
            const expanded = expandedMenus[item.key];
            return (
              <div key={item.key}>
                <button
                  onClick={() => toggleMenu(item.key)}
                  data-testid={`nav-parent-${item.key}`}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                    item.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-text-secondary hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expanded && item.items?.length > 0 && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-emerald-200 pl-2">
                    {item.items.map((sub) => {
                      // Handle nested subgroup (e.g., GHG Emissions with Scope 1, 2, 3)
                      if (sub.type === 'subgroup') {
                        const SubIcon = sub.icon;
                        const subExpanded = expandedMenus[sub.key];
                        const subGroupActive = sub.items?.some((s) => location.pathname.startsWith(s.path));
                        return (
                          <div key={sub.key}>
                            <button
                              onClick={() => toggleMenu(sub.key)}
                              data-testid={`nav-subgroup-${sub.key}`}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-sm ${
                                subGroupActive ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-text-secondary hover:bg-stone-50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <SubIcon className="w-4 h-4" />
                                <span className="font-medium">{sub.label}</span>
                              </div>
                              {subExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                            {subExpanded && sub.items?.length > 0 && (
                              <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-200 pl-2">
                                {sub.items.map((nested) => {
                                  const NestedIcon = nested.icon;
                                  const isNestedActive = location.pathname === nested.path || location.pathname.startsWith(nested.path + '/');
                                  return (
                                    <Link
                                      key={nested.path}
                                      to={nested.path}
                                      data-testid={`nav-${nested.label.toLowerCase().replace(/\s+/g, '-')}`}
                                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                                        isNestedActive ? 'bg-primary text-white' : 'text-text-secondary hover:bg-stone-50'
                                      }`}
                                    >
                                      <NestedIcon className="w-4 h-4" />
                                      <span className="font-medium">{nested.label}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }
                      
                      // Regular sub-item link
                      const SubIcon = sub.icon;
                      const isActive = location.pathname === sub.path || location.pathname.startsWith(sub.path + '/');
                      return (
                        <Link
                          key={sub.path}
                          to={sub.path}
                          data-testid={`nav-${sub.label.toLowerCase().replace(/\s+/g, '-')}`}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                            isActive ? 'bg-primary text-white' : 'text-text-secondary hover:bg-stone-50'
                          }`}
                        >
                          <SubIcon className="w-4 h-4" />
                          <span className="font-medium">{sub.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Render expandable group (legacy - kept for backwards compatibility)
          if (item.type === 'group') {
            const Icon = item.icon;
            const expanded = expandedMenus[item.key];
            const groupActive = item.items?.some((sub) => location.pathname.startsWith(sub.path));
            return (
              <div key={item.key}>
                <button
                  onClick={() => toggleMenu(item.key)}
                  data-testid={`nav-group-${item.key}`}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                    groupActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-text-secondary hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {expanded && item.items?.length > 0 && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-emerald-200 pl-2">
                    {item.items.map((sub) => {
                      const SubIcon = sub.icon;
                      const isActive = location.pathname === sub.path || location.pathname.startsWith(sub.path + '/');
                      return (
                        <Link
                          key={sub.path}
                          to={sub.path}
                          data-testid={`nav-${sub.label.toLowerCase().replace(/\s+/g, '-')}`}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                            isActive ? 'bg-primary text-white' : 'text-text-secondary hover:bg-stone-50'
                          }`}
                        >
                          <SubIcon className="w-4 h-4" />
                          <span className="font-medium">{sub.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-stone-50'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-stone-200 flex-shrink-0 bg-white">
        <div className="mb-3">
          <Link
            to="/profile"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              location.pathname === '/profile'
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:bg-stone-50'
            }`}
            data-testid="nav-profile"
          >
            <User className="w-5 h-5" />
            <span className="font-medium">Profile</span>
          </Link>
        </div>
        <div className="mb-4 p-4 bg-stone-50 rounded-lg">
          <p className="text-sm font-medium text-text-primary truncate">{user?.full_name}</p>
          <p className="text-xs text-text-muted break-all">{user?.email}</p>
          <p className="text-xs text-primary font-medium mt-1 capitalize">{user?.role?.replace('_', ' ')}</p>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full justify-start gap-3"
          data-testid="logout-button"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}