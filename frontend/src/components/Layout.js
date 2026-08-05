import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, X, Lock } from 'lucide-react';


const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Routes that suppliers are allowed to access
const SUPPLIER_ALLOWED_ROUTES = [
  '/dashboard',
  '/profile',
  '/supplier-assessment/supplier',
  '/supplier-assessment/questionnaire',
  '/ghg/scope1',
  '/ghg/scope2',
  '/ghg/scope3',
  '/ghg/biogenic',
  '/ghg',
];

// Locked overlay for supplier users
const SupplierLockedOverlay = ({ children }) => (
  <div className="relative min-h-[500px]">
    {/* Blurred background for sneak peek */}
    <div className="absolute inset-0 overflow-hidden">
      <div className="filter blur-sm opacity-40 pointer-events-none select-none">
        {children}
      </div>
    </div>
    
    {/* Lock overlay */}
    <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/60 to-white/80 backdrop-blur-[2px] flex items-center justify-center z-10">
      <div className="text-center p-8 max-w-md">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-stone-700 mb-2">
          Premium Module
        </h3>
        <p className="text-stone-500 text-sm mb-4">
          Subscribe to unlock this module and access advanced ESG management features.
        </p>
        <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
          Contact Sales
        </button>
      </div>
    </div>
  </div>
);

export default function Layout() {
  const { user, getAuthHeader } = useAuth();
  const [subscriptionWarning, setSubscriptionWarning] = useState(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const location = useLocation();
  
  // Check if user is a supplier
  const isSupplier = user?.user_type === 'supplier' || user?.org_type === 'supplier';
  
  // Check if current route is allowed for suppliers
  const isAllowedRoute = SUPPLIER_ALLOWED_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  useEffect(() => {
    // Only check subscription for admin and user roles (not super_admin)
    if (user && (user.role === 'admin' || user.role === 'user')) {
      checkSubscription();
    }
  }, [user]);

  const checkSubscription = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: getAuthHeader()
      });
      
      const org = response.data;
      if (org.subscription_expires_at) {
        const expiryDate = new Date(org.subscription_expires_at);
        const today = new Date();
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        // Show warning if subscription expires within 30 days
        if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
          setSubscriptionWarning({
            daysLeft: daysUntilExpiry,
            expiryDate: expiryDate.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })
          });
        } else if (daysUntilExpiry <= 0) {
          setSubscriptionWarning({
            daysLeft: 0,
            expiryDate: expiryDate.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            }),
            expired: true
          });
        }
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const isDashboardPage =
    location.pathname.includes('/dashboard') ||
    location.pathname.endsWith('/analysis');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Subscription Warning Banner */}
        {subscriptionWarning && !warningDismissed && (
          <div className={`px-4 py-3 flex items-center justify-between ${
            subscriptionWarning.expired 
              ? 'bg-red-500 text-white' 
              : 'bg-yellow-400 text-yellow-900'
          }`}>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">
                {subscriptionWarning.expired ? (
                  <>Your subscription has expired on {subscriptionWarning.expiryDate}. Please contact your administrator to renew.</>
                ) : (
                  <>Your subscription is ending on {subscriptionWarning.expiryDate} ({subscriptionWarning.daysLeft} days remaining). Please contact your administrator to renew.</>
                )}
              </span>
            </div>
            <button 
              onClick={() => setWarningDismissed(true)}
              className={`p-1 rounded-full hover:bg-black/10 transition-colors ${
                subscriptionWarning.expired ? 'hover:bg-white/20' : ''
              }`}
              aria-label="Dismiss warning"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
            <div
              className={
                isDashboardPage
                  ? 'w-full px-4 pt-0 pb-4 lg:px-5'
                  : 'w-full px-4 py-4 lg:px-5'
              }
            >
            {/* Show locked overlay for suppliers on restricted routes */}
            {isSupplier && !isAllowedRoute ? (
              <SupplierLockedOverlay>
                <Outlet />
              </SupplierLockedOverlay>
            ) : (
              <Outlet />
            )}
          </div>
        </div>

      </main>
    </div>
  );
}