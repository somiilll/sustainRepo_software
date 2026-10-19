/**
 * Tracker Module Utility Functions
 */

import { CATEGORY_STATUS } from './constants';

/**
 * Get assignment info for a category (checks if partially assigned and gets all assignees)
 */
export const getAssignmentInfo = (assignments, categories, category, subcategory = null) => {
  // Get all subcategories for this category
  const subcats = categories.filter(c => c.category === category && c.subcategory);
  const hasSubcategories = subcats.length > 0;
  
  if (!subcategory && hasSubcategories) {
    // Parent category - check if all subcategories are assigned
    const assignedSubcats = subcats.filter(sc => 
      assignments.some(a => a.category === category && a.subcategory === sc.subcategory)
    );
    
    const isPartiallyAssigned = assignedSubcats.length > 0 && assignedSubcats.length < subcats.length;
    const isFullyAssigned = assignedSubcats.length === subcats.length;
    
    // Get all unique assignees across all subcategories
    const allAssignees = assignments.filter(a => 
      a.category === category && a.subcategory
    );
    const uniqueAssignees = extractUniqueAssignees(allAssignees);
    
    return { 
      isPartiallyAssigned, 
      isFullyAssigned,
      assignees: uniqueAssignees, 
      hasSubcategories,
      totalSubcats: subcats.length,
      assignedSubcatsCount: assignedSubcats.length
    };
  } else {
    // Subcategory or category without subcategories
    const categoryAssignments = assignments.filter(a => 
      a.category === category && 
      (subcategory ? a.subcategory === subcategory : !a.subcategory)
    );
    
    const uniqueAssignees = extractUniqueAssignees(categoryAssignments);
    
    return { 
      isPartiallyAssigned: false, 
      isFullyAssigned: uniqueAssignees.length > 0,
      assignees: uniqueAssignees, 
      hasSubcategories: false 
    };
  }
};

/**
 * Extract unique assignees from a list of assignments
 */
export const extractUniqueAssignees = (assignments) => {
  const uniqueAssignees = [];
  const seenIds = new Set();
  
  assignments.forEach(a => {
    // Handle new multi-assignee format (assignees array)
    if (a.assignees && Array.isArray(a.assignees)) {
      a.assignees.forEach(assignee => {
        if (assignee.user_id && !seenIds.has(assignee.user_id)) {
          seenIds.add(assignee.user_id);
          uniqueAssignees.push({
            id: assignee.user_id,
            name: assignee.user_name || assignee.name,
            email: assignee.user_email || assignee.email,
            role: assignee.role || 'editor',
          });
        }
      });
    }
    // Fallback to legacy single-user format
    else if (a.assigned_to_user_id && !seenIds.has(a.assigned_to_user_id)) {
      seenIds.add(a.assigned_to_user_id);
      uniqueAssignees.push({
        id: a.assigned_to_user_id,
        name: a.assigned_to_name,
        email: a.assigned_to_email,
        role: 'editor', // Legacy assignments default to editor
      });
    }
  });
  
  return uniqueAssignees;
};

/**
 * Get category status based on assignment and completion
 */
export const getCategoryStatus = (assignmentInfo, completionStats) => {
  const { completed, total } = completionStats || { completed: 0, total: 0 };
  
  if (!assignmentInfo.hasSubcategories) {
    if (assignmentInfo.assignees.length === 0) return CATEGORY_STATUS.UNASSIGNED;
    if (total > 0 && completed === total) return CATEGORY_STATUS.COMPLETED;
    if (completed > 0) return CATEGORY_STATUS.IN_PROGRESS;
    return CATEGORY_STATUS.ASSIGNED;
  }
  
  // Category with subcategories
  if (assignmentInfo.isPartiallyAssigned) {
    return CATEGORY_STATUS.PARTIALLY_ASSIGNED;
  }
  
  if (!assignmentInfo.isFullyAssigned) {
    return CATEGORY_STATUS.UNASSIGNED;
  }
  
  if (total > 0 && completed === total) {
    return CATEGORY_STATUS.COMPLETED;
  }
  
  if (completed > 0) {
    return CATEGORY_STATUS.IN_PROGRESS;
  }
  
  return CATEGORY_STATUS.ASSIGNED;
};

/**
 * Build hierarchical category structure
 */
export const buildCategoryHierarchy = (categories, assignments) => {
  const hierarchy = {};
  
  categories.forEach(cat => {
    const catKey = cat.category;
    if (!hierarchy[catKey]) {
      hierarchy[catKey] = {
        category: catKey,
        subcategories: {},
        assignment: assignments.find(a => 
          a.category === catKey && !a.subcategory && !a.sub_subcategory
        ),
      };
    }
    
    if (cat.subcategory) {
      const subKey = cat.subcategory;
      if (!hierarchy[catKey].subcategories[subKey]) {
        hierarchy[catKey].subcategories[subKey] = {
          subcategory: subKey,
          sub_subcategories: [],
          assignment: assignments.find(a => 
            a.category === catKey && a.subcategory === subKey && !a.sub_subcategory
          ),
        };
      }
      
      if (cat.sub_subcategory) {
        hierarchy[catKey].subcategories[subKey].sub_subcategories.push({
          sub_subcategory: cat.sub_subcategory,
          assignment: assignments.find(a => 
            a.category === catKey && a.subcategory === subKey && a.sub_subcategory === cat.sub_subcategory
          ),
        });
      }
    }
  });
  
  return Object.values(hierarchy);
};

/**
 * Format date for input fields (YYYY-MM-DD)
 */
export const formatDateForInput = (dateVal) => {
  if (!dateVal) return '';
  try {
    const date = new Date(dateVal);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    // Invalid date, return empty string
  }
  return '';
};
