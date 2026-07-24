/**
 * Peer Benchmarking Module
 * 
 * Provides ESG peer benchmarking functionality:
 * - Upload and extract ESG metrics from PDF reports
 * - Compare company metrics against competitors
 * - Generate AI-powered executive summaries
 * - Export printable benchmark reports
 */

import React, { useState } from 'react';
import { BenchmarkingProvider } from './context/BenchmarkingContext';
import { UploadView } from './components/UploadView';
import { ComparisonView } from './components/ComparisonView';
import './styles/benchmarking.css';

const PeerBenchmarkingContent = () => {
  const [activeView, setActiveView] = useState('upload');

  return (
    <div className="benchmarking-app-container">
      <div className="benchmarking-nav-header">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="text-gradient">ESG Peer Benchmarking</span>
          </h1>
          <p className="text-stone-400 text-sm mt-1">Compare your ESG performance against industry peers</p>
        </div>
        <div className="benchmarking-nav-links">
          <button
            onClick={() => setActiveView('upload')}
            className={`benchmarking-nav-link ${activeView === 'upload' ? 'active' : ''}`}
          >
            Upload Reports
          </button>
          <button
            onClick={() => setActiveView('compare')}
            className={`benchmarking-nav-link ${activeView === 'compare' ? 'active' : ''}`}
          >
            Comparison Dashboard
          </button>
        </div>
      </div>

      {activeView === 'upload' && <UploadView />}
      {activeView === 'compare' && <ComparisonView />}
    </div>
  );
};

const PeerBenchmarking = () => {
  return (
    <BenchmarkingProvider>
      <PeerBenchmarkingContent />
    </BenchmarkingProvider>
  );
};

export default PeerBenchmarking;
