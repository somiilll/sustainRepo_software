import React, { createContext, useContext, useState, useEffect } from 'react';
import { DUMMY_MY_COMPANY } from '../data/mockData';

const BenchmarkingContext = createContext(undefined);

export const BenchmarkingProvider = ({ children }) => {
  const [myCompany, setMyCompany] = useState(DUMMY_MY_COMPANY);
  const [savedReports, setSavedReports] = useState(() => {
    try {
      const saved = localStorage.getItem('benchmarking_saved_reports');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse saved reports from localStorage', e);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('benchmarking_saved_reports', JSON.stringify(savedReports));
  }, [savedReports]);

  const saveReport = (report) => {
    setSavedReports(prev => [...prev, report]);
  };

  const removeReport = (id) => {
    setSavedReports(prev => prev.filter(r => r.id !== id));
  };

  return (
    <BenchmarkingContext.Provider value={{ myCompany, setMyCompany, savedReports, saveReport, removeReport }}>
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
