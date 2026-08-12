import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import sidebarConfig from '../config/sidebarConfig';
import { Button } from './ui/button';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import superAdminSidebarConfig from '../config/superAdminSidebarConfig';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO_FALLBACK = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png';

const ENV_MODULE_ICONS = { power: 'Zap', water: 'Droplets', steam: 'Cloud', energy: 'Zap', waste: 'Trash2' };
const SOCIAL_MODULE_ICONS = { workforce: 'Users2', health_safety: 'HeartPulse', community: 'Building2', human_rights: 'Scale' };
const GOVERNANCE_MODULE_ICONS = { board: 'Shield', ethics: 'Scale', compliance: 'FileCheck', risk: 'AlertTriangle' };

function _sectionIcons(section) {
  if (section === 'social') return SOCIAL_MODULE_ICONS;
  if (section === 'governance') return GOVERNANCE_MODULE_ICONS;
  return ENV_MODULE_ICONS;
}

function getIcon(name) {
  return LucideIcons[name] || null;
}

function isActive(path, loc) {
  if (!path) return false;
  return loc.pathname === path || loc.pathname.startsWith(path + '/');
}

function isGroupActive(item, loc) {
  if (item.path && isActive(item.path, loc)) return true;
  if (item.children) return item.children.some(function(c) { return isGroupActive(c, loc); });
  return false;
}

function MenuItem(props) {
  var item = props.item;
  var depth = props.depth;
  var expanded = props.expanded;
  var onToggle = props.onToggle;
  var location = props.location;
  var hasAccess = props.hasAccess;
  var userRole = props.userRole;
  var userType = props.userType;
  var orgType = props.orgType;

  // Check adminOnly
  if (item.adminOnly && userRole !== 'admin' && userRole !== 'super_admin') return null;
  // Check supplierOnly - only show to supplier users
  if (item.supplierOnly && userType !== 'supplier' && orgType !== 'supplier') return null;
  // Hide admin supplier items from supplier users
  if (!item.supplierOnly && item.key?.startsWith('supplier_assessment.') && (userType === 'supplier' || orgType === 'supplier')) return null;
  if (!hasAccess(item.key)) return null;

  var hasChildren = item.children && item.children.length > 0;
  var active = item.path ? isActive(item.path, location) : false;
  var groupActive = hasChildren && isGroupActive(item, location);
  var isOpen = expanded[item.key] || false;
  var Icon = item.icon ? getIcon(item.icon) : null;
  var padClass = depth === 0 ? 'pl-3' : depth === 1 ? 'pl-8' : 'pl-12';

  if (hasChildren) {
    return React.createElement('div', null,
      React.createElement('button', {
        type: 'button',
        onClick: function() { onToggle(item.key); },
        className: 'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ' + padClass + ' ' + (groupActive ? 'bg-emerald-50 text-emerald-800' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'),
        'data-testid': 'sidebar-' + item.key,
      },
        React.createElement('span', { className: 'flex items-center gap-2.5' },
          Icon ? React.createElement(Icon, { className: 'h-4 w-4 shrink-0' }) : null,
          React.createElement('span', null, item.label)
        ),
        isOpen ? React.createElement(ChevronDown, { className: 'h-3.5 w-3.5' }) : React.createElement(ChevronRight, { className: 'h-3.5 w-3.5' })
      ),
      isOpen ? React.createElement('div', { className: 'mt-0.5 space-y-0.5' },
        item.children.map(function(child) {
          return React.createElement(MenuItem, {
            key: child.key, item: child, depth: depth + 1, expanded: expanded,
            onToggle: onToggle, location: location, hasAccess: hasAccess, userRole: userRole,
            userType: userType, orgType: orgType
          });
        })
      ) : null
    );
  }

  return React.createElement(Link, {
    to: item.path,
    className: 'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ' + padClass + ' ' + (active ? 'bg-emerald-100 text-emerald-900' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'),
    'data-testid': 'sidebar-' + item.key,
  },
    Icon ? React.createElement(Icon, { className: 'h-4 w-4 shrink-0' }) : null,
    React.createElement('span', null, item.label)
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { hasAccess } = useModuleAccess();
  const [logoUrl, setLogoUrl] = useState(LOGO_FALLBACK);
  const [resolvedConfig, setResolvedConfig] = useState(null);

  const isSuperAdmin = user?.role === 'super_admin';

  // Fetch resolved org config for dynamic environment sidebar
  useEffect(() => {
    if (!token || isSuperAdmin) return;
    axios.get(`${API}/sustainability-config/resolved`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => setResolvedConfig(r.data)).catch(() => null);
  }, [token, isSuperAdmin]);

  // Build the active sidebar config, replacing section children if org has custom config
  const activeConfig = useMemo(() => {
    if (isSuperAdmin) return superAdminSidebarConfig;
    if (!resolvedConfig?.has_org_config) return sidebarConfig;

    // Helper: build dynamic module children for a section
    const buildSectionChildren = (sectionKey, modules, routePrefix, defaultChildren, keepStatic) => {
      if (!modules || modules.length === 0) return null; // no override, keep default
      const icons = _sectionIcons(sectionKey);
      const children = keepStatic ? [...keepStatic] : [];
      modules.forEach(mod => {
        children.push({
          key: `${sectionKey}.${mod.module_code}`,
          label: mod.module_name,
          icon: icons[mod.module_code] || 'Leaf',
          children: [
            { key: `${sectionKey}.${mod.module_code}.kpi`, label: 'KPI', icon: 'FileText', path: `${routePrefix}/${mod.module_code}` },
            { key: `${sectionKey}.${mod.module_code}.analysis`, label: 'Analysis', icon: 'BarChart3', path: `${routePrefix}/${mod.module_code}/analysis` },
          ],
        });
      });
      return children;
    };

    // Environment: keep GHG Module, replace rest with org modules
    const envModules = resolvedConfig.modules || [];

    const ghgStatic = [
      { key: 'environment.ghg', label: 'GHG Module', icon: 'Cloud', children: [
          { key: 'environment.ghg.logs', label: 'Logs', icon: 'FileText', path: '/ghg' },
          { key: 'environment.ghg.sinks', label: 'Sinks', icon: 'TreeDeciduous', path: '/sinks' },
          { key: 'environment.ghg.base_year', label: 'Base Year', icon: 'CalendarDays', path: '/ghg/base-year' },
          { key: 'environment.ghg.analysis', label: 'Analysis', icon: 'BarChart3', path: '/ghg/analysis' },
      ] },
    ];

    const envChildren = envModules.length > 0 ? buildSectionChildren('environment', envModules, '/environment', null, ghgStatic) : null;

    return sidebarConfig.map(item => {
      if (item.key === 'environment' && envChildren) return { ...item, children: envChildren };
      return item;
    });
  }, [isSuperAdmin, resolvedConfig]);

  const buildExpanded = () => {
    const result = {};
    const check = (items) => {
      items.forEach(item => {
        if (item.children && isGroupActive(item, location)) result[item.key] = true;
        if (item.children) check(item.children);
      });
    };
    check(activeConfig);
    return result;
  };

  const [expanded, setExpanded] = useState(buildExpanded);

  useEffect(() => {
    setExpanded(prev => {
      const updates = {};
      const check = (items) => {
        items.forEach(item => {
          if (item.children && isGroupActive(item, location) && !prev[item.key]) updates[item.key] = true;
          if (item.children) check(item.children);
        });
      };
      check(activeConfig);
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [location.pathname, activeConfig]);

  useEffect(() => {
    axios.get(`${API}/software-assets/logo`).then(r => { if (r.data?.url) setLogoUrl(r.data.url); }).catch(() => null);
  }, []);

  const toggleMenu = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  const handleLogout = () => { logout(); navigate('/login'); };

  if (!user) return null;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-white" data-testid="main-sidebar">
      <div className="flex h-16 items-center border-b border-stone-200 px-4">
        <Link to={isSuperAdmin ? '/super-admin' : '/dashboard'} className="flex items-center gap-2.5">
          <img src={logoUrl} alt="Logo" className="h-9 w-auto" onError={(e) => { e.target.src = LOGO_FALLBACK; }} />
          <span className="text-lg font-bold text-stone-800 tracking-tight">SustainRepo</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" data-testid="sidebar-nav">
        {activeConfig.map(item => (
          <MenuItem key={item.key} item={item} depth={0} expanded={expanded} onToggle={toggleMenu} location={location} hasAccess={hasAccess} userRole={user.role} userType={user.user_type} orgType={user.org_type} />
        ))}
      </nav>

      <div className="border-t border-stone-200 p-3">
        <div className="mb-2 truncate px-1 text-xs text-stone-500" data-testid="sidebar-user-email">{user.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-stone-600 hover:text-red-600" onClick={handleLogout} data-testid="sidebar-logout">
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
