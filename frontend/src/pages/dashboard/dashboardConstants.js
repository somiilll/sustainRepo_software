/**
 * Dashboard shared constants — colors, palette, glass styles, label renderer.
 * Used by both DashboardScope12 and DashboardScope123 variants.
 */

export const COLORS = [
  '#10B981', // Emerald green
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#84CC16', // Lime
];

export const SCOPE_COLORS = {
  scope1: '#10B981',
  scope2: '#3B82F6',
  scope3: '#8B5CF6',
  biogenic: '#F59E0B',
};

export const SCOPE3_CATEGORY_COLORS = {
  C1: '#F97316', C2: '#EF4444', C3: '#EC4899', C4: '#8B5CF6', C5: '#6366F1',
  C6: '#3B82F6', C7: '#0EA5E9', C8: '#06B6D4', C9: '#14B8A6', C10: '#10B981',
  C11: '#22C55E', C12: '#84CC16', C13: '#EAB308', C14: '#F59E0B', C15: '#78716C',
};

// Premium glassmorphism card styles - UNIFIED hover effects
export const glassCardStyle = 'backdrop-blur-xl bg-white/70 border border-white/20 shadow-xl';
export const glassCardHover = 'hover:bg-white/85 hover:shadow-2xl hover:border-white/40 transition-all duration-300';
