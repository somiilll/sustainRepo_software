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