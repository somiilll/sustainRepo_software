import React, { useState } from 'react';
import { useBenchmarking } from '../context/BenchmarkingContext';
import { METRIC_LABELS } from '../types';
import { RadarChartWidget } from './RadarChartWidget';
import { ExecutiveSummaryWidget } from './ExecutiveSummaryWidget';
import { PrintableReport } from './PrintableReport';
import { AlertCircle, Trash2, Loader2, Database, RefreshCw, Calendar } from 'lucide-react';

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

export const ComparisonView = () => {
  const { 
    myCompany, 
    savedReports, 
    removeReport, 
    loading, 
    error, 
    refreshMyCompany,
    availableYears,
    selectedYear,
    changeYear
  } = useBenchmarking();
  const [comp1Id, setComp1Id] = useState(savedReports[0]?.id || '');
  const [comp2Id, setComp2Id] = useState(savedReports[1]?.id || '');
  const [execSummary, setExecSummary] = useState(null);

  const comp1 = savedReports.find(r => r.id === comp1Id);
  const comp2 = savedReports.find(r => r.id === comp2Id);

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

      {/* Internal Data Indicator with Year Selector */}
      {myCompany.data_source === 'internal' && (
        <div className="glass-panel p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-green-600" />
              <div>
                <span className="text-green-700 font-semibold">{myCompany.name}</span>
                <span className="text-slate-500 text-sm ml-2">• {myCompany.industry}</span>
                <p className="text-xs text-slate-400">Data sourced from your internal ESG records</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Year Selector */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedYear}
                  onChange={(e) => changeYear(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={refreshMyCompany}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
          {selectedYear !== 'All Data' && (
            <div className="mt-2 text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full inline-block">
              Showing data for: {selectedYear}
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
              <th>Avg. of Peers</th>
              <th>Rank</th>
              <th>Insights</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(METRIC_LABELS).map(metric => {
              const myVal = myCompany.metrics[metric]?.normalizedValue ?? null;
              const c1Val = comp1?.metrics[metric]?.normalizedValue ?? null;
              const c2Val = comp2?.metrics[metric]?.normalizedValue ?? null;
              const insight = getMultiInsight(metric, myVal, c1Val, c2Val, comp1?.name, comp2?.name);
              const canonicalUnit = METRIC_UNITS[metric] || '';

              return (
                <tr key={metric}>
                  <td className="font-medium">{METRIC_LABELS[metric]}</td>
                  <td>{formatVal(myVal, canonicalUnit)}</td>
                  <td>{formatVal(c1Val, canonicalUnit)}</td>
                  <td>{formatVal(c2Val, canonicalUnit)}</td>
                  <td>{getIndustryAverage(metric)} {canonicalUnit}</td>
                  <td>
                    <span className={`status-badge ${insight.rankStatus}`}>
                      {insight.rankBadge}
                    </span>
                  </td>
                  <td className="text-sm text-stone-400 whitespace-pre-line">{insight.insightsText}</td>
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
