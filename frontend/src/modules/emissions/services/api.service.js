/**
 * Emissions API Service
 * 
 * Clean abstraction layer for all emission-related API calls.
 * Components should never make direct axios calls.
 */

import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Create axios instance with default config
 */
const createApiClient = (getAuthHeader) => {
  const client = axios.create({
    baseURL: API,
    timeout: 30000,
  });
  
  // Add auth header to all requests
  client.interceptors.request.use((config) => {
    const authHeader = getAuthHeader();
    if (authHeader) {
      config.headers = { ...config.headers, ...authHeader };
    }
    return config;
  });
  
  return client;
};

/**
 * Emissions Service
 */
export const createEmissionsService = (getAuthHeader) => {
  const api = createApiClient(getAuthHeader);
  
  return {
    // ============================================================
    // EMISSIONS CRUD
    // ============================================================
    
    /**
     * Fetch all emissions
     */
    async getEmissions(params = {}) {
      const response = await api.get('/emissions', { params });
      return response.data;
    },
    
    /**
     * Fetch single emission by ID
     */
    async getEmission(id) {
      const response = await api.get(`/emissions/${id}`);
      return response.data;
    },
    
    /**
     * Create new emission
     */
    async createEmission(payload) {
      const response = await api.post('/emissions', payload);
      return response.data;
    },
    
    /**
     * Update existing emission
     */
    async updateEmission(id, payload) {
      const response = await api.put(`/emissions/${id}`, payload);
      return response.data;
    },
    
    /**
     * Delete emission
     */
    async deleteEmission(id) {
      const response = await api.delete(`/emissions/${id}`);
      return response.data;
    },
    
    /**
     * Fetch emission history
     */
    async getEmissionHistory(id) {
      const response = await api.get(`/emissions/${id}/history`);
      return response.data;
    },
    
    // ============================================================
    // REFERENCE DATA
    // ============================================================
    
    /**
     * Fetch all reference data in parallel
     */
    async getInitialData() {
      const [
        emissions,
        facilities,
        fuelDatabase,
        units,
        scopes,
        categories,
        scope3EF,
        processTemplates,
        formulas,
        organization,
      ] = await Promise.all([
        api.get('/emissions').catch(() => ({ data: [] })),
        api.get('/facilities').catch(() => ({ data: [] })),
        api.get('/fuel-database').catch(() => ({ data: [] })),
        api.get('/calc-engine/units').catch(() => ({ data: { simple: [], compound: [] } })),
        api.get('/scopes').catch(() => ({ data: [] })),
        api.get('/categories').catch(() => ({ data: [] })),
        api.get('/scope3-ef?limit=10000').catch(() => ({ data: [] })),
        api.get('/process-templates').catch(() => ({ data: [] })),
        api.get('/formula-definitions').catch(() => ({ data: [] })),
        api.get('/organizations/my').catch(() => ({ data: null })),
      ]);
      
      return {
        emissions: emissions.data,
        facilities: facilities.data,
        fuelDatabase: fuelDatabase.data || [],
        centralizedUnits: [
          ...(units.data?.simple || []),
          ...(units.data?.compound || []),
        ],
        dynamicScopes: scopes.data || [],
        dynamicCategories: categories.data || [],
        scope3EFData: Array.isArray(scope3EF.data?.data) 
          ? scope3EF.data.data 
          : (Array.isArray(scope3EF.data) ? scope3EF.data : []),
        processTemplates: processTemplates.data || [],
        formulaDefinitions: formulas.data || [],
        organization: organization.data,
      };
    },
    
    /**
     * Fetch facilities
     */
    async getFacilities() {
      const response = await api.get('/facilities');
      return response.data;
    },
    
    /**
     * Fetch fuel database
     */
    async getFuelDatabase() {
      const response = await api.get('/fuel-database');
      return response.data;
    },
    
    /**
     * Fetch Scope 3 emission factors
     */
    async getScope3EF(params = {}) {
      const response = await api.get('/scope3-ef', { params: { limit: 10000, ...params } });
      return response.data?.data || response.data || [];
    },
    
    /**
     * Fetch biogenic categories
     */
    async getBiogenicCategories() {
      const response = await api.get('/scope3-ef/categories-by-sub-scope', {
        params: { sub_scope: 'biogenic' }
      });
      return response.data?.categories || [];
    },
    
    /**
     * Fetch form config for category
     */
    async getFormConfig(categoryId, scope) {
      const response = await api.get(`/calc-engine/form-config/${categoryId}`, {
        params: { scope }
      });
      return response.data;
    },
    
    // ============================================================
    // CALCULATIONS
    // ============================================================
    
    /**
     * Calculate emissions using calc engine
     */
    async calculateEmissions(payload) {
      const response = await api.post('/calc-engine/calculate', payload);
      return response.data;
    },
    
    /**
     * Calculate employee commuting emissions
     */
    async calculateEmployeeCommuting(payload) {
      const response = await api.post('/calc-engine/calculate-employee-commuting', payload);
      return response.data;
    },
    
    // ============================================================
    // BULK OPERATIONS
    // ============================================================
    
    /**
     * Bulk upload emissions
     */
    async bulkUpload(file, options = {}) {
      const formData = new FormData();
      formData.append('file', file);
      
      if (options.facilityId) formData.append('facility_id', options.facilityId);
      if (options.scope) formData.append('scope', options.scope);
      if (options.category) formData.append('category', options.category);
      
      const response = await api.post('/emissions/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    
    /**
     * Download bulk upload template
     */
    async downloadTemplate(category) {
      const response = await api.get(`/emissions/template/${category}`, {
        responseType: 'blob',
      });
      return response.data;
    },
  };
};

/**
 * Dashboard Service
 */
export const createDashboardService = (getAuthHeader) => {
  const api = createApiClient(getAuthHeader);
  
  return {
    /**
     * Fetch dashboard statistics
     */
    async getStats(params = {}) {
      const response = await api.get('/dashboard/stats', { params });
      return response.data;
    },
    
    /**
     * Fetch emissions by scope
     */
    async getEmissionsByScope(params = {}) {
      const response = await api.get('/dashboard/emissions-by-scope', { params });
      return response.data;
    },
    
    /**
     * Fetch emissions by category
     */
    async getEmissionsByCategory(scope, params = {}) {
      const response = await api.get(`/dashboard/emissions-by-category/${scope}`, { params });
      return response.data;
    },
    
    /**
     * Fetch emissions trend
     */
    async getEmissionsTrend(params = {}) {
      const response = await api.get('/dashboard/emissions-trend', { params });
      return response.data;
    },
  };
};

/**
 * Upload Service
 */
export const createUploadService = (getAuthHeader) => {
  const api = createApiClient(getAuthHeader);
  
  return {
    /**
     * Upload file to storage
     */
    async uploadFile(file, path = 'evidence') {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    
    /**
     * Delete uploaded file
     */
    async deleteFile(fileUrl) {
      const response = await api.delete('/upload', { data: { url: fileUrl } });
      return response.data;
    },
  };
};

/**
 * Service factory - creates all services with auth header
 */
export const createServices = (getAuthHeader) => ({
  emissions: createEmissionsService(getAuthHeader),
  dashboard: createDashboardService(getAuthHeader),
  upload: createUploadService(getAuthHeader),
});

export default createEmissionsService;
