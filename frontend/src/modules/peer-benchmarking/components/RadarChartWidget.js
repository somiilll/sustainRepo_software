import React, { useState, useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useBenchmarking } from '../context/BenchmarkingContext';
import { METRIC_LABELS } from '../types';

const SHORT_LABELS = {
  scope1: 'Scope 1',
  scope2: 'Scope 2',
  emissionIntensityPerTurnover: 'Emissions/INR',
  treatedWaterDischarged: 'Treated Water',
  renewableEnergy: 'Renewable Energy',
  wasteRecycled: 'Waste Recycled',
  hazardousWaste: 'Haz. Waste',
  wasteIntensity: 'Waste/INR',
  ltirEmployee: 'LTIR Emp',
  ltirWorker: 'LTIFR Worker',
  dataPrivacyPolicy: 'Data Privacy',
  disciplinaryAction: 'Disciplinary',
  daysAccountsPayable: 'Days Payable'
};

export const RadarChartWidget = () => {
  const { myCompany, savedReports } = useBenchmarking();
  const [selectedMetrics, setSelectedMetrics] = useState([
    'scope1', 'scope2', 'emissionIntensityPerTurnover', 'renewableEnergy', 'wasteRecycled', 'daysAccountsPayable'
  ]);
  const [selectedCompetitors, setSelectedCompetitors] = useState([]);

  const toggleCompetitor = (id) => {
    setSelectedCompetitors(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const chartData = useMemo(() => {
    return selectedMetrics.map(metricKey => {
      const dataPoint = {
        subject: SHORT_LABELS[metricKey],
        fullLabel: METRIC_LABELS[metricKey],
      };

      let maxVal = myCompany.metrics[metricKey]?.normalizedValue || 1;
      const compReports = savedReports.filter(r => selectedCompetitors.includes(r.id));
      compReports.forEach(r => {
        if (r.metrics[metricKey]?.normalizedValue != null && r.metrics[metricKey]?.normalizedValue > maxVal) {
          maxVal = r.metrics[metricKey]?.normalizedValue;
        }
      });

      if (maxVal === 0) maxVal = 1;
      dataPoint['My Company'] = ((myCompany.metrics[metricKey]?.normalizedValue || 0) / maxVal) * 100;

      compReports.forEach(r => {
        dataPoint[r.name] = ((r.metrics[metricKey]?.normalizedValue || 0) / maxVal) * 100;
      });

      return dataPoint;
    });
  }, [myCompany, savedReports, selectedMetrics, selectedCompetitors]);

  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="glass-panel p-6" style={{ marginTop: '1.5rem' }}>
      <h3 className="text-xl font-bold mb-2">Benchmarking Radar</h3>
      <p className="text-stone-400 text-sm mb-4">Compare normalized metrics (Scale 0-100 relative to max)</p>

      <div className="mb-4">
        <span className="text-sm text-stone-400 mr-2">Select Metrics (up to 6)</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
          {Object.keys(METRIC_LABELS).map(key => {
            if (['dataPrivacyPolicy'].includes(key)) return null;
            const isSelected = selectedMetrics.includes(key);
            return (
              <button
                key={key}
                onClick={() => {
                  if (isSelected) {
                    setSelectedMetrics(prev => prev.filter(m => m !== key));
                  } else if (selectedMetrics.length < 6) {
                    setSelectedMetrics(prev => [...prev, key]);
                  }
                }}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  isSelected 
                    ? 'border-blue-500 bg-blue-500/20 text-blue-400' 
                    : 'border-stone-600 text-stone-400 hover:border-stone-500'
                }`}
              >
                {SHORT_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <div style={{ width: '180px' }}>
          <div className="text-sm text-stone-400 mb-2">Select Peers:</div>
          {savedReports.map(r => (
            <div
              key={r.id}
              onClick={() => toggleCompetitor(r.id)}
              className={`cursor-pointer p-2 rounded mb-1 text-sm transition-colors ${
                selectedCompetitors.includes(r.id) 
                  ? 'bg-blue-500/20 text-blue-400' 
                  : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
              }`}
            >
              {r.name} {r.year}
            </div>
          ))}
          {savedReports.length === 0 && (
            <p className="text-stone-500 text-xs">No peers saved yet. Upload reports first.</p>
          )}
        </div>

        <div style={{ flex: 1, height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip 
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f8fafc' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <Radar name="My Company" dataKey="My Company" stroke={colors[0]} fill={colors[0]} fillOpacity={0.3} />
              {savedReports.filter(r => selectedCompetitors.includes(r.id)).map((r, i) => (
                <Radar key={r.id} name={r.name} dataKey={r.name} stroke={colors[(i + 1) % colors.length]} fill={colors[(i + 1) % colors.length]} fillOpacity={0.2} />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default RadarChartWidget;
