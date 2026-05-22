import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { LayoutDashboard, Building2, Gauge, FileText, Users, LogOut, Building, UserCog, Flame, Globe, User, Calculator, Layers, Database, Ruler, Settings2, TreeDeciduous, Thermometer, FileCode2, CalendarClock, FolderTree, Beaker, Variable, Code2, GitFork, Scale, FormInput, Link2, ChevronDown, ChevronRight, FlaskConical, HardDrive, History, FileSpreadsheet, Upload, DollarSign, ClipboardCheck } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, getAuthHeader } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState({ ghgCalc: true, ghgData: true, ghg: true });
  const [enabledAccess, setEnabledAccess] = useState([]);
  const [approvalEnabled, setApprovalEnabled] = useState(false);

  // Pull the current org's scope-access + approval flag once on mount so
  // the GHG sub-menu only shows scopes the org actually has.
  useEffect(() => {
    let cancelled = false;
    if (!user || user.role === 'super_admin' || !user.organization_id) return;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
        if (cancelled) return;
        setEnabledAccess(data?.enabled_access || []);
        setApprovalEnabled(!!data?.approval_workflow_enabled);
      } catch {
        /* ignore — fall back to no access */
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

  // GHG Data sub-module items
  const ghgDataItems = [
    { path: '/super-admin/fuel-database', label: 'Fuel Database', icon: Database },
    { path: '/super-admin/scope3-ef', label: 'Scope 3 EF', icon: FileSpreadsheet },
    { path: '/super-admin/units', label: 'Units', icon: Ruler },
    { path: '/super-admin/calc-engine-units', label: 'Calc Engine Units', icon: Scale },
    { path: '/super-admin/gwp-config', label: 'GWP Config', icon: Thermometer },
    { path: '/super-admin/currency-conversion', label: 'Currency Conversion', icon: DollarSign },
  ];

  // GHG Emissions Calculations sub-module items
  const ghgCalcItems = [
    { path: '/super-admin/variable-registry', label: 'Variable Registry', icon: Variable },
    { path: '/super-admin/property-sources', label: 'Property Sources', icon: Link2 },
    { path: '/super-admin/formula-builder', label: 'Formula Builder', icon: Code2 },
    { path: '/super-admin/decision-trees', label: 'Decision Trees', icon: GitFork },
    { path: '/super-admin/input-field-mapping', label: 'Input Field Mapping', icon: FormInput },
    { path: '/super-admin/calc-sandbox', label: 'Calculation Sandbox', icon: Beaker },
  ];

  // Check if any module item is active
  const isGhgDataActive = ghgDataItems.some(item => location.pathname === item.path);
  const isGhgCalcActive = ghgCalcItems.some(item => location.pathname === item.path);

  const superAdminItems = [
    { path: '/super-admin', label: 'Super Dashboard', icon: Globe },
    { path: '/super-admin/organizations', label: 'Organizations', icon: Building },
    { path: '/super-admin/admins', label: 'Admins', icon: UserCog },
    { path: '/super-admin/scopes-categories', label: 'Scopes & Categories', icon: FolderTree },
    { path: '/super-admin/sectors', label: 'Sectors', icon: Layers },
  ];

  // Visibility flags driven by the org's enabled_access list.
  const hasScope12 = enabledAccess.includes('scope1_2') || enabledAccess.includes('scope1_2_3');
  const hasScope123 = enabledAccess.includes('scope1_2_3');

  // GHG Emissions sub-menu items (per-org filtered).
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

  const adminItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/organization', label: 'Organization', icon: Building },
    { path: '/facilities', label: 'Facilities', icon: Building2 },
    { type: 'group', key: 'ghg', label: 'GHG Emissions', icon: Gauge, items: ghgEmissionsItems },
    { path: '/bulk-upload', label: 'Bulk Upload', icon: Upload },
    { path: '/sinks', label: 'GHG Sinks', icon: TreeDeciduous },
    { path: '/base-year-emissions', label: 'Base Year Emissions and Target Setting', icon: CalendarClock },
    { path: '/reports', label: 'Reports', icon: FileText },
    { path: '/users', label: 'Users', icon: Users },
    { path: '/audit-trails', label: 'Audit Trails', icon: History },
  ];

  const userItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/organization', label: 'Organization', icon: Building },
    { path: '/facilities', label: 'Facilities', icon: Building2 },
    { type: 'group', key: 'ghg', label: 'GHG Emissions', icon: Gauge, items: ghgEmissionsItems },
    { path: '/bulk-upload', label: 'Bulk Upload', icon: Upload },
    { path: '/sinks', label: 'GHG Sinks', icon: TreeDeciduous },
    { path: '/base-year-emissions', label: 'Base Year Emissions and Target Setting', icon: CalendarClock },
    { path: '/reports', label: 'Reports', icon: FileText },
  ];

  const navItems = user?.role === 'super_admin' ? superAdminItems : 
                   user?.role === 'admin' ? adminItems : userItems;

  return (
    <aside className="w-64 bg-white border-r border-stone-200 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-stone-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} alt="SustainRepo Logo" className="w-10 h-10 rounded-lg" />
          <div>
            <h1 className="text-xl font-heading font-bold text-text-primary">SustainRepo</h1>
            <p className="text-xs text-text-muted">GHG Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {user?.role === 'super_admin' && (
          <>
            {/* Regular super admin items */}
            {superAdminItems.map((item) => {
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

            {/* GHG Data Module - Collapsible */}
            <div className="pt-2">
              <button
                onClick={() => toggleMenu('ghgData')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                  isGhgDataActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-text-secondary hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <HardDrive className="w-5 h-5" />
                  <span className="font-medium">GHG Data</span>
                </div>
                {expandedMenus.ghgData ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              
              {expandedMenus.ghgData && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-200 pl-2">
                  {ghgDataItems.map((item) => {
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
              )}
            </div>

            {/* GHG Emissions Calculations Module - Collapsible */}
            <div className="pt-2">
              <button
                onClick={() => toggleMenu('ghgCalc')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                  isGhgCalcActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'text-text-secondary hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FlaskConical className="w-5 h-5" />
                  <span className="font-medium">GHG Calculations</span>
                </div>
                {expandedMenus.ghgCalc ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              
              {expandedMenus.ghgCalc && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-emerald-200 pl-2">
                  {ghgCalcItems.map((item) => {
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
              )}
            </div>
          </>
        )}

        {/* Admin and User navigation */}
        {user?.role !== 'super_admin' && navItems.map((item) => {
          // Render expandable group (e.g. GHG Emissions sub-links).
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