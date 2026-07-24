import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle, Loader, AlertTriangle } from 'lucide-react';
import { useBenchmarking } from '../context/BenchmarkingContext';
import { INDUSTRY_SECTORS } from '../types';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

export const UploadView = () => {
  const { saveReport } = useBenchmarking();
  const [file, setFile] = useState(null);
  const [industry, setIndustry] = useState('Technology');
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedReport, setExtractedReport] = useState(null);
  const [reportName, setReportName] = useState('');
  const [reportYear, setReportYear] = useState(new Date().getFullYear().toString());
  const [error, setError] = useState(null);

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleExtraction = async () => {
    if (!file) return;
    
    // Validate required fields before extraction
    if (!reportName.trim()) {
      setError('Please enter a Company Name before extraction.');
      return;
    }
    
    setIsExtracting(true);
    setProgress(20);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const formData = new FormData();
      formData.append('report', file);

      setProgress(40);
      
      // Build URL with query params for competitor info
      const params = new URLSearchParams({
        competitor_name: reportName.trim(),
        competitor_industry: industry,
        reporting_year: reportYear
      });
      
      const response = await fetch(`${API_BASE}/api/benchmarking/extract?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      setProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned ${response.status}`);
      }

      const data = await response.json();
      setProgress(100);

      // Backend now returns the full competitor object with id, name, metrics, etc.
      const newReport = {
        id: data.id || Math.random().toString(36).substr(2, 9),
        name: data.name || reportName.trim(),
        industry: data.industry || industry,
        year: data.year || reportYear,
        fileName: data.fileName || file.name,
        metrics: data.metrics,
        storage_path: data.storage_path,
        data_source: data.data_source || 'pdf_extraction'
      };

      setExtractedReport(newReport);
    } catch (err) {
      console.error("Extraction failed", err);
      setError(err.message || 'Extraction failed. Please try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = () => {
    if (extractedReport) {
      // Data is already saved to MongoDB by the backend
      // Just add to local state for the comparison view
      saveReport(extractedReport);
      
      // Reset
      setFile(null);
      setExtractedReport(null);
      setReportName('');
      setError(null);
      alert('Report saved successfully! Go to Comparison view to analyze.');
    }
  };

  const handleReset = () => {
    setFile(null);
    setExtractedReport(null);
    setReportName('');
    setError(null);
    setProgress(0);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Left Panel - Upload */}
      <div className="glass-panel p-6">
        <h2 className="text-2xl font-bold mb-6">Upload Competitor Report</h2>
        
        <div className="mb-4">
          <label className="block text-sm text-stone-400 mb-2">Industry Sector</label>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={isExtracting || extractedReport !== null}
            className="input-field"
          >
            {INDUSTRY_SECTORS.map(sec => (
              <option key={sec} value={sec}>{sec}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-red-300 text-sm">{error}</span>
          </div>
        )}

        {!file && (
          <>
            <div className="mb-4">
              <label className="block text-sm text-stone-400 mb-2">Company Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Competitor A"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-stone-400 mb-2">Financial Year</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. FY23-24"
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
              />
            </div>

            <div
              className="upload-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf';
                input.onchange = (e) => {
                  if (e.target.files[0]) {
                    setFile(e.target.files[0]);
                    setError(null);
                  }
                };
                input.click();
              }}
            >
              <UploadCloud className="w-12 h-12 text-stone-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Drag & Drop Report Here</h3>
              <p className="text-stone-500 text-sm">or click to browse files (PDF only)</p>
            </div>
          </>
        )}

        {file && !extractedReport && (
          <div style={{ background: '#f1f5f9' }} className="rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-8 h-8" style={{ color: '#2563eb' }} />
              <div className="flex-1">
                <h3 className="font-semibold" style={{ color: '#1e293b' }}>{file.name}</h3>
                <p className="text-sm" style={{ color: '#64748b' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button 
                onClick={handleReset}
                style={{ color: '#64748b' }}
                className="hover:text-slate-800 text-sm"
              >
                Remove
              </button>
            </div>

            {isExtracting ? (
              <div>
                <div className="flex items-center gap-2 mb-2" style={{ color: '#2563eb' }}>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Extracting ESG metrics from PDF... {progress}%</span>
                </div>
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                </div>
                <p className="text-xs mt-2" style={{ color: '#64748b' }}>
                  This may take 1-2 minutes depending on document size.
                </p>
              </div>
            ) : (
              <button onClick={handleExtraction} className="btn-primary w-full">
                Start AI Extraction
              </button>
            )}
          </div>
        )}

        {extractedReport && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }} className="rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2" style={{ color: '#16a34a' }}>
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Extraction Complete!</span>
            </div>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Review the extracted data on the right and save to your dashboard.
            </p>
            <button 
              onClick={handleReset}
              className="btn-secondary w-full mt-3"
            >
              Upload Another Report
            </button>
          </div>
        )}
      </div>

      {/* Right Panel - Extracted Data */}
      <div className="glass-panel p-6">
        <h2 className="text-2xl font-bold mb-6">Extracted Data</h2>

        {!extractedReport ? (
          <div className="text-center py-12" style={{ color: '#64748b' }}>
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Upload a competitor&apos;s ESG report to extract metrics</p>
            <p className="text-sm mt-2" style={{ color: '#94a3b8' }}>
              Supports annual reports, sustainability reports, and BRSR filings
            </p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="mb-4 p-3 rounded" style={{ background: '#f8fafc' }}>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: '#64748b' }}>Company:</span>
                <span className="font-semibold" style={{ color: '#1e293b' }}>{extractedReport.name}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm" style={{ color: '#64748b' }}>Year:</span>
                <span style={{ color: '#334155' }}>{extractedReport.year}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm" style={{ color: '#64748b' }}>Industry:</span>
                <span style={{ color: '#334155' }}>{extractedReport.industry}</span>
              </div>
              {extractedReport.storage_path && (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm" style={{ color: '#64748b' }}>Storage:</span>
                  <span className="text-xs" style={{ color: '#16a34a' }}>Saved to cloud</span>
                </div>
              )}
            </div>

            <h4 className="text-sm font-semibold mb-3" style={{ color: '#64748b' }}>Extracted Metrics</h4>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {Object.entries(extractedReport.metrics).map(([key, data]) => (
                <div key={key} className="flex items-center justify-between p-2 rounded" style={{ background: '#f8fafc' }}>
                  <span className="text-sm capitalize" style={{ color: '#334155' }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <div className="text-right">
                    <span className="font-semibold" style={{ 
                      color: data?.normalizedValue !== undefined && data?.normalizedValue !== null 
                        ? '#16a34a' 
                        : '#94a3b8'
                    }}>
                      {data?.normalizedValue !== undefined && data?.normalizedValue !== null 
                        ? (typeof data.normalizedValue === 'boolean' 
                            ? (data.normalizedValue ? 'Yes' : 'No')
                            : data.normalizedValue.toLocaleString())
                        : 'N/A'}
                    </span>
                    {data?.normalizedUnit && (
                      <span className="text-xs ml-1" style={{ color: '#64748b' }}>{data.normalizedUnit}</span>
                    )}
                    {data?.page && (
                      <span className="text-xs ml-2" style={{ color: '#94a3b8' }}>(Pg {data.page})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleSave} className="btn-primary w-full flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Save to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadView;
