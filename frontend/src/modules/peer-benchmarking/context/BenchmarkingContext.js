import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

const BenchmarkingContext = createContext(undefined);

// Default empty company structure
const EMPTY_COMPANY = {
  id: 'my-company',
  name: 'My Company',
  industry: 'Manufacturing',
  year: new Date().getFullYear().toString(),
  fileName: 'Internal ESG Data',
  metrics: {}
};

export const BenchmarkingProvider = ({ children }) => {
  const [myCompany, setMyCompany] = useState(EMPTY_COMPANY);
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

  // Fetch internal company data on mount
  useEffect(() => {
    const fetchMyCompanyData = async () => {
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
          headers: { Authorization: `Bearer ${token}` }
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
    };

    fetchMyCompanyData();
  }, []);

  useEffect(() => {
    localStorage.setItem('benchmarking_saved_reports', JSON.stringify(savedReports));
  }, [savedReports]);

  const saveReport = (report) => {
    setSavedReports(prev => [...prev, report]);
  };

  const removeReport = (id) => {
    setSavedReports(prev => prev.filter(r => r.id !== id));
  };

  const refreshMyCompany = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE}/api/benchmarking/my-company`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        setMyCompany(response.data);
      }
    } catch (err) {
      console.error('Failed to refresh company data:', err);
    } finally {
      setLoading(false);
    }
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
      refreshMyCompany
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
