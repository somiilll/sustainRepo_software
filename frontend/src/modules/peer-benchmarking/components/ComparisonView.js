import React, { useState } from 'react';
import { useBenchmarking } from '../context/BenchmarkingContext';
import { METRIC_LABELS } from '../types';
import { RadarChartWidget } from './RadarChartWidget';
import { ExecutiveSummaryWidget } from './ExecutiveSummaryWidget';
import { PrintableReport } from './PrintableReport';
import { AlertCircle, Trash2, Loader2, Database, RefreshCw, Calendar, X } from 'lucide-react';

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

// Color constants for benchmarking bars
const COLORS = {
  leader: '#34d399',       // Green - best performer
  leaderGradient: 'linear-gradient(90deg, #10b981, #059669)',
  laggard: '#f87171',      // Red - worst performer
  laggardGradient: 'linear-gradient(90deg, #ef4444, #dc2626)',
  parity: '#f59e0b',       // Amber - tied/equal
  myCompanyText: '#3b82f6', // Accent Blue for My Company page refs
  comp1Text: '#8b5cf6',     // Purple for Competitor 1
  comp2Text: '#14b8a6'      // Teal for Competitor 2
};

export const ComparisonView = () => {
  const { 
    myCompany, 
    savedReports, 
    removeReport, 
    loading, 
    error, 
    refreshMyCompany,
    startDate,
    endDate,
    applyDateFilter,
    clearDateFilter
  } = useBenchmarking();
  
  const [comp1Id, setComp1Id] = useState(savedReports[0]?.id || '');
  const [comp2Id, setComp2Id] = useState(savedReports[1]?.id || '');
  const [execSummary, setExecSummary] = useState(null);
  const [tempStartDate, setTempStartDate] = useState(startDate || '');
  const [tempEndDate, setTempEndDate] = useState(endDate || '');

  const comp1 = savedReports.find(r => r.id === comp1Id);
  const comp2 = savedReports.find(r => r.id === comp2Id);

  const handleApplyFilter = () => {
    applyDateFilter(tempStartDate || null, tempEndDate || null);
  };

  const handleClearFilter = () => {
    setTempStartDate('');
    setTempEndDate('');
    clearDateFilter();
  };

  const hasDateFilter = startDate || endDate;

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-green-600 mr-3" />
        <span className="text-slate-500">Loading internal company data...</span>
      </div>
    );
  }

  const isLowerBetter = (metric) => {
    return ['scope1', 'scope2', 'emissionIntensityPerTurnover', 'hazardousWaste', 'wasteIntensity', 'ltirEmployee', 'ltirWorker', 'disciplinaryAction'].includes(metric);
  };

  const formatVal = (val, canonicalUnit) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
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

  const getMultiInsight = (metric, myVal, c1Val, c2Val, c1Name = 'Competitor 1', c2Name = 'Competitor 2') => {
    if (myVal === null) {
      return {
        rankBadge: 'N/A',
        rankStatus: 'status-orange',
        insightsText: '• My Company data is unmonitored or missing.',
        insightsStatus: 'status-orange'
      };
    }

    const lowerIsBetter = isLowerBetter(metric);
    const units = METRIC_UNITS[metric] || '';

    if (typeof myVal === 'boolean') {
      let notes = [];
      if (c1Val !== null && typeof c1Val === 'boolean') {
        notes.push(`• ${c1Name}: ${c1Val ? 'Compliant' : 'Non-compliant'}`);
      }
      if (c2Val !== null && typeof c2Val === 'boolean') {
        notes.push(`• ${c2Name}: ${c2Val ? 'Compliant' : 'Non-compliant'}`);
      }
      const isCompliant = myVal;
      return {
        rankBadge: isCompliant ? 'Compliant' : 'Non-Compliant',
        rankStatus: isCompliant ? 'status-green' : 'status-red',
        insightsText: isCompliant
          ? `• My Company maintains full compliance.\n${notes.join('\n')}`
          : `• My Company currently lacks this framework.\n${notes.join('\n')}`,
        insightsStatus: isCompliant ? 'status-green' : 'status-red'
      };
    }

    const m = myVal;
    const c1 = typeof c1Val === 'number' ? c1Val : null;
    const c2 = typeof c2Val === 'number' ? c2Val : null;

    if (c1 !== null && c2 === null) {
      if (m === c1) {
        return {
          rankBadge: '#1',
          rankStatus: 'status-orange',
          insightsText: `• Identical performance with ${c1Name}.\n• Both companies report exactly ${m} ${units}.`,
          insightsStatus: 'status-orange'
        };
      }

      const diff = Math.abs(m - c1);
      const pDiff = c1 === 0 ? (m === 0 ? 0 : 100) : Math.abs((m - c1) / c1) * 100;
      const absPDiff = pDiff > 1000 ? '>1000%' : `${pDiff.toFixed(1)}%`;
      const iAmBetter = lowerIsBetter ? m < c1 : m > c1;

      return {
        rankBadge: iAmBetter ? '#1' : '#2',
        rankStatus: iAmBetter ? 'status-green' : 'status-red',
        insightsText: iAmBetter
          ? `• Outperforming ${c1Name} by ${absPDiff}.\n• Margin of advantage: ${diff.toFixed(2)} ${units}.`
          : `• Trailing ${c1Name} by ${absPDiff}.\n• Deficit gap: ${diff.toFixed(2)} ${units}.`,
        insightsStatus: iAmBetter ? 'status-green' : 'status-red'
      };
    }

    if (c1 !== null && c2 !== null) {
      const peers = [
        { name: myCompany.name, val: m, isMe: true },
        { name: c1Name, val: c1, isMe: false },
        { name: c2Name, val: c2, isMe: false }
      ];
      peers.sort((a, b) => lowerIsBetter ? a.val - b.val : b.val - a.val);

      let myRank = 1;
      if (peers[0].isMe) myRank = 1;
      else if (peers[1].isMe) myRank = (peers[1].val === peers[0].val) ? 1 : 2;
      else myRank = (peers[2].val === peers[1].val) ? 2 : 3;

      const isTied = (m === c1) || (m === c2);
      let rankStatus = 'status-orange';
      if (myRank === 1) rankStatus = isTied ? 'status-orange' : 'status-green';
      else if (myRank === 3) rankStatus = 'status-red';

      const c1Match = m === c1;
      const c1Better = lowerIsBetter ? m < c1 : m > c1;
      const c1DiffVal = c1 === 0 ? (m === 0 ? 0 : 100) : Math.abs((m - c1) / c1) * 100;
      const c1DiffStr = c1DiffVal > 1000 ? '>1000%' : `${c1DiffVal.toFixed(1)}%`;
      const c1Margin = Math.abs(m - c1).toFixed(2);
      const c1Insight = c1Match
        ? `• At par with ${c1Name} (${m} ${units})`
        : c1Better
          ? `• Outperforming ${c1Name} by ${c1DiffStr} (${c1Margin} ${units} lead)`
          : `• Trailing ${c1Name} by ${c1DiffStr} (${c1Margin} ${units} deficit)`;

      const c2Match = m === c2;
      const c2Better = lowerIsBetter ? m < c2 : m > c2;
      const c2DiffVal = c2 === 0 ? (m === 0 ? 0 : 100) : Math.abs((m - c2) / c2) * 100;
      const c2DiffStr = c2DiffVal > 1000 ? '>1000%' : `${c2DiffVal.toFixed(1)}%`;
      const c2Margin = Math.abs(m - c2).toFixed(2);
      const c2Insight = c2Match
        ? `• At par with ${c2Name} (${m} ${units})`
        : c2Better
          ? `• Outperforming ${c2Name} by ${c2DiffStr} (${c2Margin} ${units} lead)`
          : `• Trailing ${c2Name} by ${c2DiffStr} (${c2Margin} ${units} deficit)`;

      return {
        rankBadge: `#${myRank}`,
        rankStatus,
        insightsText: `${c1Insight}\n${c2Insight}`,
        insightsStatus: rankStatus
      };
    }

    return {
      rankBadge: '-',
      rankStatus: 'status-orange',
      insightsText: 'Select competitors to compare',
      insightsStatus: 'status-orange'
    };
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

  // Helper: Get page number with fallback
  const getPageRef = (metricData) => {
    const page = metricData?.page;
    return page !== null && page !== undefined ? `Pg ${page}` : 'Pg N/A';
  };

  // Helper: Calculate relative benchmarking bars
  const getRelativeBars = (metric, myVal, c1Val, c2Val) => {
    const lowerIsBetter = isLowerBetter(metric);
    const values = [
      { label: 'You', val: myVal, color: COLORS.myCompanyText },
      { label: 'C1', val: c1Val, color: COLORS.comp1Text },
      { label: 'C2', val: c2Val, color: COLORS.comp2Text }
    ].filter(v => v.val !== null && typeof v.val === 'number');

    if (values.length === 0) return null;

    // Find max value for scaling
    const maxVal = Math.max(...values.map(v => Math.abs(v.val)));
    if (maxVal === 0) return values.map(v => ({ ...v, width: 100, barColor: COLORS.parity }));

    // Determine best and worst performers
    const sorted = [...values].sort((a, b) => lowerIsBetter ? a.val - b.val : b.val - a.val);
    const bestVal = sorted[0]?.val;
    const worstVal = sorted[sorted.length - 1]?.val;

    return values.map(v => {
      const width = Math.max(5, (Math.abs(v.val) / maxVal) * 100);
      let barColor = COLORS.parity;
      
      if (values.length > 1) {
        const gap = maxVal > 0 ? Math.abs(bestVal - worstVal) / maxVal * 100 : 0;
        
        if (v.val === bestVal && bestVal !== worstVal) {
          barColor = gap > 30 ? COLORS.leaderGradient : COLORS.leader;
        } else if (v.val === worstVal && bestVal !== worstVal) {
          barColor = gap > 30 ? COLORS.laggardGradient : COLORS.laggard;
        }
      }
      
      return { ...v, width, barColor };
    });
  };

  // Helper: Get reasoning notes for all companies
  const getReasoningNotes = (metric, myCompanyName, comp1Data, comp2Data, comp1Name, comp2Name) => {
    const notes = [];
    const myReasoning = myCompany.metrics[metric]?.reasoning;
    const c1Reasoning = comp1Data?.metrics[metric]?.reasoning;
    const c2Reasoning = comp2Data?.metrics[metric]?.reasoning;

    if (myReasoning) {
      notes.push({ name: myCompanyName, text: myReasoning, color: COLORS.myCompanyText });
    }
    if (c1Reasoning && comp1Name) {
      notes.push({ name: comp1Name, text: c1Reasoning, color: COLORS.comp1Text });
    }
    if (c2Reasoning && comp2Name) {
      notes.push({ name: comp2Name, text: c2Reasoning, color: COLORS.comp2Text });
    }

    return notes;
  };

  const activeCompetitors = [comp1, comp2].filter(Boolean);

  return (
    <div className="web-only-dashboard">
      <PrintableReport
        myCompany={myCompany}
        comp1={comp1}
        comp2={comp2}
        savedReports={savedReports}
        executiveSummary={execSummary}
      />

      {/* Internal Data Indicator with Date Range Selector */}
      {myCompany.data_source === 'internal' && (
        <div className="glass-panel p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-green-600" />
              <div>
                <span className="text-green-700 font-semibold">{myCompany.name}</span>
                <span className="text-slate-500 text-sm ml-2">• {myCompany.industry}</span>
                <p className="text-xs text-slate-400">Data sourced from your internal ESG records</p>
              </div>
            </div>
            
            {/* Date Range Selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500">From:</span>
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">To:</span>
                <input
                  type="date"
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <button 
                onClick={handleApplyFilter}
                className="btn-primary text-sm py-2"
              >
                Apply
              </button>
              {hasDateFilter && (
                <button 
                  onClick={handleClearFilter}
                  className="btn-secondary flex items-center gap-1 text-sm py-2"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
              <button 
                onClick={refreshMyCompany}
                className="btn-secondary flex items-center gap-2 text-sm py-2"
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {hasDateFilter && (
            <div className="mt-3 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg inline-flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>
                Showing data for: <strong>{myCompany.year}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      <RadarChartWidget />

      <ExecutiveSummaryWidget
        myCompany={myCompany}
        competitors={activeCompetitors}
        onSummaryGenerated={setExecSummary}
      />

      {/* Comparison Table */}
      <div className="glass-panel p-6 mt-6 overflow-x-auto">
        <h3 className="text-xl font-bold mb-4">Detailed Metrics Comparison</h3>
        
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Metric</th>
              <th>My Company<br /><span className="text-xs font-normal">({myCompany.industry})</span></th>
              <th>
                <select
                  value={comp1Id}
                  onChange={(e) => setComp1Id(e.target.value)}
                  className="bg-transparent border border-stone-600 rounded px-2 py-1 text-sm"
                >
                  <option value="">Select Competitor 1</option>
                  {savedReports.map(r => (
                    <option key={r.id} value={r.id}>{r.name} {r.year}</option>
                  ))}
                </select>
              </th>
              <th>
                <select
                  value={comp2Id}
                  onChange={(e) => setComp2Id(e.target.value)}
                  className="bg-transparent border border-stone-600 rounded px-2 py-1 text-sm"
                >
                  <option value="">Select Competitor 2</option>
                  {savedReports.map(r => (
                    <option key={r.id} value={r.id}>{r.name} {r.year}</option>
                  ))}
                </select>
              </th>
              <th>Sources &amp; Page Numbers</th>
              <th>Relative Benchmarking Bar</th>
              <th>Avg. of Peers</th>
              <th>Rank</th>
              <th>Insights</th>
              <th style={{ minWidth: '300px' }}>Reasoning &amp; Context Notes</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(METRIC_LABELS).map(metric => {
              const myVal = myCompany.metrics[metric]?.normalizedValue ?? null;
              const c1Val = comp1?.metrics[metric]?.normalizedValue ?? null;
              const c2Val = comp2?.metrics[metric]?.normalizedValue ?? null;
              const insight = getMultiInsight(metric, myVal, c1Val, c2Val, comp1?.name, comp2?.name);
              const canonicalUnit = METRIC_UNITS[metric] || '';
              
              // Get page references
              const myPage = getPageRef(myCompany.metrics[metric]);
              const c1Page = comp1 ? getPageRef(comp1.metrics[metric]) : null;
              const c2Page = comp2 ? getPageRef(comp2.metrics[metric]) : null;
              
              // Get relative benchmarking bars
              const bars = getRelativeBars(metric, myVal, c1Val, c2Val);
              
              // Get reasoning notes
              const reasoningNotes = getReasoningNotes(
                metric,
                myCompany.name,
                comp1,
                comp2,
                comp1?.name,
                comp2?.name
              );

              return (
                <tr key={metric}>
                  <td className="font-medium">{METRIC_LABELS[metric]}</td>
                  <td>{formatVal(myVal, canonicalUnit)}</td>
                  <td>{formatVal(c1Val, canonicalUnit)}</td>
                  <td>{formatVal(c2Val, canonicalUnit)}</td>
                  
                  {/* Sources & Page Numbers */}
                  <td className="text-xs">
                    <div className="space-y-1">
                      <div style={{ color: COLORS.myCompanyText }}>
                        {myCompany.name}: {myPage}
                      </div>
                      {comp1 && (
                        <div style={{ color: COLORS.comp1Text }}>
                          {comp1.name} ({comp1.year}): {c1Page}
                        </div>
                      )}
                      {comp2 && (
                        <div style={{ color: COLORS.comp2Text }}>
                          {comp2.name} ({comp2.year}): {c2Page}
                        </div>
                      )}
                    </div>
                  </td>
                  
                  {/* Relative Benchmarking Bar */}
                  <td style={{ minWidth: '120px' }}>
                    {bars ? (
                      <div className="space-y-1">
                        {bars.map((bar, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs w-6 text-slate-400">{bar.label}</span>
                            <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${bar.width}%`,
                                  background: bar.barColor
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">No data</span>
                    )}
                  </td>
                  
                  <td>{getIndustryAverage(metric)} {canonicalUnit}</td>
                  <td>
                    <span className={`status-badge ${insight.rankStatus}`}>
                      {insight.rankBadge}
                    </span>
                  </td>
                  <td className="text-sm text-stone-400 whitespace-pre-line">{insight.insightsText}</td>
                  
                  {/* Reasoning & Context Notes */}
                  <td style={{ maxWidth: '300px', fontSize: '0.775rem' }}>
                    {reasoningNotes.length > 0 ? (
                      <div className="space-y-2">
                        {reasoningNotes.map((note, idx) => (
                          <div key={idx} className="border-l-2 pl-2" style={{ borderColor: note.color }}>
                            <span className="font-semibold" style={{ color: note.color }}>{note.name}:</span>
                            <span className="text-slate-400 ml-1 break-words">{note.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">No reasoning available</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Saved Reports Management */}
      {savedReports.length > 0 && (
        <div className="glass-panel p-6 mt-6">
          <h3 className="text-xl font-bold mb-4">Manage Saved Reports</h3>
          <div className="grid grid-cols-3 gap-4">
            {savedReports.map(r => (
              <div key={r.id} className="bg-stone-800/50 rounded-lg p-4 flex justify-between items-start">
                <div>
                  <h4 className="font-semibold">{r.name}</h4>
                  <p className="text-sm text-stone-400">{r.industry} • {r.year} • {r.fileName}</p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${r.name}?`)) {
                      removeReport(r.id);
                      if (comp1Id === r.id) setComp1Id('');
                      if (comp2Id === r.id) setComp2Id('');
                    }
                  }}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonView;
