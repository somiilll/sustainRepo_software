import sidebarConfig from './sidebarConfig';

const flattenNavigation = (items, entries = []) => {
  items.forEach((item) => {
    if (item.path) entries.push({ key: item.key, label: item.label, path: item.path, accessScope: item.accessScope || 'entitlement' });
    if (item.children) flattenNavigation(item.children, entries);
  });
  return entries;
};

const navigationEntries = flattenNavigation(sidebarConfig).sort((left, right) => right.path.length - left.path.length);

export const isCoreNavigationKey = (key) => navigationEntries.some((entry) => entry.key === key && entry.accessScope === 'core');

export const getNavigationModuleForPath = (pathname) => navigationEntries.find((entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`)) || null;

const USER_ENABLED_MODULES = ['dashboard', 'environment', 'social', 'governance', 'workflow', 'reporting', 'cbam', 'profile'];

export const isUserRestrictedKey = (role, key) => role === 'user' && (key === 'environment.ghg.base_year' || key === 'workflow.tracker' || !USER_ENABLED_MODULES.includes(String(key).split('.')[0]));

export const isGhgOnlyCustomer = (hasAccess) => hasAccess('environment.ghg') && !hasAccess('social') && !hasAccess('governance') && !hasAccess('reporting');
