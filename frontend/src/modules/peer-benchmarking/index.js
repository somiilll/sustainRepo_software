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
import { BarChart3 } from 'lucide-react';
import { ModulePageHeader } from '../../components/ModulePageHeader';
import './styles/benchmarking.css';

const PeerBenchmarkingContent = () => {
  const [activeView, setActiveView] = useState('upload');

  return (
    <div className="benchmarking-app-container space-y-7">
      <ModulePageHeader
        title="ESG Peer Benchmarking"
        icon={BarChart3}
        iconClassName="border-orange-200 bg-orange-50 text-orange-700"
        testId="peer-benchmarking"
        aside={<div className="benchmarking-nav-links">
          <button
            onClick={() => setActiveView('upload')}
            className={`benchmarking-nav-link ${activeView === 'upload' ? 'active' : ''}`}
            data-testid="peer-benchmarking-upload-tab"
          >
            Upload Reports
          </button>
          <button
            onClick={() => setActiveView('compare')}
            className={`benchmarking-nav-link ${activeView === 'compare' ? 'active' : ''}`}
            data-testid="peer-benchmarking-comparison-tab"
          >
            Comparison Dashboard
          </button>
        </div>}
      />

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
