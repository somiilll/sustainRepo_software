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
      const response = await fetch(`${API_BASE}/api/benchmarking/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myCompany: { name: myCompany.name, metrics: myCompany.metrics },
          competitors: competitors.map(c => ({ name: c.name, year: c.year, metrics: c.metrics }))
        })
      });

      if (!response.ok) {
        throw new Error('Server returned an error generating the summary.');
      }

      const data = await response.json();
      setSummary(data);
      if (onSummaryGenerated) onSummaryGenerated(data);
    } catch (err) {
      console.error(err);
      setError('Could not generate AI Executive Briefing. Please check your API configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Executive AI Briefing
          </h3>
          <p className="text-stone-400 text-sm">Automated C-Suite Benchmarking & Gap Analysis</p>
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
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <span className="text-red-300">{error}</span>
        </div>
      )}

      {!summary && !loading && !error && (
        <div className="bg-stone-800/50 rounded-lg p-6 text-center text-stone-400">
          Click <strong>&quot;Generate Executive Briefing&quot;</strong> to run an AI-powered gap analysis comparing {myCompany.name} against {competitors.map(c => c.name).join(' & ') || 'selected competitors'}.
        </div>
      )}

      {summary && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-blue-500/10 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <h4 className="font-semibold text-blue-400 mb-1">Executive Headline</h4>
            <p className="text-stone-200">{summary.headline}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <h4 className="font-semibold text-emerald-400 flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4" />
                Competitive Advantages
              </h4>
              <ul className="space-y-2">
                {summary.strengths.map((s, idx) => (
                  <li key={idx} className="text-stone-300 text-sm flex items-start gap-2">
                    <span className="text-emerald-400 mt-1">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <h4 className="font-semibold text-red-400 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4" />
                Critical Benchmark Gaps
              </h4>
              <ul className="space-y-2">
                {summary.gaps.map((g, idx) => (
                  <li key={idx} className="text-stone-300 text-sm flex items-start gap-2">
                    <span className="text-red-400 mt-1">•</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <h4 className="font-semibold text-amber-400 flex items-center gap-2 mb-3">
              <Target className="w-4 h-4" />
              Strategic Action Plan (Next 12-24 Months)
            </h4>
            <ol className="space-y-2">
              {summary.recommendations.map((r, idx) => (
                <li key={idx} className="text-stone-300 text-sm flex items-start gap-3">
                  <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-semibold">{idx + 1}</span>
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
