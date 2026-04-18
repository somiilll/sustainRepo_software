import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { LayoutDashboard, Building2, Gauge, FileText, Users, LogOut, Building, UserCog, Flame, Globe, User, Calculator, Layers, Database, Ruler, Settings2, TreeDeciduous, Thermometer, FileCode2, CalendarClock, FolderTree, Beaker, Variable, FileDigit, Code2, GitFork, Scale, FormInput } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const superAdminItems = [
    { path: '/super-admin', label: 'Super Dashboard', icon: Globe },
    { path: '/super-admin/organizations', label: 'Organizations', icon: Building },
    { path: '/super-admin/admins', label: 'Admins', icon: UserCog },
    { path: '/super-admin/fuel-database', label: 'Fuel Database', icon: Database },
    { path: '/super-admin/units', label: 'Units', icon: Ruler },
    { path: '/super-admin/formulas', label: 'Formulas', icon: Calculator },
    { path: '/super-admin/emission-configuration', label: 'Emission Config', icon: Settings2 },
    { path: '/super-admin/scopes-categories', label: 'Scopes & Categories', icon: FolderTree },
    { path: '/super-admin/calc-sandbox', label: 'Calc Sandbox', icon: Beaker },
    { path: '/super-admin/variable-registry', label: 'Variable Registry', icon: Variable },
    { path: '/super-admin/property-values', label: 'Property Values', icon: FileDigit },
    { path: '/super-admin/formula-builder', label: 'Formula Builder', icon: Code2 },
    { path: '/super-admin/decision-trees', label: 'Decision Trees', icon: GitFork },
    { path: '/super-admin/calc-engine-units', label: 'Calc Engine Units', icon: Scale },
    { path: '/super-admin/input-field-mapping', label: 'Input Field Mapping', icon: FormInput },
    { path: '/super-admin/sectors', label: 'Sectors', icon: Layers },
    { path: '/super-admin/gwp-config', label: 'GWP Config', icon: Thermometer },
    { path: '/super-admin/process-templates', label: 'Process Templates', icon: FileCode2 },
  ];

  const adminItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/organization', label: 'Organization', icon: Building },
    { path: '/facilities', label: 'Facilities', icon: Building2 },
    { path: '/emissions', label: 'GHG Emissions', icon: Gauge },
    { path: '/sinks', label: 'GHG Sinks', icon: TreeDeciduous },
    { path: '/base-year-emissions', label: 'Base Year Emissions', icon: CalendarClock },
    { path: '/reports', label: 'Reports', icon: FileText },
    { path: '/users', label: 'Users', icon: Users },
  ];

  const userItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/organization', label: 'Organization', icon: Building },
    { path: '/facilities', label: 'Facilities', icon: Building2 },
    { path: '/emissions', label: 'GHG Emissions', icon: Gauge },
    { path: '/sinks', label: 'GHG Sinks', icon: TreeDeciduous },
    { path: '/base-year-emissions', label: 'Base Year Emissions', icon: CalendarClock },
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
        {navItems.map((item) => {
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
              <Icon className="w-5 h-5" />
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