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

export const BenchmarkingProvider = ({ children }) => {
  const [myCompany, setMyCompany] = useState(EMPTY_COMPANY);
  const [availableYears, setAvailableYears] = useState(['All Data']);
  const [selectedYear, setSelectedYear] = useState('All Data');
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

  // Fetch available years on mount
  useEffect(() => {
    const fetchAvailableYears = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await axios.get(`${API_BASE}/api/benchmarking/available-years`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data?.years) {
          setAvailableYears(response.data.years);
        }
      } catch (err) {
        console.error('Failed to fetch available years:', err);
      }
    };

    fetchAvailableYears();
  }, []);

  // Fetch company data based on selected year
  const fetchMyCompanyData = useCallback(async (year = selectedYear) => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await axios.get(`${API_BASE}/api/benchmarking/my-company`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { year }
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
  }, [selectedYear]);

  // Fetch data on mount and when year changes
  useEffect(() => {
    fetchMyCompanyData(selectedYear);
  }, [selectedYear, fetchMyCompanyData]);

  useEffect(() => {
    localStorage.setItem('benchmarking_saved_reports', JSON.stringify(savedReports));
  }, [savedReports]);

  const saveReport = (report) => {
    setSavedReports(prev => [...prev, report]);
  };

  const removeReport = (id) => {
    setSavedReports(prev => prev.filter(r => r.id !== id));
  };

  const changeYear = (year) => {
    setSelectedYear(year);
  };

  const refreshMyCompany = () => {
    fetchMyCompanyData(selectedYear);
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
      availableYears,
      selectedYear,
      changeYear
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
