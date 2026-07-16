import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import sidebarConfig from '../config/sidebarConfig';
import { Button } from './ui/button';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO_FALLBACK = 'https://customer-assets.emergentagent.com/job_d67b5362-a184-47b7-81eb-abb9d39b89dd/artifacts/qllw2r8k_Logo_v3.png';

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

  if (item.adminOnly && userRole !== 'admin' && userRole !== 'super_admin') return null;
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
            onToggle: onToggle, location: location, hasAccess: hasAccess, userRole: userRole
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
  const { user, logout } = useAuth();
  const { hasAccess } = useModuleAccess();
  const [logoUrl, setLogoUrl] = useState(LOGO_FALLBACK);

  const buildExpanded = () => {
    const result = {};
    const check = (items) => {
      items.forEach(item => {
        if (item.children && isGroupActive(item, location)) result[item.key] = true;
        if (item.children) check(item.children);
      });
    };
    check(sidebarConfig);
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
      check(sidebarConfig);
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [location.pathname]);

  useEffect(() => {
    axios.get(`${API}/software-assets/logo`).then(r => { if (r.data?.url) setLogoUrl(r.data.url); }).catch(() => null);
  }, []);

  const toggleMenu = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  const handleLogout = () => { logout(); navigate('/login'); };

  if (!user) return null;
  const isSuperAdmin = user.role === 'super_admin';

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-white" data-testid="main-sidebar">
      <div className="flex h-16 items-center justify-center border-b border-stone-200 px-4">
        <Link to={isSuperAdmin ? '/super-admin' : '/dashboard'}>
          <img src={logoUrl} alt="Logo" className="h-10 w-auto" onError={(e) => { e.target.src = LOGO_FALLBACK; }} />
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" data-testid="sidebar-nav">
        {isSuperAdmin ? (
          <Link to="/super-admin" className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${location.pathname === '/super-admin' ? 'bg-emerald-100 text-emerald-900' : 'text-stone-600 hover:bg-stone-50'}`} data-testid="sidebar-super-admin">
            Super Admin Panel
          </Link>
        ) : (
          sidebarConfig.map(item => (
            <MenuItem key={item.key} item={item} depth={0} expanded={expanded} onToggle={toggleMenu} location={location} hasAccess={hasAccess} userRole={user.role} />
          ))
        )}
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
