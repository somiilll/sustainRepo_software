import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle, Loader } from 'lucide-react';
import { useBenchmarking } from '../context/BenchmarkingContext';
import { INDUSTRY_SECTORS } from '../types';
import { generateMockExtraction } from '../data/mockData';

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

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const simulateExtraction = async () => {
    if (!file) return;
    setIsExtracting(true);
    setProgress(20);

    try {
      const formData = new FormData();
      formData.append('report', file);

      setProgress(50);
      const response = await fetch(`${API_BASE}/api/benchmarking/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      setProgress(100);

      const newReport = {
        id: Math.random().toString(36).substr(2, 9),
        name: reportName || `${file.name.replace('.pdf', '')} - Extracted`,
        industry,
        year: reportYear,
        fileName: file.name,
        metrics: data.metrics
      };

      setExtractedReport(newReport);
    } catch (error) {
      console.error("Extraction failed", error);
      // Fallback to mock extraction
      const mockMetrics = generateMockExtraction(industry, file.name);
      setProgress(100);
      const newReport = {
        id: Math.random().toString(36).substr(2, 9),
        name: reportName || `${file.name.replace('.pdf', '')} - Extracted`,
        industry,
        year: reportYear,
        fileName: file.name,
        metrics: mockMetrics
      };
      setExtractedReport(newReport);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = () => {
    if (extractedReport) {
      if (!reportName.trim()) {
        alert('Please enter a Company Name before saving.');
        return;
      }

      saveReport({
        ...extractedReport,
        name: reportName.trim(),
        year: reportYear
      });
      // Reset
      setFile(null);
      setExtractedReport(null);
      setReportName('');
      alert('Report saved successfully! Go to Comparison view to analyze.');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Left Panel - Upload */}
      <div className="glass-panel p-6">
        <h2 className="text-2xl font-bold mb-6">Upload Document</h2>
        
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

        {!file && (
          <div
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.pdf,.docx';
              input.onchange = (e) => {
                if (e.target.files[0]) setFile(e.target.files[0]);
              };
              input.click();
            }}
          >
            <UploadCloud className="w-12 h-12 text-stone-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Drag & Drop Report Here</h3>
            <p className="text-stone-500 text-sm">or click to browse files (PDF, DOCX)</p>
          </div>
        )}

        {file && !extractedReport && (
          <div className="bg-stone-800/50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-8 h-8 text-blue-400" />
              <div>
                <h3 className="font-semibold">{file.name}</h3>
                <p className="text-sm text-stone-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            {isExtracting ? (
              <div>
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Extracting metrics...{progress}%</span>
                </div>
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            ) : (
              <button onClick={simulateExtraction} className="btn-primary w-full">
                Start Extraction
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right Panel - Extracted Data */}
      <div className="glass-panel p-6">
        <h2 className="text-2xl font-bold mb-6">Extracted Data</h2>

        {!extractedReport ? (
          <div className="text-center py-12 text-stone-500">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Upload a report to see extracted metrics</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="mb-4">
              <label className="block text-sm text-stone-400 mb-2">Save As (Company Name)</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Competitor A FY23"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-stone-400 mb-2">Financial Year (e.g. FY23-24)</label>
              <input
                type="text"
                className="input-field"
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
              />
            </div>

            <h4 className="text-sm font-semibold text-stone-400 mb-3">Metrics Found</h4>
            <div className="space-y-2 mb-4">
              {Object.entries(extractedReport.metrics).slice(0, 6).map(([key, data]) => (
                <div key={key} className="flex items-center justify-between bg-stone-800/30 p-2 rounded">
                  <span className="text-sm text-stone-300">{key}</span>
                  <div className="text-right">
                    <span className="text-emerald-400 font-semibold">
                      {data?.normalizedValue !== undefined && data?.normalizedValue !== null 
                        ? data.normalizedValue.toString() 
                        : 'N/A'}
                    </span>
                    <span className="text-xs text-stone-500 ml-2">(Pg {data?.page || '?'})</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-500 mb-4">+ {Object.keys(extractedReport.metrics).length - 6} more metrics extracted</p>

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
