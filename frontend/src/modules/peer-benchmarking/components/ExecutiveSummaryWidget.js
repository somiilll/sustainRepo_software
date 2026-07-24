import React, { useState } from 'react';
import { Sparkles, ShieldCheck, AlertTriangle, Target, RefreshCw, Printer } from 'lucide-react';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

export const ExecutiveSummaryWidget = ({ myCompany, competitors, onSummaryGenerated }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSummary = async () => {
    if (competitors.length === 0) {
      alert('Please select at least one competitor to generate an executive briefing.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const response = await fetch(`${API_BASE}/api/benchmarking/generate-summary`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          myCompany: { name: myCompany.name, metrics: myCompany.metrics },
          competitors: competitors.map(c => ({ name: c.name, year: c.year, metrics: c.metrics }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Server returned an error generating the summary.');
      }

      const data = await response.json();
      setSummary(data);
      if (onSummaryGenerated) onSummaryGenerated(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not generate AI Executive Briefing.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: '#9333ea' }} />
            Executive AI Briefing
          </h3>
          <p style={{ color: '#64748b' }} className="text-sm">Automated C-Suite Benchmarking & Gap Analysis</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {summary && (
            <button
              onClick={() => window.print()}
              className="btn-secondary flex items-center gap-2"
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >
              <Printer className="w-4 h-4" />
              Export / Print
            </button>
          )}
          <button
            onClick={generateSummary}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Analyzing Peer Data...' : summary ? 'Re-generate Summary' : 'Generate Executive Briefing'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca' }} className="rounded-lg p-4 mb-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" style={{ color: '#dc2626' }} />
          <span style={{ color: '#dc2626' }}>{error}</span>
        </div>
      )}

      {!summary && !loading && !error && (
        <div style={{ background: '#f1f5f9', color: '#475569' }} className="rounded-lg p-6 text-center">
          Click <strong>&quot;Generate Executive Briefing&quot;</strong> to run an AI-powered gap analysis comparing {myCompany.name} against {competitors.map(c => c.name).join(' & ') || 'selected competitors'}.
        </div>
      )}

      {summary && (
        <div className="space-y-4 animate-fade-in">
          <div style={{ background: '#eff6ff', borderLeft: '4px solid #3b82f6' }} className="p-4 rounded-r-lg">
            <h4 className="font-semibold mb-1" style={{ color: '#2563eb' }}>Executive Headline</h4>
            <p style={{ color: '#1e293b' }}>{summary.headline}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }} className="rounded-lg p-4">
              <h4 className="font-semibold flex items-center gap-2 mb-3" style={{ color: '#16a34a' }}>
                <ShieldCheck className="w-4 h-4" />
                Competitive Advantages
              </h4>
              <ul className="space-y-2">
                {summary.strengths.map((s, idx) => (
                  <li key={idx} style={{ color: '#334155' }} className="text-sm flex items-start gap-2">
                    <span style={{ color: '#16a34a' }} className="mt-1">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca' }} className="rounded-lg p-4">
              <h4 className="font-semibold flex items-center gap-2 mb-3" style={{ color: '#dc2626' }}>
                <AlertTriangle className="w-4 h-4" />
                Critical Benchmark Gaps
              </h4>
              <ul className="space-y-2">
                {summary.gaps.map((g, idx) => (
                  <li key={idx} style={{ color: '#334155' }} className="text-sm flex items-start gap-2">
                    <span style={{ color: '#dc2626' }} className="mt-1">•</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ background: '#fffbeb', border: '1px solid #fde68a' }} className="rounded-lg p-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3" style={{ color: '#d97706' }}>
              <Target className="w-4 h-4" />
              Strategic Action Plan (Next 12-24 Months)
            </h4>
            <ol className="space-y-2">
              {summary.recommendations.map((r, idx) => (
                <li key={idx} style={{ color: '#334155' }} className="text-sm flex items-start gap-3">
                  <span style={{ background: '#fef3c7', color: '#d97706' }} className="px-2 py-0.5 rounded text-xs font-semibold">{idx + 1}</span>
                  {r}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutiveSummaryWidget;
