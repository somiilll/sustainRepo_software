# Frontend Refactoring Documentation

## Overview

This document outlines the new modular frontend architecture for the GHG Emissions Platform.
The refactoring follows a feature-based modular approach to improve maintainability, scalability, and developer experience.

## New Directory Structure

```
src/
├── app/                          # Application-level concerns (future)
│   ├── router/
│   ├── layouts/
│   ├── providers/
│   ├── guards/
│   └── config/
│
├── config/                       # ✅ Centralized configuration
│   ├── api.js                   # API endpoints
│   └── env.js                   # Environment variables
│
├── constants/                    # ✅ Centralized constants
│   ├── index.js                 # Re-exports all constants
│   ├── months.js                # Month definitions
│   ├── scopes.js                # Scope definitions
│   ├── categories.js            # Category definitions
│   └── calculation-methods.js   # Calculation method definitions
│
├── models/                       # ✅ Data models/schemas
│   ├── index.js
│   └── emissions/
│       ├── emission-record.js   # Emission record structure
│       └── form-state.js        # Form state structure
│
├── modules/                      # ✅ Feature modules
│   ├── index.js
│   └── ghg/
│       ├── index.js
│       └── emissions/
│           ├── index.js
│           ├── categories/      # ✅ Category modules
│           │   ├── index.js
│           │   ├── registry.js  # Category registry pattern
│           │   ├── shared/
│           │   │   └── base-category.js
│           │   └── scope3/
│           │       ├── c1-purchased-goods/
│           │       │   ├── index.js
│           │       │   ├── config.js
│           │       │   ├── validation.js
│           │       │   ├── payload-builder.js
│           │       │   └── normalizer.js
│           │       ├── c2-capital-goods/
│           │       │   └── ... (same structure)
│           │       └── c7-employee-commuting/  (to be created)
│           │           └── ... (special handling)
│           └── shared/
│               ├── index.js
│               └── components/
│                   ├── ScopeSelector.js
│                   ├── CategorySelector.js
│                   └── MethodSelector.js
│
├── utils/                        # ✅ Utility functions
│   ├── logger/
│   │   └── index.js             # Centralized logging
│   └── helpers/
│       ├── date-utils.js        # Date utilities
│       └── unit-utils.js        # Unit utilities
│
└── ... (existing folders preserved)
```

## Category Registry Pattern

The key architectural change is the **Category Registry Pattern** which replaces scattered if/else conditionals.

### Before (Old Pattern)
```javascript
// Scattered throughout code
if (category.includes('c7')) {
  // C7 specific logic
} else if (category.includes('c6')) {
  // C6 specific logic
} else if (category.includes('c1')) {
  // C1 specific logic
}
```

### After (New Pattern)
```javascript
import { getCategoryModule, getCategoryPayloadBuilder } from '@/modules/ghg/emissions/categories';

// Get category-specific module
const module = getCategoryModule(category);

// Use category-specific payload builder
const payload = module.payloadBuilder(formData, context);

// Or use the helper function
const payload = buildCategoryPayload(category, formData, context);
```

## Category Module Structure

Each category module contains:

```
category-name/
├── index.js          # Module entry point, registers with registry
├── config.js         # Category configuration (features, methods, etc.)
├── validation.js     # Validation rules and validators
├── payload-builder.js # Transforms form data to API payload
├── normalizer.js     # Transforms API response to form data
├── form.jsx          # Form component (when extracted)
└── hooks.js          # Category-specific hooks (optional)
```

## Usage Examples

### Using the Category Registry

```javascript
import { 
  getCategoryModule,
  getCategoryConfig,
  buildCategoryPayload,
  normalizeCategoryData 
} from '@/modules/ghg/emissions/categories';

// Get full module
const c7Module = getCategoryModule('c7');

// Get just config
const config = getCategoryConfig('C7 - Employee Commuting');
console.log(config.multiEmployee); // true

// Build payload
const payload = buildCategoryPayload('c1', formData, { user, facility });

// Normalize API response
const formData = normalizeCategoryData('c1', apiResponse);
```

### Using Constants

```javascript
import { 
  SCOPES, 
  getScopeLabel,
  isC7Category,
  getMethodLabel 
} from '@/constants';

// Use scope constants
if (scope === SCOPES.SCOPE3) {
  // Scope 3 logic
}

// Get display label
const label = getScopeLabel(SCOPES.SCOPE1); // "Scope 1"

// Check category type
if (isC7Category(category)) {
  // Handle C7 specifically
}

// Get method label
const methodLabel = getMethodLabel('activity_basis'); // "Activity Based"
```

### Using Logger

```javascript
import logger from '@/utils/logger';

// Basic logging
logger.info('Form submitted', { category, facility });
logger.error('API call failed', { endpoint, error });

// Specialized logging
logger.apiError('/api/emissions', error, { category });
logger.validationError('EmissionForm', errors, formData);
logger.calculationError('C7 Monthly', inputs, error);

// Scoped logger
const formLogger = logger.scope('EmissionEntryForm');
formLogger.info('Step changed', { from: 1, to: 2 });
```

### Using Shared Components

```javascript
import { 
  ScopeSelector, 
  CategorySelector, 
  MethodSelector 
} from '@/modules/ghg/emissions/shared';

function MyForm() {
  return (
    <>
      <ScopeSelector 
        value={scope} 
        onChange={setScope}
        hasScope3Access={true}
      />
      <CategorySelector 
        value={category}
        onChange={setCategory}
        categories={categories}
        scope={scope}
      />
      <MethodSelector
        value={method}
        onChange={setMethod}
        availableMethods={['activity_basis', 'spend_basis']}
      />
    </>
  );
}
```

## Migration Strategy

The refactoring is designed to be **incremental** and **non-breaking**:

1. **Phase 1 (Complete)**: Create new infrastructure
   - Config, constants, utils, models
   - Category registry pattern
   - C1, C2 modules as templates

2. **Phase 2 (Next)**: Extract remaining categories
   - C3-C6 standard categories
   - C7 special handling
   - C8-C15 subcategory categories

3. **Phase 3**: Extract form components
   - Shared form components
   - Category-specific forms
   - Monthly/yearly entry modes

4. **Phase 4**: Migrate EmissionEntryForm.js
   - Replace if/else with registry
   - Use extracted components
   - Reduce file size significantly

5. **Phase 5**: Migrate Emissions.js (list/edit)
   - Similar refactoring approach

## Benefits

1. **Maintainability**: Each category is isolated, changes don't affect others
2. **Scalability**: Adding new categories is straightforward
3. **Testability**: Category modules can be unit tested independently
4. **Readability**: No more 6000+ line files
5. **Debugging**: Centralized logging, clear error messages
6. **Type Safety**: Models document expected data structures
7. **Code Reuse**: Shared components and utilities

## Notes

- All existing functionality is preserved
- Old code continues to work during migration
- New code can be adopted incrementally
- No business logic changes
