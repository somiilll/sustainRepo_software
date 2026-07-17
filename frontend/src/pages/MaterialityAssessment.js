import React, { useState, useMemo, useCallback } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceArea, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, ChevronRight, ArrowUpDown, Filter, TrendingUp, Shield, Leaf } from 'lucide-react';

const CATEGORIES = {
  Environmental: { color: '#059669', bg: '#ecfdf5', icon: Leaf },
  Social: { color: '#ea580c', bg: '#fff7ed', icon: TrendingUp },
  Governance: { color: '#2563eb', bg: '#eff6ff', icon: Shield },
};

const GRI_TOPICS = [
  { id: 'GRI301', code: 'GRI 301', topic: 'Materials', category: 'Environmental', businessImpact: 2.4, stakeholderImpact: 2.8, priority: 'Medium', description: 'Materials used by weight or volume, recycled input materials, reclaimed products.' },
  { id: 'GRI302', code: 'GRI 302', topic: 'Energy', category: 'Environmental', businessImpact: 4.2, stakeholderImpact: 4.5, priority: 'High', description: 'Energy consumption, intensity, and reduction initiatives.' },
  { id: 'GRI303', code: 'GRI 303', topic: 'Water & Effluents', category: 'Environmental', businessImpact: 3.1, stakeholderImpact: 4.2, priority: 'High', description: 'Water withdrawal, discharge, and consumption across operations.' },
  { id: 'GRI304', code: 'GRI 304', topic: 'Biodiversity', category: 'Environmental', businessImpact: 1.6, stakeholderImpact: 3.4, priority: 'Medium', description: 'Operational sites in or near areas of high biodiversity value.' },
  { id: 'GRI305', code: 'GRI 305', topic: 'Emissions', category: 'Environmental', businessImpact: 4.8, stakeholderImpact: 4.9, priority: 'Critical', description: 'Direct and indirect GHG emissions, intensity, and reduction.' },
  { id: 'GRI306', code: 'GRI 306', topic: 'Waste', category: 'Environmental', businessImpact: 2.7, stakeholderImpact: 3.3, priority: 'Medium', description: 'Waste generation, diversion from disposal, and directed to disposal.' },
  { id: 'GRI308', code: 'GRI 308', topic: 'Supplier Env. Assessment', category: 'Environmental', businessImpact: 1.8, stakeholderImpact: 2.1, priority: 'Low', description: 'Environmental criteria in supplier screening and assessment.' },
  { id: 'GRI401', code: 'GRI 401', topic: 'Employment', category: 'Social', businessImpact: 3.8, stakeholderImpact: 2.5, priority: 'Medium', description: 'New hires, turnover, benefits, and parental leave.' },
  { id: 'GRI403', code: 'GRI 403', topic: 'Health & Safety', category: 'Social', businessImpact: 4.5, stakeholderImpact: 4.7, priority: 'Critical', description: 'Occupational health management, hazard identification, injury rates.' },
  { id: 'GRI404', code: 'GRI 404', topic: 'Training & Education', category: 'Social', businessImpact: 2.2, stakeholderImpact: 3.0, priority: 'Medium', description: 'Average training hours, skills management, and career development.' },
  { id: 'GRI405', code: 'GRI 405', topic: 'Diversity & Equal Opp.', category: 'Social', businessImpact: 2.9, stakeholderImpact: 4.4, priority: 'High', description: 'Diversity in governance bodies and across employee categories.' },
  { id: 'GRI406', code: 'GRI 406', topic: 'Non-discrimination', category: 'Social', businessImpact: 2.3, stakeholderImpact: 4.1, priority: 'High', description: 'Incidents of discrimination and corrective actions taken.' },
  { id: 'GRI408', code: 'GRI 408', topic: 'Child Labor', category: 'Social', businessImpact: 1.5, stakeholderImpact: 4.6, priority: 'High', description: 'Operations and suppliers at risk for child labor.' },
  { id: 'GRI409', code: 'GRI 409', topic: 'Forced Labor', category: 'Social', businessImpact: 1.4, stakeholderImpact: 4.5, priority: 'High', description: 'Operations and suppliers at risk for forced or compulsory labor.' },
  { id: 'GRI413', code: 'GRI 413', topic: 'Local Communities', category: 'Social', businessImpact: 1.7, stakeholderImpact: 3.2, priority: 'Medium', description: 'Community engagement, impact assessments, and development programs.' },
  { id: 'GRI414', code: 'GRI 414', topic: 'Supplier Social Assessment', category: 'Social', businessImpact: 2.0, stakeholderImpact: 1.8, priority: 'Low', description: 'Social criteria in supplier screening and assessment.' },
  { id: 'GRI418', code: 'GRI 418', topic: 'Customer Privacy', category: 'Social', businessImpact: 4.1, stakeholderImpact: 3.2, priority: 'High', description: 'Substantiated complaints regarding breaches of customer privacy.' },
  { id: 'GRI201', code: 'GRI 201', topic: 'Economic Performance', category: 'Governance', businessImpact: 4.7, stakeholderImpact: 2.6, priority: 'High', description: 'Direct economic value generated and distributed.' },
  { id: 'GRI202', code: 'GRI 202', topic: 'Market Presence', category: 'Governance', businessImpact: 3.3, stakeholderImpact: 1.9, priority: 'Medium', description: 'Entry-level wage ratios and local hiring practices.' },
  { id: 'GRI203', code: 'GRI 203', topic: 'Indirect Economic Impacts', category: 'Governance', businessImpact: 1.9, stakeholderImpact: 3.5, priority: 'Medium', description: 'Infrastructure investments and services supported.' },
  { id: 'GRI205', code: 'GRI 205', topic: 'Anti-corruption', category: 'Governance', businessImpact: 4.3, stakeholderImpact: 4.6, priority: 'Critical', description: 'Risk assessments, anti-corruption training, and confirmed incidents.' },
  { id: 'GRI206', code: 'GRI 206', topic: 'Anti-competitive Behavior', category: 'Governance', businessImpact: 3.7, stakeholderImpact: 1.5, priority: 'Medium', description: 'Legal actions for anti-competitive behavior and antitrust.' },
  { id: 'GRI207', code: 'GRI 207', topic: 'Tax', category: 'Governance', businessImpact: 3.9, stakeholderImpact: 2.2, priority: 'Medium', description: 'Tax governance, control, and risk management approach.' },
];

const PRIORITY_CONFIG = {
  Critical: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  High: { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  Medium: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  Low: { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
};

const CustomDot = (props) => {
  const { cx, cy, payload, selectedId, onSelect } = props;
  if (!payload) return null;
  const cat = CATEGORIES[payload.category];
  const isSelected = selectedId === payload.id;
  const r = isSelected ? 15 : 11;

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onSelect(payload); }}
      style={{ cursor: 'pointer' }}
      data-testid={`matrix-dot-${payload.id}`}
    >
      {isSelected && (
        <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={cat.color} strokeWidth={2} opacity={0.3}>
          <animate attributeName="r" values={`${r + 3};${r + 7};${r + 3}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy} r={r} fill={cat.color} stroke="#fff" strokeWidth={2}
        style={{ filter: isSelected ? `drop-shadow(0 0 6px ${cat.color}66)` : 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))' }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill="#fff" fontSize={7} fontWeight={700} style={{ pointerEvents: 'none' }}>
        {payload.code.replace('GRI ', '')}
      </text>
    </g>
  );
};

const CustomTooltip = ({ active, payload: tooltipPayload }) => {
  if (!active || !tooltipPayload?.length) return null;
  const d = tooltipPayload[0].payload;
  const cat = CATEGORIES[d.category];
  const pri = PRIORITY_CONFIG[d.priority];
  return (
    <div className="rounded-lg border border-stone-200 bg-white/95 backdrop-blur-md p-3 shadow-xl min-w-[200px]" data-testid="matrix-tooltip">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
        <span className="text-xs font-bold text-stone-900">{d.code} — {d.topic}</span>
      </div>
      <div className="space-y-1 text-xs text-stone-600">
        <div className="flex justify-between"><span>Business Impact</span><span className="font-semibold text-stone-800">{d.businessImpact}</span></div>
        <div className="flex justify-between"><span>Stakeholder Impact</span><span className="font-semibold text-stone-800">{d.stakeholderImpact}</span></div>
        <div className="flex justify-between"><span>Materiality Score</span><span className="font-bold text-stone-900">{((d.businessImpact + d.stakeholderImpact) / 2).toFixed(1)}</span></div>
        <div className="flex justify-between items-center"><span>Priority</span><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: pri.bg, color: pri.color, border: `1px solid ${pri.border}` }}>{d.priority}</span></div>
      </div>
    </div>
  );
};

function TopicDrawer({ topic, onClose }) {
  if (!topic) return null;
  const cat = CATEGORIES[topic.category];
  const pri = PRIORITY_CONFIG[topic.priority];
  const score = ((topic.businessImpact + topic.stakeholderImpact) / 2).toFixed(1);

  return (
    <AnimatePresence>
      <motion.div
        key="drawer-backdrop"
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        data-testid="drawer-backdrop"
      />
      <motion.div
        key="drawer-panel"
        className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-[90vw] bg-white/95 backdrop-blur-xl border-l border-stone-200 shadow-2xl overflow-y-auto"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        data-testid="topic-drawer"
      >
        <div className="sticky top-0 z-10 border-b border-stone-100 px-6 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${cat.bg}, white)` }}>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold shadow-md"
              style={{ backgroundColor: cat.color }}>
              {topic.code.replace('GRI ', '')}
            </span>
            <div>
              <h3 className="text-sm font-bold text-stone-900">{topic.topic}</h3>
              <p className="text-xs text-stone-500">{topic.code} · {topic.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-stone-100 transition-colors" data-testid="drawer-close-btn">
            <X className="h-4 w-4 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Score Cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Business', value: topic.businessImpact, max: 5 },
              { label: 'Stakeholder', value: topic.stakeholderImpact, max: 5 },
              { label: 'Overall', value: score, max: 5 },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-stone-50 border border-stone-100 p-3 text-center">
                <p className="text-[10px] font-medium text-stone-500 mb-1">{s.label}</p>
                <p className="text-lg font-bold text-stone-900">{s.value}</p>
                <div className="mt-1.5 h-1 rounded-full bg-stone-200 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(s.value / s.max) * 100}%`, backgroundColor: cat.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Priority + Category */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border p-3" style={{ borderColor: pri.border, backgroundColor: pri.bg }}>
              <p className="text-[10px] font-medium text-stone-500 mb-1">Priority Level</p>
              <p className="text-sm font-bold" style={{ color: pri.color }}>{topic.priority}</p>
            </div>
            <div className="flex-1 rounded-xl border p-3" style={{ borderColor: cat.color + '33', backgroundColor: cat.bg }}>
              <p className="text-[10px] font-medium text-stone-500 mb-1">Category</p>
              <p className="text-sm font-bold" style={{ color: cat.color }}>{topic.category}</p>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl bg-stone-50 border border-stone-100 p-4">
            <h4 className="text-xs font-semibold text-stone-700 mb-2">Description</h4>
            <p className="text-sm text-stone-600 leading-relaxed">{topic.description}</p>
          </div>

          {/* Placeholders */}
          {/* <div className="rounded-xl border border-dashed border-stone-200 p-4">
            <h4 className="text-xs font-semibold text-stone-500 mb-1">Linked KPIs & Targets</h4>
            <p className="text-xs text-stone-400">No KPIs linked yet. Configure in Targets module.</p>
          </div>
          <div className="rounded-xl border border-dashed border-stone-200 p-4">
            <h4 className="text-xs font-semibold text-stone-500 mb-1">Evidence & Documents</h4>
            <p className="text-xs text-stone-400">No evidence uploaded yet.</p>
          </div> */}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function MaterialityAssessment() {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [sortKey, setSortKey] = useState('priority');
  const [cutoffX, setCutoffX] = useState(3.0);
  const [cutoffY, setCutoffY] = useState(3.0);

  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const filtered = useMemo(() => {
    let data = [...GRI_TOPICS];
    if (categoryFilter !== 'All') data = data.filter(t => t.category === categoryFilter);
    if (priorityFilter !== 'All') data = data.filter(t => t.priority === priorityFilter);
    if (search) data = data.filter(t => t.topic.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase()));
    data.sort((a, b) => {
      if (sortKey === 'priority') return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (sortKey === 'score') return ((b.businessImpact + b.stakeholderImpact) / 2) - ((a.businessImpact + a.stakeholderImpact) / 2);
      if (sortKey === 'business') return b.businessImpact - a.businessImpact;
      if (sortKey === 'stakeholder') return b.stakeholderImpact - a.stakeholderImpact;
      return 0;
    });
    return data;
  }, [categoryFilter, priorityFilter, search, sortKey]);

  const matrixData = useMemo(() => {
    const base = categoryFilter !== 'All' ? GRI_TOPICS.filter(t => t.category === categoryFilter) : GRI_TOPICS;
    return base.map(t => ({ ...t, x: t.businessImpact, y: t.stakeholderImpact }));
  }, [categoryFilter]);

  const handleSelect = useCallback((topic) => {
    setSelected(prev => prev?.id === topic.id ? null : topic);
  }, []);

  const stats = useMemo(() => ({
    critical: GRI_TOPICS.filter(t => t.priority === 'Critical').length,
    high: GRI_TOPICS.filter(t => t.priority === 'High').length,
    avgScore: (GRI_TOPICS.reduce((s, t) => s + (t.businessImpact + t.stakeholderImpact) / 2, 0) / GRI_TOPICS.length).toFixed(1),
    total: GRI_TOPICS.length,
  }), []);

  const handleSort = useCallback((key) => {
    setSortKey(prev => prev === key ? 'priority' : key);
  }, []);

  return (
    <div className="space-y-6" data-testid="materiality-assessment">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Materiality Assessment</h1>
        <p className="text-sm text-stone-500 mt-0.5">GRI-aligned double materiality matrix — Business Impact vs. Stakeholder Impact</p>
      </motion.div>

      {/* Summary Stats */}
      <motion.div className="grid grid-cols-2 sm:grid-cols-4 gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
        {[
          { label: 'Total Topics', value: stats.total, color: '#57534e' },
          { label: 'Critical', value: stats.critical, color: '#dc2626' },
          { label: 'High Priority', value: stats.high, color: '#059669' },
          { label: 'Avg. Score', value: stats.avgScore, color: '#2563eb' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white px-4 py-3" data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, '-')}`}>
            <p className="text-[11px] font-medium text-stone-500">{s.label}</p>
            <p className="text-xl font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div className="flex flex-wrap items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-stone-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..."
            className="h-8 rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 w-52 transition-all"
            data-testid="materiality-search" />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-stone-400" />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            data-testid="materiality-category-filter">
            <option value="All">All Categories</option>
            {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            data-testid="materiality-priority-filter">
            <option value="All">All Priorities</option>
            {Object.keys(PRIORITY_CONFIG).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {Object.entries(CATEGORIES).map(([name, cfg]) => (
            <span key={name} className="flex items-center gap-1.5 text-xs text-stone-600">
              <span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: cfg.color }} />
              {name}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Matrix + Table */}
      <div className="flex gap-5 flex-col xl:flex-row">
        {/* Left: Recharts Matrix */}
        <motion.div
          className="shrink-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
          style={{ minWidth: 520, maxWidth: 560 }}
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.15 }}
          data-testid="materiality-matrix-card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-800">Materiality Matrix</h2>
          </div>

          {/* Cutoff Controls */}
          <div className="flex gap-4 mb-4 p-3 rounded-lg bg-stone-50 border border-stone-100">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Business Cutoff</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min="1" max="5" step="0.1" value={cutoffX}
                  onChange={e => setCutoffX(parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-stone-600"
                  data-testid="cutoff-x-slider" />
                <span className="text-xs font-bold text-stone-700 w-7 text-right">{cutoffX.toFixed(1)}</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Stakeholder Cutoff</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min="1" max="5" step="0.1" value={cutoffY}
                  onChange={e => setCutoffY(parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-stone-600"
                  data-testid="cutoff-y-slider" />
                <span className="text-xs font-bold text-stone-700 w-7 text-right">{cutoffY.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={440}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 35, left: 20 }}>
              {/* Zone: Below both cutoffs — grey */}
              <ReferenceArea x1={1} x2={cutoffX} y1={1} y2={cutoffY} fill="#e7e5e4" fillOpacity={0.45} strokeOpacity={0} />
              {/* Zone: Above both cutoffs — green */}
              <ReferenceArea x1={cutoffX} x2={5} y1={cutoffY} y2={5} fill="#bbf7d0" fillOpacity={0.4} strokeOpacity={0} />
              {/* Zone: Above stakeholder cutoff, below business — yellow */}
              <ReferenceArea x1={1} x2={cutoffX} y1={cutoffY} y2={5} fill="#fef08a" fillOpacity={0.35} strokeOpacity={0} />
              {/* Zone: Below stakeholder cutoff, above business — yellow */}
              <ReferenceArea x1={cutoffX} x2={5} y1={1} y2={cutoffY} fill="#fef08a" fillOpacity={0.35} strokeOpacity={0} />

              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" strokeOpacity={0.6} />

              {/* Cutoff Reference Lines */}
              <ReferenceLine x={cutoffX} stroke="#78716c" strokeWidth={1.5} strokeDasharray="6 4" label={{ value: `B: ${cutoffX.toFixed(1)}`, position: 'top', fontSize: 9, fill: '#57534e', fontWeight: 600 }} />
              <ReferenceLine y={cutoffY} stroke="#78716c" strokeWidth={1.5} strokeDasharray="6 4" label={{ value: `S: ${cutoffY.toFixed(1)}`, position: 'right', fontSize: 9, fill: '#57534e', fontWeight: 600 }} />

              <XAxis type="number" dataKey="x" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                tickFormatter={(v) => ['', 'Very Low', 'Low', 'Medium', 'High', 'Very High'][v]}
                tick={{ fontSize: 10, fill: '#78716c' }} axisLine={{ stroke: '#d6d3d1' }}
                label={{ value: 'Impact to Business →', position: 'bottom', offset: 15, style: { fontSize: 11, fontWeight: 600, fill: '#57534e' } }}
              />
              <YAxis type="number" dataKey="y" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]}
                tickFormatter={(v) => ['', 'Very Low', 'Low', 'Medium', 'High', 'Very High'][v]}
                tick={{ fontSize: 10, fill: '#78716c' }} axisLine={{ stroke: '#d6d3d1' }} width={55}
                label={{ value: 'Impact on Stakeholders →', angle: -90, position: 'insideLeft', offset: -5, style: { fontSize: 11, fontWeight: 600, fill: '#57534e' } }}
              />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Scatter data={matrixData}
                shape={(props) => <CustomDot {...props} selectedId={selected?.id} onSelect={handleSelect} />}
              >
                {matrixData.map((entry) => (
                  <Cell key={entry.id} fill={CATEGORIES[entry.category].color} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          {/* Zone Labels */}
          <div className="flex items-center justify-between px-4 mt-2">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-stone-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-stone-300/60" /> Not Material
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-amber-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-200/70" /> Monitor
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200/70" /> Material
            </span>
          </div>
        </motion.div>

        {/* Right: Data Table */}
        <motion.div
          className="flex-1 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden min-w-0"
          initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.2 }}
          data-testid="materiality-table-card"
        >
          <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-800">GRI Topics</h2>
            <span className="text-xs text-stone-500">{filtered.length} topics</span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 500 }}>
            <table className="w-full text-sm" data-testid="materiality-table">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-stone-100 bg-stone-50/95 backdrop-blur text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Topic</th>
                  <th className="px-4 py-2.5 hidden lg:table-cell">Category</th>
                  <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800 select-none" onClick={() => handleSort('business')}>
                    <span className="flex items-center gap-1">Biz <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800 select-none" onClick={() => handleSort('stakeholder')}>
                    <span className="flex items-center gap-1">Stake <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800 select-none" onClick={() => handleSort('score')}>
                    <span className="flex items-center gap-1">Score <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800 select-none" onClick={() => handleSort('priority')}>
                    <span className="flex items-center gap-1">Priority <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="px-4 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, idx) => {
                  const score = ((t.businessImpact + t.stakeholderImpact) / 2).toFixed(1);
                  const cat = CATEGORIES[t.category];
                  const pri = PRIORITY_CONFIG[t.priority];
                  const isSelected = selected?.id === t.id;
                  return (
                    <motion.tr
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className={`border-b border-stone-50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/50' : 'hover:bg-stone-50/70'}`}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                      data-testid={`table-row-${t.id}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: cat.color }}>{t.code}</td>
                      <td className="px-4 py-2.5 font-medium text-stone-800 text-xs">{t.topic}</td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: cat.bg, color: cat.color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          {t.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-xs text-stone-700">{t.businessImpact}</td>
                      <td className="px-4 py-2.5 font-semibold text-xs text-stone-700">{t.stakeholderImpact}</td>
                      <td className="px-4 py-2.5 font-bold text-xs text-stone-900">{score}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: pri.bg, color: pri.color, border: `1px solid ${pri.border}` }}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><ChevronRight className="h-3.5 w-3.5 text-stone-300" /></td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {selected && <TopicDrawer topic={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
