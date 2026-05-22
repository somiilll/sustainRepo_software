/**
 * API Configuration
 * Centralized API endpoint configuration
 * All API URLs should be imported from here - never hardcoded in components
 */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const API_BASE_URL = BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Auth endpoints
export const AUTH_ENDPOINTS = {
  LOGIN: `${API}/auth/login`,
  LOGOUT: `${API}/auth/logout`,
  REFRESH: `${API}/auth/refresh`,
  FORGOT_PASSWORD: `${API}/auth/forgot-password`,
  RESET_PASSWORD: `${API}/auth/reset-password`,
};

// Emissions endpoints
export const EMISSIONS_ENDPOINTS = {
  BASE: `${API}/emissions`,
  BY_ID: (id) => `${API}/emissions/${id}`,
  HISTORY: (id) => `${API}/emissions/${id}/history`,
  C7_MONTH: `${API}/emissions/c7/month`,
  C7_YEARLY: `${API}/emissions/c7/yearly`,
};

// Calc Engine endpoints
export const CALC_ENGINE_ENDPOINTS = {
  EXECUTE: `${API}/calc-engine/execute`,
  EXECUTE_BY_CATEGORY: `${API}/calc-engine/execute-by-category`,
  FORM_CONFIG: (categoryId) => `${API}/calc-engine/form-config/${categoryId}`,
  UNITS: `${API}/calc-engine/units`,
  FORMULAS: `${API}/calc-engine/formulas`,
};

// Scope 3 endpoints
export const SCOPE3_ENDPOINTS = {
  EF: `${API}/scope3-ef`,
  EF_BY_ID: (id) => `${API}/scope3-ef/${id}`,
  CATEGORIES_BY_SUB_SCOPE: `${API}/scope3-ef/categories-by-sub-scope`,
};

// Facility endpoints
export const FACILITY_ENDPOINTS = {
  BASE: `${API}/facilities`,
  BY_ID: (id) => `${API}/facilities/${id}`,
};

// Organization endpoints
export const ORGANIZATION_ENDPOINTS = {
  BASE: `${API}/organizations`,
  BY_ID: (id) => `${API}/organizations/${id}`,
};

// Dashboard endpoints
export const DASHBOARD_ENDPOINTS = {
  STATS: `${API}/dashboard/stats`,
  EMISSIONS_BY_SCOPE: `${API}/dashboard/emissions-by-scope`,
  EMISSIONS_BY_FACILITY: `${API}/dashboard/emissions-by-facility`,
};

// Reports endpoints
export const REPORTS_ENDPOINTS = {
  GENERATE: `${API}/reports/generate`,
  DOWNLOAD: (id) => `${API}/reports/download/${id}`,
};

// Bulk Upload endpoints
export const BULK_UPLOAD_ENDPOINTS = {
  TEMPLATE: (category) => `${API}/bulk-upload/template/${category}`,
  UPLOAD: `${API}/bulk-upload/upload`,
  VALIDATE: `${API}/bulk-upload/validate`,
};

// Fuel Database endpoints
export const FUEL_ENDPOINTS = {
  BASE: `${API}/fuel-database`,
  BY_ID: (id) => `${API}/fuel-database/${id}`,
};

// GWP endpoints
export const GWP_ENDPOINTS = {
  CONFIG: `${API}/gwp-config`,
  FUGITIVES: `${API}/gwp-fugitives`,
};

export default {
  API_BASE_URL,
  API,
  AUTH_ENDPOINTS,
  EMISSIONS_ENDPOINTS,
  CALC_ENGINE_ENDPOINTS,
  SCOPE3_ENDPOINTS,
  FACILITY_ENDPOINTS,
  ORGANIZATION_ENDPOINTS,
  DASHBOARD_ENDPOINTS,
  REPORTS_ENDPOINTS,
  BULK_UPLOAD_ENDPOINTS,
  FUEL_ENDPOINTS,
  GWP_ENDPOINTS,
};
