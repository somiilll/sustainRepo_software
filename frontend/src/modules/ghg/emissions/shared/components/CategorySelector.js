/**
 * Category Selector Component
 * Reusable category selection for emission entry forms
 */

import React, { useMemo } from 'react';
import { Search } from 'lucide-react';

/**
 * Category selector component
 * @param {Object} props
 * @param {string} props.value - Currently selected category
 * @param {Function} props.onChange - Change handler
 * @param {Array} props.categories - List of available categories
 * @param {string} props.scope - Current scope filter
 * @param {boolean} props.disabled - Whether selector is disabled
 * @param {string} props.searchTerm - Search filter term
 * @param {Function} props.onSearchChange - Search change handler
 * @param {string} props.className - Additional CSS classes
 */
export const CategorySelector = ({
  value,
  onChange,
  categories = [],
  scope = '',
  disabled = false,
  searchTerm = '',
  onSearchChange,
  className = '',
  showSearch = true,
}) => {
  // Filter categories by scope and search term
  const filteredCategories = useMemo(() => {
    let filtered = categories;
    
    // Filter by scope
    if (scope) {
      filtered = filtered.filter(cat => 
        cat.scope_code === scope || cat.scope === scope
      );
    }
    
    // Filter by search term
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(cat => 
        cat.name?.toLowerCase().includes(lowerSearch) ||
        cat.description?.toLowerCase().includes(lowerSearch)
      );
    }
    
    return filtered;
  }, [categories, scope, searchTerm]);
  
  const handleCategoryClick = (categoryName) => {
    if (!disabled && onChange) {
      onChange(categoryName);
    }
  };
  
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search input */}
      {showSearch && onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search categories..."
            disabled={disabled}
            className="
              w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md
              focus:outline-none focus:ring-2 focus:ring-emerald-500
              disabled:bg-gray-100 disabled:cursor-not-allowed
            "
          />
        </div>
      )}
      
      {/* Category list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
        {filteredCategories.map((cat) => (
          <button
            key={cat.id || cat.name}
            type="button"
            onClick={() => handleCategoryClick(cat.name)}
            disabled={disabled}
            className={`
              p-3 rounded-lg text-left transition-all border
              ${value === cat.name 
                ? 'bg-emerald-50 border-emerald-500 text-emerald-700' 
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="font-medium text-sm">{cat.name}</div>
            {cat.description && (
              <div className="text-xs text-gray-500 mt-1 truncate">
                {cat.description}
              </div>
            )}
          </button>
        ))}
        
        {filteredCategories.length === 0 && (
          <div className="col-span-2 text-center py-4 text-gray-500">
            No categories found
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Category selector as dropdown
 */
export const CategorySelectorDropdown = ({
  value,
  onChange,
  categories = [],
  scope = '',
  disabled = false,
  className = '',
  placeholder = 'Select Category',
}) => {
  const filteredCategories = useMemo(() => {
    if (!scope) return categories;
    return categories.filter(cat => 
      cat.scope_code === scope || cat.scope === scope
    );
  }, [categories, scope]);
  
  return (
    <select
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      disabled={disabled}
      className={`
        w-full px-3 py-2 border border-gray-300 rounded-md
        focus:outline-none focus:ring-2 focus:ring-emerald-500
        ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
        ${className}
      `}
    >
      <option value="">{placeholder}</option>
      {filteredCategories.map((cat) => (
        <option key={cat.id || cat.name} value={cat.name}>
          {cat.name}
        </option>
      ))}
    </select>
  );
};

export default CategorySelector;
