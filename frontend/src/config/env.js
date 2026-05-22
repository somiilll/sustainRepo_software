/**
 * Environment Configuration
 * Centralized environment variables access
 * All env vars should be imported from here
 */

export const ENV = {
  // API Configuration
  BACKEND_URL: process.env.REACT_APP_BACKEND_URL,
  
  // Feature Flags
  ENABLE_SCOPE3: process.env.REACT_APP_ENABLE_SCOPE3 !== 'false',
  ENABLE_BULK_UPLOAD: process.env.REACT_APP_ENABLE_BULK_UPLOAD !== 'false',
  ENABLE_REPORTS: process.env.REACT_APP_ENABLE_REPORTS !== 'false',
  
  // Environment
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test',
  
  // Logging
  LOG_LEVEL: process.env.REACT_APP_LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'error'),
};

/**
 * Validate required environment variables
 * Call this on app startup
 */
export const validateEnv = () => {
  const required = ['REACT_APP_BACKEND_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  return true;
};

export default ENV;
