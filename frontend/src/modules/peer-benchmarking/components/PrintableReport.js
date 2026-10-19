import React from 'react';
import { METRIC_LABELS } from '../types';

const METRIC_UNITS = {
  scope1: 'tCO2e',
  scope2: 'tCO2e',
  emissionIntensityPerTurnover: 'tCO2e / ₹ Cr',
  treatedWaterDischarged: '%',
  renewableEnergy: '%',
  wasteRecycled: '%',
  hazardousWaste: 'Tonnes',
  wasteIntensity: 'Tonnes / ₹ Cr',
  ltirEmployee: 'per million hrs',
  ltirWorker: 'per million hrs',
  dataPrivacyPolicy: 'Status',
  disciplinaryAction: 'Actions',
  daysAccountsPayable: 'Days'
};

export const PrintableReport = ({ myCompany, comp1, comp2, savedReports, executiveSummary }) => {
  const isLowerBetter = (metric) => {
    return ['scope1', 'scope2', 'emissionIntensityPerTurnover', 'hazardousWaste', 'wasteIntensity', 'ltirEmployee', 'ltirWorker', 'disciplinaryAction'].includes(metric);
  };

  const formatVal = (val, canonicalUnit) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Compliant' : 'Non-Compliant';
    if (typeof val === 'number') {
      if (val === 0) return `0 ${canonicalUnit}`.trim();
      const abs = Math.abs(val);
      if (abs > 0 && abs < 0.01) {
        return `${val.toFixed(5).replace(/\.?0+$/, '')} ${canonicalUnit}`.trim();
      }
      const formattedNum = Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2);
      return `${formattedNum} ${canonicalUnit}`.trim();
    }
    return String(val);
  };

  const getIndustryAverage = (metric) => {
    if (savedReports.length === 0) return 'N/A';
    let sum = 0;
    let count = 0;
    savedReports.forEach(r => {
      const val = r.metrics[metric]?.normalizedValue;
      if (typeof val === 'number') {
        sum += val;
        count++;
      }
    });
    if (count === 0) return 'N/A';
    return (sum / count).toFixed(2);
  };

  const getRelativePosition = (metric) => {
    const m = myCompany.metrics[metric]?.normalizedValue;
    const c1 = comp1?.metrics[metric]?.normalizedValue;
    const c2 = comp2?.metrics[metric]?.normalizedValue;

    if (m === null || m === undefined) return 'Data Missing';
    if (typeof m === 'boolean') return m ? 'Compliant' : 'Deficit';

    const lowerIsBetter = isLowerBetter(metric);
    const validComps = [c1, c2].filter((v) => typeof v === 'number');

    if (validComps.length === 0) return 'Baseline Only';

    const worstVal = lowerIsBetter ? Math.max(...validComps, m) : Math.min(...validComps, m);
    const bestVal = lowerIsBetter ? Math.min(...validComps, m) : Math.max(...validComps, m);

    if (m === bestVal && m !== worstVal) return '★ Peer Leader';
    if (m === worstVal && m !== bestVal) return '▲ Trailing Deficit';
    return '● At Par';
  };

  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="print-report-container">
      {/* Cover Header */}
      <div className="report-header">
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '10pt', letterSpacing: '2px', color: '#64748b' }}>EXECUTIVE BRIEFING</span>
          <h1 style={{ fontSize: '18pt', margin: '0.5rem 0' }}>ESG & SUSTAINABILITY PEER BENCHMARKING REPORT</h1>
          <p style={{ color: '#64748b' }}>Comparative Performance Evaluation & Gap Analysis</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt', color: '#475569' }}>
          <span><strong>Report Date:</strong> {todayStr}</span>
          <span><strong>Target Company:</strong> {myCompany.name}</span>
          <span><strong>Industry Sector:</strong> {myCompany.industry}</span>
          <span><strong>Benchmarked Peers:</strong> {[comp1?.name, comp2?.name].filter(Boolean).join(', ') || 'None'}</span>
        </div>
      </div>

      {/* Executive Summary */}
      {executiveSummary && (
        <div className="report-section">
          <h2 className="section-title">1. Executive Summary & Strategic Takeaways</h2>
          <div className="headline-box">
            <h4 style={{ marginBottom: '0.5rem', color: '#1e40af' }}>Executive Briefing Headline</h4>
            <p style={{ fontWeight: 600 }}>{executiveSummary.headline}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="summary-card strength-card">
              <h4 style={{ color: '#166534', marginBottom: '0.5rem' }}>✓ Key Competitive Strengths</h4>
              <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                {executiveSummary.strengths.map((s, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="summary-card gap-card">
              <h4 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>⚠ Critical Benchmark Deficits</h4>
              <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                {executiveSummary.gaps.map((g, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Benchmarking Matrix Table */}
      <div className="report-section">
        <h2 className="section-title">2. Peer Benchmarking Summary Matrix</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>ESG Metric</th>
              <th>{myCompany.name}</th>
              <th>{comp1 ? `${comp1.name} ${comp1.year}` : 'Competitor 1'}</th>
              <th>{comp2 ? `${comp2.name} ${comp2.year}` : 'Competitor 2'}</th>
              <th>Avg. of Peers</th>
              <th>Relative Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(METRIC_LABELS).map(metric => {
              const myVal = myCompany.metrics[metric]?.normalizedValue ?? null;
              const c1Val = comp1?.metrics[metric]?.normalizedValue ?? null;
              const c2Val = comp2?.metrics[metric]?.normalizedValue ?? null;
              const canonicalUnit = METRIC_UNITS[metric] || '';
              const status = getRelativePosition(metric);

              return (
                <tr key={metric}>
                  <td><strong>{METRIC_LABELS[metric]}</strong></td>
                  <td>{formatVal(myVal, canonicalUnit)}</td>
                  <td>{formatVal(c1Val, canonicalUnit)}</td>
                  <td>{formatVal(c2Val, canonicalUnit)}</td>
                  <td>{getIndustryAverage(metric)} {canonicalUnit}</td>
                  <td>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Strategic Action Roadmap */}
      {executiveSummary?.recommendations && (
        <div className="report-section">
          <h2 className="section-title">4. Strategic Action Roadmap (Next 12-24 Months)</h2>
          <div className="roadmap-box">
            {executiveSummary.recommendations.map((rec, idx) => (
              <p key={idx} style={{ marginBottom: '0.5rem' }}>
                <strong>Phase {idx + 1}:</strong> {rec}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="report-footer">
        <span>Confidential • Prepared for Executive ESG Review</span>
        <span>Generated via Peer Benchmarking Engine</span>
      </div>
    </div>
  );
};

export default PrintableReport;
