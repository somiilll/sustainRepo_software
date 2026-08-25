export const SUPPLIER_PREMIUM_TOOLTIP = {
  title: 'Premium Module',
  description: 'Subscribe to unlock this module and access advanced ESG management features for your organization.',
};

export const SUPPLIER_LOCKED_MENU_KEYS = new Set([
  'dashboard',
  'environment.ghg.base_year',
  'environment.ghg.analysis',
]);

export const SUPPLIER_LOCKED_ROUTES = [
  '/dashboard',
  '/ghg/base-year',
  '/ghg/analysis',
];

export const isSupplierLockedMenuItem = (key) => SUPPLIER_LOCKED_MENU_KEYS.has(key);

export const isSupplierLockedRoute = (pathname) => SUPPLIER_LOCKED_ROUTES.some(
  (route) => pathname === route || pathname.startsWith(`${route}/`),
);