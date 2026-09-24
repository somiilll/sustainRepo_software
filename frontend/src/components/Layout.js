import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { getNavigationModuleForPath } from '../config/moduleNavigationAccess';
import { ModuleUnavailableState } from './ModuleUnavailableState';
import { AlertTriangle, Menu, X } from 'lucide-react';
import { isSupplierLockedRoute, SUPPLIER_PREMIUM_TOOLTIP } from '../config/supplierNavigation';
import { ContactSalesDialog } from './ContactSalesDialog';


const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Routes that suppliers are allowed to access
const SUPPLIER_ALLOWED_ROUTES = [
  '/dashboard',
  '/profile',
  '/facilities',
  '/supplier-assessment/supplier',
  '/supplier-assessment/questionnaire',
  '/supplier-assessment/documents/review',
  '/supplier-assessment/training',
  '/supplier-assessment/emissions',
  '/ghg/scope1',
  '/ghg/scope2',
  '/ghg/scope3',
  '/ghg/biogenic',
  '/ghg',
];
const SUPPLIER_MODULE_ROUTES = [
  { path: '/supplier-assessment/documents/review', module: 'documents' },
  { path: '/supplier-assessment/training', module: 'training' },
];

export default function Layout() {
  const { user, token, getAuthHeader } = useAuth();
  const { hasAccess, loading: moduleAccessLoading } = useModuleAccess();
  const [subscriptionWarning, setSubscriptionWarning] = useState(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [contactSalesOpen, setContactSalesOpen] = useState(false);
  const [supplierModules, setSupplierModules] = useState(null);
  const location = useLocation();
  
  // Check if user is a supplier
  const isSupplier = user?.user_type === 'supplier' || user?.org_type === 'supplier';
  
  // Check if current route is allowed for suppliers
  const isAllowedRoute = SUPPLIER_ALLOWED_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  );
  const isExplicitlyLockedSupplierRoute = isSupplierLockedRoute(location.pathname);
  const isSupplierAssessmentRoute = location.pathname.startsWith('/supplier-assessment');
  const isSupplierAssessmentWorkspace = isSupplier && isSupplierAssessmentRoute;
  const supplierGhgIsAssigned = supplierModules?.includes('ghg');
  const requiredSupplierModule = SUPPLIER_MODULE_ROUTES.find(({ path }) => location.pathname === path || location.pathname.startsWith(`${path}/`))?.module;
  const isDisabledSupplierModuleRoute = isSupplier && Array.isArray(supplierModules) && requiredSupplierModule && !supplierModules.includes(requiredSupplierModule);
  const isSupplierGhgPremiumRoute = location.pathname === '/facilities' || location.pathname.startsWith('/ghg');
  const isUnassignedSupplierGhgPremiumRoute = isSupplier && supplierModules !== null && !supplierGhgIsAssigned && isSupplierGhgPremiumRoute;
  const activeNavigationModule = getNavigationModuleForPath(location.pathname);
  const isOrganisationModuleUnavailable = !isSupplier && user?.role !== 'super_admin' && !moduleAccessLoading && activeNavigationModule && !hasAccess(activeNavigationModule.key);

  useEffect(() => {
    // Only check subscription for admin and user roles (not super_admin)
    if (user && (user.role === 'admin' || user.role === 'user')) {
      checkSubscription();
    }
  }, [user]);

  useEffect(() => {
    if (!token || !isSupplier) {
      setSupplierModules(null);
      return;
    }
    axios.get(`${API}/supplier-assessment/my-assessment`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setSupplierModules((response.data.assessment_modules || []).map((module) => module.code)))
      .catch(() => setSupplierModules(null));
  }, [token, isSupplier]);

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
      {mobileSidebarOpen && <button type="button" aria-label="Close navigation menu" className="fixed inset-0 z-30 bg-stone-950/20 lg:hidden" onClick={() => setMobileSidebarOpen(false)} data-testid="mobile-sidebar-backdrop" />}
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <button type="button" aria-label="Open navigation menu" className="fixed left-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-700 shadow-sm transition-colors hover:bg-stone-50 lg:hidden" onClick={() => setMobileSidebarOpen(true)} data-testid="mobile-sidebar-open-button"><Menu className="h-5 w-5" /></button>
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
        <div className={`flex-1 overflow-y-auto ${isSupplierAssessmentWorkspace ? 'bg-white' : ''}`}>
            <div
              className={
                isDashboardPage
                  ? 'w-full px-4 pt-14 pb-4 lg:px-5 lg:pt-0'
                  : isSupplierAssessmentRoute
                    ? 'w-full px-4 pb-4 pt-14 lg:px-5 lg:pt-4'
                    : 'w-full px-4 pb-4 pt-14 lg:px-5 lg:pt-4'
              }
            >
            {/* Show locked overlay for suppliers on restricted routes */}
            {isDisabledSupplierModuleRoute ? (
              <Navigate to="/supplier-assessment/supplier" replace />
            ) : isSupplier && (isExplicitlyLockedSupplierRoute || isUnassignedSupplierGhgPremiumRoute || !isAllowedRoute) ? (
              <ModuleUnavailableState title={SUPPLIER_PREMIUM_TOOLTIP.title} description={SUPPLIER_PREMIUM_TOOLTIP.description} onContactSales={() => setContactSalesOpen(true)}>
                <Outlet />
              </ModuleUnavailableState>
            ) : isOrganisationModuleUnavailable ? (
              <ModuleUnavailableState moduleName={activeNavigationModule.label} description={`${activeNavigationModule.label} is not enabled for your organisation. Contact your organisation administrator to request access.`} onContactSales={() => setContactSalesOpen(true)}><Outlet /></ModuleUnavailableState>
            ) : (
              <Outlet />
            )}
          </div>
        </div>

      </main>
      <ContactSalesDialog open={contactSalesOpen} onOpenChange={setContactSalesOpen} user={user} getAuthHeader={getAuthHeader} />
    </div>
  );
}