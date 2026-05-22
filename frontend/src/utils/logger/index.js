/**
 * Logger Utility
 * Centralized logging with environment-aware output
 * 
 * Usage:
 *   import logger from '@/utils/logger';
 *   logger.info('User logged in', { userId: '123' });
 *   logger.error('API call failed', { endpoint: '/api/emissions', error });
 */

import { ENV } from '../../config/env';

// Log levels in order of severity
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

// Get current log level from environment
const getCurrentLevel = () => {
  const level = ENV.LOG_LEVEL?.toLowerCase() || 'error';
  return LOG_LEVELS[level] ?? LOG_LEVELS.error;
};

// Format log message with timestamp and context
const formatMessage = (level, message, context = {}) => {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0 
    ? ` | ${JSON.stringify(context)}` 
    : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
};

// Check if should log at given level
const shouldLog = (level) => {
  const currentLevel = getCurrentLevel();
  return LOG_LEVELS[level] >= currentLevel;
};

/**
 * Logger object with level-specific methods
 */
const logger = {
  /**
   * Debug level - verbose information for debugging
   * Only shows in development with LOG_LEVEL=debug
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  debug: (message, context = {}) => {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, context));
    }
  },

  /**
   * Info level - general operational information
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  info: (message, context = {}) => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, context));
    }
  },

  /**
   * Warn level - potential issues that don't break functionality
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  warn: (message, context = {}) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, context));
    }
  },

  /**
   * Error level - errors that affect functionality
   * @param {string} message - Log message
   * @param {Object} context - Additional context data (include error object)
   */
  error: (message, context = {}) => {
    if (shouldLog('error')) {
      // Extract error details if error object provided
      if (context.error instanceof Error) {
        context = {
          ...context,
          errorMessage: context.error.message,
          errorStack: context.error.stack,
        };
        delete context.error;
      }
      console.error(formatMessage('error', message, context));
    }
  },

  /**
   * Log API errors with structured context
   * @param {string} endpoint - API endpoint that failed
   * @param {Error|Object} error - Error object or response
   * @param {Object} additionalContext - Extra context
   */
  apiError: (endpoint, error, additionalContext = {}) => {
    logger.error('API call failed', {
      endpoint,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      message: error?.message,
      ...additionalContext,
    });
  },

  /**
   * Log form validation errors
   * @param {string} formName - Name of the form
   * @param {Object} errors - Validation errors
   * @param {Object} formData - Form data that failed validation
   */
  validationError: (formName, errors, formData = {}) => {
    logger.warn('Form validation failed', {
      form: formName,
      errors,
      data: formData,
    });
  },

  /**
   * Log calculation errors
   * @param {string} calculationType - Type of calculation
   * @param {Object} inputs - Calculation inputs
   * @param {Error|string} error - Error details
   */
  calculationError: (calculationType, inputs, error) => {
    logger.error('Calculation failed', {
      type: calculationType,
      inputs,
      error: error?.message || error,
    });
  },

  /**
   * Log upload/import errors
   * @param {string} uploadType - Type of upload (bulk, file, etc.)
   * @param {string} fileName - Name of file
   * @param {Error|string} error - Error details
   */
  uploadError: (uploadType, fileName, error) => {
    logger.error('Upload failed', {
      type: uploadType,
      fileName,
      error: error?.message || error,
    });
  },

  /**
   * Performance logging - log slow operations
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in ms
   * @param {Object} context - Additional context
   */
  performance: (operation, duration, context = {}) => {
    const level = duration > 3000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
    logger[level](`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...context,
    });
  },

  /**
   * Create a scoped logger with module prefix
   * @param {string} moduleName - Module name prefix
   * @returns {Object} Scoped logger
   */
  scope: (moduleName) => ({
    debug: (message, context) => logger.debug(`[${moduleName}] ${message}`, context),
    info: (message, context) => logger.info(`[${moduleName}] ${message}`, context),
    warn: (message, context) => logger.warn(`[${moduleName}] ${message}`, context),
    error: (message, context) => logger.error(`[${moduleName}] ${message}`, context),
  }),
};

export default logger;
