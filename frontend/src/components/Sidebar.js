import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { LayoutDashboard, Building2, Gauge, FileText, Users, LogOut, Leaf } from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/facilities', label: 'Facilities', icon: Building2 },
    { path: '/emissions', label: 'Emissions', icon: Gauge },
    { path: '/reports', label: 'Reports', icon: FileText },
  ];

  if (user?.role === 'admin') {
    navItems.push({ path: '/users', label: 'User Management', icon: Users });
  }

  return (
    <aside className="w-64 bg-white border-r border-stone-200 flex flex-col">
      <div className="p-6 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg">
            <Leaf className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold text-text-primary">EcoTrack</h1>
            <p className="text-xs text-text-muted">GHG Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
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

      <div className="p-4 border-t border-stone-200">
        <div className="mb-4 p-4 bg-stone-50 rounded-lg">
          <p className="text-sm font-medium text-text-primary">{user?.full_name}</p>
          <p className="text-xs text-text-muted">{user?.email}</p>
          <p className="text-xs text-primary font-medium mt-1 capitalize">{user?.role}</p>
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