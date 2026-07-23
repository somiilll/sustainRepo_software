import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

const BenchmarkingContext = createContext(undefined);

// Default empty company structure
const EMPTY_COMPANY = {
  id: 'my-company',
  name: 'My Company',
  industry: 'Manufacturing',
  year: 'All Data',
  fileName: 'Internal ESG Data',
  metrics: {}
};

// Helper to format date as YYYY-MM-DD
const formatDateForAPI = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

export const BenchmarkingProvider = ({ children }) => {
  const [myCompany, setMyCompany] = useState(EMPTY_COMPANY);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [dateRange, setDateRange] = useState({ min: null, max: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedReports, setSavedReports] = useState(() => {
    try {
      const saved = localStorage.getItem('benchmarking_saved_reports');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse saved reports from localStorage', e);
      return [];
    }
  });

  // Fetch available date range on mount
  useEffect(() => {
    const fetchDateRange = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await axios.get(`${API_BASE}/api/benchmarking/date-range`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data) {
          setDateRange({
            min: response.data.min_date,
            max: response.data.max_date
          });
        }
      } catch (err) {
        console.error('Failed to fetch date range:', err);
      }
    };

    fetchDateRange();
  }, []);

  // Fetch company data based on date range
  const fetchMyCompanyData = useCallback(async (start = startDate, end = endDate) => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const params = {};
      if (start) params.start_date = formatDateForAPI(start);
      if (end) params.end_date = formatDateForAPI(end);

      const response = await axios.get(`${API_BASE}/api/benchmarking/my-company`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      if (response.data) {
        setMyCompany(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch internal company data:', err);
      setError('Failed to load company data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Fetch data on mount
  useEffect(() => {
    fetchMyCompanyData(null, null);
  }, []);

  // Fetch data when dates change
  const applyDateFilter = useCallback((start, end) => {
    setStartDate(start);
    setEndDate(end);
    fetchMyCompanyData(start, end);
  }, [fetchMyCompanyData]);

  const clearDateFilter = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
    fetchMyCompanyData(null, null);
  }, [fetchMyCompanyData]);

  useEffect(() => {
    localStorage.setItem('benchmarking_saved_reports', JSON.stringify(savedReports));
  }, [savedReports]);

  const saveReport = (report) => {
    setSavedReports(prev => [...prev, report]);
  };

  const removeReport = (id) => {
    setSavedReports(prev => prev.filter(r => r.id !== id));
  };

  const refreshMyCompany = () => {
    fetchMyCompanyData(startDate, endDate);
  };

  return (
    <BenchmarkingContext.Provider value={{ 
      myCompany, 
      setMyCompany, 
      savedReports, 
      saveReport, 
      removeReport,
      loading,
      error,
      refreshMyCompany,
      startDate,
      endDate,
      dateRange,
      applyDateFilter,
      clearDateFilter
    }}>
      {children}
    </BenchmarkingContext.Provider>
  );
};

export const useBenchmarking = () => {
  const context = useContext(BenchmarkingContext);
  if (context === undefined) {
    throw new Error('useBenchmarking must be used within a BenchmarkingProvider');
  }
  return context;
};
