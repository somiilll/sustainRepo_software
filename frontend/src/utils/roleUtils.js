/**
 * Role-based Access Control Utilities
 * 
 * Shared utilities for checking user roles and permissions across the app.
 * Used by both ESG Metrics and Reporting modules.
 */

// Role constants
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
};

/**
 * Check if user has admin privileges (admin or super_admin)
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const isAdmin = (user) => {
  if (!user) return false;
  const role = user.role?.toLowerCase();
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
};

/**
 * Check if user is super admin
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const isSuperAdmin = (user) => {
  if (!user) return false;
  return user.role?.toLowerCase() === ROLES.SUPER_ADMIN;
};

/**
 * Check if user is a regular user (not admin)
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const isRegularUser = (user) => {
  if (!user) return false;
  return !isAdmin(user);
};

/**
 * Get user's role label for display
 * @param {Object} user - User object from AuthContext
 * @returns {string}
 */
export const getRoleLabel = (user) => {
  if (!user?.role) return 'User';
  
  const roleLabels = {
    [ROLES.SUPER_ADMIN]: 'Super Admin',
    [ROLES.ADMIN]: 'Admin',
    [ROLES.USER]: 'User',
  };
  
  return roleLabels[user.role.toLowerCase()] || 'User';
};

/**
 * Permissions by feature
 */
export const PERMISSIONS = {
  // Assignment permissions
  CAN_ASSIGN_TASKS: (user) => isAdmin(user),
  CAN_REASSIGN_TASKS: (user) => isAdmin(user),
  CAN_VIEW_ALL_ASSIGNMENTS: (user) => isAdmin(user),
  CAN_VIEW_ORG_PROGRESS: (user) => isAdmin(user),
  
  // Tracker permissions
  CAN_ACCESS_FULL_TRACKER: (user) => isAdmin(user),
  CAN_SEND_REMINDERS: (user) => isAdmin(user),
  
  // User management
  CAN_MANAGE_USERS: (user) => isAdmin(user),
  
  // Data entry - all users can do this for their assigned items
  CAN_ENTER_DATA: () => true,
  CAN_SAVE_DRAFT: () => true,
};

export default {
  ROLES,
  isAdmin,
  isSuperAdmin,
  isRegularUser,
  getRoleLabel,
  PERMISSIONS,
};
