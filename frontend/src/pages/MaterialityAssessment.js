import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceArea, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, ChevronRight, ArrowUpDown, Filter, TrendingUp, Shield, Leaf, Plus, Trash2, Save, RotateCcw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = {
  Environmental: { color: '#059669', bg: '#ecfdf5', icon: Leaf },
  Social: { color: '#ea580c', bg: '#fff7ed', icon: TrendingUp },
  Governance: { color: '#2563eb', bg: '#eff6ff', icon: Shield },
};

const STATUS_CONFIG = {
  material: { color: '#059669', bg: '#ecfdf5', label: 'Material' },
  monitor: { color: '#d97706', bg: '#fffbeb', label: 'Monitor' },
  non_material: { color: '#6b7280', bg: '#f9fafb', label: 'Not Material' },
};

// =============================================================================
// COMPONENTS
// =============================================================================

const CustomDot = (props) => {
  const { cx, cy, payload, selectedId, onSelect } = props;
  if (!payload) return null;
  const cat = CATEGORIES[payload.category] || CATEGORIES.Environmental;
  const isSelected = selectedId === payload.id;
  const r = isSelected ? 15 : 11;

  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(payload); }} style={{ cursor: 'pointer' }} data-testid={`matrix-dot-${payload.topic_code}`}>
      {isSelected && (
        <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={cat.color} strokeWidth={2} opacity={0.3}>
          <animate attributeName="r" values={`${r + 3};${r + 7};${r + 3}`} dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy} r={r} fill={cat.color} stroke={payload.has_override ? '#fbbf24' : '#fff'} strokeWidth={payload.has_override ? 3 : 2}
        style={{ filter: isSelected ? `drop-shadow(0 0 6px ${cat.color}66)` : 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))' }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={7} fontWeight={700} style={{ pointerEvents: 'none' }}>
        {payload.topic_code}
      </text>
    </g>
  );
};

const CustomTooltip = ({ active, payload: tooltipPayload }) => {
  if (!active || !tooltipPayload?.length) return null;
  const d = tooltipPayload[0].payload;
  const cat = CATEGORIES[d.category] || CATEGORIES.Environmental;
  const status = STATUS_CONFIG[d.final_status] || STATUS_CONFIG.non_material;
  return (
    <div className="rounded-lg border border-stone-200 bg-white/95 backdrop-blur-md p-3 shadow-xl min-w-[200px]" data-testid="matrix-tooltip">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
        <span className="text-xs font-bold text-stone-900">{d.topic_code} — {d.topic_name}</span>
      </div>
      <div className="space-y-1 text-xs text-stone-600">
        <div className="flex justify-between"><span>Business Impact</span><span className="font-semibold text-stone-800">{d.x?.toFixed(1)}</span></div>
        <div className="flex justify-between"><span>Stakeholder Impact</span><span className="font-semibold text-stone-800">{d.y?.toFixed(1)}</span></div>
        <div className="flex justify-between items-center">
          <span>Status</span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: status.bg, color: status.color }}>
            {status.label} {d.has_override && '(Override)'}
          </span>
        </div>
      </div>
    </div>
  );
};

function TopicDrawer({ topic, assessment, onClose, onScoreUpdate, onOverride, onClearOverride }) {
  const [businessScore, setBusinessScore] = useState(topic?.business_score || '');
  const [stakeholderScore, setStakeholderScore] = useState(topic?.stakeholder_score || '');
  const [saving, setSaving] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    setBusinessScore(topic?.business_score ?? '');
    setStakeholderScore(topic?.stakeholder_score ?? '');
    setOverrideReason(topic?.override_reason || '');
  }, [topic]);

  if (!topic) return null;

  const cat = CATEGORIES[topic.category] || CATEGORIES.Environmental;
  const status = STATUS_CONFIG[topic.final_status] || STATUS_CONFIG.non_material;
  const autoStatus = STATUS_CONFIG[topic.auto_status] || STATUS_CONFIG.non_material;
  const scaleMax = assessment?.scale_max || 5;

  const handleSaveScore = async () => {
    const biz = parseFloat(businessScore);
    const stake = parseFloat(stakeholderScore);
    if (isNaN(biz) || isNaN(stake)) {
      toast.error('Please enter valid scores');
      return;
    }
    setSaving(true);
    try {
      await onScoreUpdate(topic.topic_id, biz, stake);
      toast.success('Scores saved');
    } catch (e) {
      toast.error('Failed to save scores');
    }
    setSaving(false);
  };

  const handleOverride = async (isMaterial) => {
    setSaving(true);
    try {
      await onOverride(topic.topic_id, isMaterial, overrideReason);
      toast.success(isMaterial ? 'Marked as Material' : 'Marked as Not Material');
    } catch (e) {
      toast.error('Failed to set override');
    }
    setSaving(false);
  };

  const handleClearOverride = async () => {
    setSaving(true);
    try {
      await onClearOverride(topic.topic_id);
      toast.success('Override cleared');
    } catch (e) {
      toast.error('Failed to clear override');
    }
    setSaving(false);
  };

  return (
    <AnimatePresence>
      <motion.div key="drawer-backdrop" className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} data-testid="drawer-backdrop" />
      <motion.div key="drawer-panel" className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-[90vw] bg-white/95 backdrop-blur-xl border-l border-stone-200 shadow-2xl overflow-y-auto"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} data-testid="topic-drawer">
        <div className="sticky top-0 z-10 border-b border-stone-100 px-6 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${cat.bg}, white)` }}>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold shadow-md" style={{ backgroundColor: cat.color }}>
              {topic.topic_code}
            </span>
            <div>
              <h3 className="text-sm font-bold text-stone-900">{topic.topic_name}</h3>
              <p className="text-xs text-stone-500">GRI {topic.topic_code} · {topic.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-stone-100 transition-colors" data-testid="drawer-close-btn">
            <X className="h-4 w-4 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Score Input */}
          <div className="rounded-xl border border-stone-200 p-4 space-y-4">
            <h4 className="text-xs font-semibold text-stone-700">Score Topic (1-{scaleMax})</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-medium text-stone-500 mb-1 block">Business Impact</label>
                <input type="number" min="1" max={scaleMax} step="0.1" value={businessScore}
                  onChange={(e) => setBusinessScore(e.target.value)}
                  className="w-full h-9 rounded-lg border border-stone-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  data-testid="score-business-input" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-stone-500 mb-1 block">Stakeholder Impact</label>
                <input type="number" min="1" max={scaleMax} step="0.1" value={stakeholderScore}
                  onChange={(e) => setStakeholderScore(e.target.value)}
                  className="w-full h-9 rounded-lg border border-stone-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  data-testid="score-stakeholder-input" />
              </div>
            </div>
            <button onClick={handleSaveScore} disabled={saving}
              className="w-full h-9 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="save-score-btn">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Scores
            </button>
          </div>

          {/* Current Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-3" style={{ borderColor: autoStatus.color + '33', backgroundColor: autoStatus.bg }}>
              <p className="text-[10px] font-medium text-stone-500 mb-1">Auto Result</p>
              <p className="text-sm font-bold" style={{ color: autoStatus.color }}>{autoStatus.label}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: status.color + '33', backgroundColor: status.bg }}>
              <p className="text-[10px] font-medium text-stone-500 mb-1">Final Decision</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold" style={{ color: status.color }}>{status.label}</p>
                {topic.has_override && <span className="text-[9px] text-amber-600 font-medium">(Override)</span>}
              </div>
            </div>
          </div>

          {/* Override Controls */}
          <div className="rounded-xl border border-stone-200 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-stone-700">Manual Override</h4>
            <p className="text-[11px] text-stone-500">Override the automatic classification if business requirements differ.</p>
            <input type="text" placeholder="Override reason (optional)" value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full h-8 rounded-lg border border-stone-200 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              data-testid="override-reason-input" />
            <div className="flex gap-2">
              <button onClick={() => handleOverride(true)} disabled={saving}
                className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1"
                data-testid="override-material-btn">
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark Material
              </button>
              <button onClick={() => handleOverride(false)} disabled={saving}
                className="flex-1 h-8 rounded-lg bg-stone-600 text-white text-xs font-medium hover:bg-stone-700 disabled:opacity-50 flex items-center justify-center gap-1"
                data-testid="override-not-material-btn">
                <AlertCircle className="h-3.5 w-3.5" /> Not Material
              </button>
            </div>
            {topic.has_override && (
              <button onClick={handleClearOverride} disabled={saving}
                className="w-full h-8 rounded-lg border border-stone-300 text-stone-600 text-xs font-medium hover:bg-stone-50 flex items-center justify-center gap-1"
                data-testid="clear-override-btn">
                <RotateCcw className="h-3.5 w-3.5" /> Clear Override (Use Auto Result)
              </button>
            )}
            {topic.override_reason && (
              <p className="text-[10px] text-stone-500 italic">Reason: {topic.override_reason}</p>
            )}
          </div>

          {/* Description */}
          {topic.description && (
            <div className="rounded-xl bg-stone-50 border border-stone-100 p-4">
              <h4 className="text-xs font-semibold text-stone-700 mb-2">Description</h4>
              <p className="text-sm text-stone-600 leading-relaxed">{topic.description}</p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function TopicSelectorModal({ open, onClose, masterTopics, selectedTopicIds, onAddTopics }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  const availableTopics = useMemo(() => {
    return masterTopics.filter(t => !selectedTopicIds.has(t.id));
  }, [masterTopics, selectedTopicIds]);

  const filtered = useMemo(() => {
    if (!search) return availableTopics;
    return availableTopics.filter(t =>
      t.topic_name.toLowerCase().includes(search.toLowerCase()) ||
      t.topic_code.toLowerCase().includes(search.toLowerCase())
    );
  }, [availableTopics, search]);

  const toggleTopic = (id) => {
    setSelected(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleAdd = () => {
    onAddTopics([...selected]);
    setSelected(new Set());
    setSearch('');
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div className="bg-white rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          onClick={e => e.stopPropagation()} data-testid="topic-selector-modal">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">Add Topics to Assessment</h3>
            <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg"><X className="h-4 w-4" /></button>
          </div>
          <div className="p-4">
            <input type="text" placeholder="Search topics..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-9 rounded-lg border border-stone-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              data-testid="topic-search-input" />
          </div>
          <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 350 }}>
            {filtered.length === 0 ? (
              <p className="text-sm text-stone-500 text-center py-8">No topics available</p>
            ) : (
              <div className="space-y-1">
                {filtered.map(t => {
                  const cat = CATEGORIES[t.category] || CATEGORIES.Environmental;
                  const isSelected = selected.has(t.id);
                  return (
                    <div key={t.id} onClick={() => toggleTopic(t.id)}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-stone-50 border border-transparent'}`}
                      data-testid={`topic-option-${t.topic_code}`}>
                      <span className="h-6 w-6 rounded-lg text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: cat.color }}>
                        {t.topic_code}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-800 truncate">{t.topic_name}</p>
                        <p className="text-[10px] text-stone-500">{t.category}</p>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-between">
            <span className="text-xs text-stone-500">{selected.size} selected</span>
            <button onClick={handleAdd} disabled={selected.size === 0}
              className="h-8 px-4 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
              data-testid="add-topics-btn">
              Add Selected Topics
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function MaterialityAssessment() {
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState(null);
  const [topics, setTopics] = useState([]);
  const [masterTopics, setMasterTopics] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortKey, setSortKey] = useState('topic_code');
  const [showTopicSelector, setShowTopicSelector] = useState(false);
  const [savingCutoffs, setSavingCutoffs] = useState(false);

  // Get token
  const getToken = () => localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${getToken()}` };

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const fetchMasterTopics = async () => {
    try {
      const res = await axios.get(`${API}/api/materiality/topics`, { headers });
      setMasterTopics(res.data.topics || []);
    } catch (e) {
      console.error('Failed to load master topics', e);
    }
  };

  const fetchOrCreateAssessment = async () => {
    try {
      // Try to get current year assessment
      const currentYear = new Date().getFullYear();
      const reportingYear = `FY ${currentYear}-${currentYear + 1}`;
      
      try {
        const res = await axios.get(`${API}/api/materiality/assessments/by-year/${encodeURIComponent(reportingYear)}`, { headers });
        setAssessment(res.data);
        return res.data.id;
      } catch (e) {
        if (e.response?.status === 404) {
          // Create new assessment
          const createRes = await axios.post(`${API}/api/materiality/assessments`, { reporting_year: reportingYear }, { headers });
          setAssessment(createRes.data);
          return createRes.data.id;
        }
        throw e;
      }
    } catch (e) {
      console.error('Failed to load/create assessment', e);
      return null;
    }
  };

  const fetchAssessmentTopics = async (assessmentId) => {
    try {
      const res = await axios.get(`${API}/api/materiality/assessments/${assessmentId}/topics`, { headers });
      setTopics(res.data.topics || []);
    } catch (e) {
      console.error('Failed to load assessment topics', e);
    }
  };

  const refreshAssessment = async () => {
    if (!assessment?.id) return;
    const res = await axios.get(`${API}/api/materiality/assessments/${assessment.id}`, { headers });
    setAssessment(res.data);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchMasterTopics();
      const assessmentId = await fetchOrCreateAssessment();
      if (assessmentId) {
        await fetchAssessmentTopics(assessmentId);
      }
      setLoading(false);
    };
    init();
  }, []);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleAddTopics = async (topicIds) => {
    if (!assessment?.id || topicIds.length === 0) return;
    try {
      await axios.post(`${API}/api/materiality/assessments/${assessment.id}/topics`, { topic_ids: topicIds }, { headers });
      await fetchAssessmentTopics(assessment.id);
      await refreshAssessment();
      toast.success(`Added ${topicIds.length} topics`);
    } catch (e) {
      toast.error('Failed to add topics');
    }
  };

  const handleRemoveTopic = async (topicId) => {
    if (!assessment?.id) return;
    try {
      await axios.delete(`${API}/api/materiality/assessments/${assessment.id}/topics/${topicId}`, { headers });
      await fetchAssessmentTopics(assessment.id);
      await refreshAssessment();
      setSelected(null);
      toast.success('Topic removed');
    } catch (e) {
      toast.error('Failed to remove topic');
    }
  };

  const handleScoreUpdate = async (topicId, businessScore, stakeholderScore) => {
    if (!assessment?.id) return;
    await axios.put(`${API}/api/materiality/assessments/${assessment.id}/topics/${topicId}/score`,
      { topic_id: topicId, business_score: businessScore, stakeholder_score: stakeholderScore },
      { headers }
    );
    await fetchAssessmentTopics(assessment.id);
    await refreshAssessment();
    // Update selected topic
    const updated = topics.find(t => t.topic_id === topicId);
    if (selected?.topic_id === topicId && updated) {
      setSelected({ ...selected, business_score: businessScore, stakeholder_score: stakeholderScore });
    }
  };

  const handleOverride = async (topicId, isMaterial, reason) => {
    if (!assessment?.id) return;
    await axios.put(`${API}/api/materiality/assessments/${assessment.id}/topics/${topicId}/override`,
      { is_material: isMaterial, override_reason: reason || null },
      { headers }
    );
    await fetchAssessmentTopics(assessment.id);
    await refreshAssessment();
  };

  const handleClearOverride = async (topicId) => {
    if (!assessment?.id) return;
    await axios.delete(`${API}/api/materiality/assessments/${assessment.id}/topics/${topicId}/override`, { headers });
    await fetchAssessmentTopics(assessment.id);
    await refreshAssessment();
  };

  const handleCutoffChange = async (type, value) => {
    if (!assessment?.id) return;
    const update = type === 'business' ? { business_cutoff: value } : { stakeholder_cutoff: value };
    setSavingCutoffs(true);
    try {
      await axios.put(`${API}/api/materiality/assessments/${assessment.id}`, update, { headers });
      await refreshAssessment();
      await fetchAssessmentTopics(assessment.id);
    } catch (e) {
      toast.error('Failed to update cutoff');
    }
    setSavingCutoffs(false);
  };

  // ==========================================================================
  // DERIVED DATA
  // ==========================================================================

  const selectedTopicIds = useMemo(() => new Set(topics.map(t => t.topic_id)), [topics]);

  const filtered = useMemo(() => {
    let data = [...topics];
    if (categoryFilter !== 'All') data = data.filter(t => t.category === categoryFilter);
    if (search) data = data.filter(t =>
      t.topic_name.toLowerCase().includes(search.toLowerCase()) ||
      t.topic_code.toLowerCase().includes(search.toLowerCase())
    );
    data.sort((a, b) => {
      if (sortKey === 'topic_code') return (a.topic_code || '').localeCompare(b.topic_code || '');
      if (sortKey === 'business') return (b.business_score || 0) - (a.business_score || 0);
      if (sortKey === 'stakeholder') return (b.stakeholder_score || 0) - (a.stakeholder_score || 0);
      if (sortKey === 'status') return (a.final_status || '').localeCompare(b.final_status || '');
      return 0;
    });
    return data;
  }, [topics, categoryFilter, search, sortKey]);

  const matrixData = useMemo(() => {
    return topics.filter(t => t.business_score != null && t.stakeholder_score != null).map(t => ({
      ...t,
      x: t.business_score,
      y: t.stakeholder_score,
    }));
  }, [topics]);

  const stats = useMemo(() => ({
    total: topics.length,
    scored: topics.filter(t => t.business_score != null && t.stakeholder_score != null).length,
    material: topics.filter(t => t.is_material).length,
    overrides: topics.filter(t => t.has_override).length,
  }), [topics]);

  const handleSelect = useCallback((topic) => {
    setSelected(prev => prev?.id === topic.id ? null : topic);
  }, []);

  const handleSort = useCallback((key) => {
    setSortKey(prev => prev === key ? 'topic_code' : key);
  }, []);

  const renderCustomDot = useCallback((props) => {
    return <CustomDot {...props} selectedId={selected?.id} onSelect={handleSelect} />;
  }, [selected?.id, handleSelect]);

  const cutoffX = assessment?.business_cutoff || 3;
  const cutoffY = assessment?.stakeholder_cutoff || 3;
  const scaleMin = assessment?.scale_min || 1;
  const scaleMax = assessment?.scale_max || 5;

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="materiality-loading">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="materiality-assessment">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Materiality Assessment</h1>
            <p className="text-sm text-stone-500 mt-0.5">{assessment?.name || 'Double Materiality Matrix'} — {assessment?.reporting_year}</p>
          </div>
          <button onClick={() => setShowTopicSelector(true)}
            className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
            data-testid="add-topics-trigger-btn">
            <Plus className="h-4 w-4" /> Add Topics
          </button>
        </div>
      </motion.div>

      {/* Summary Stats */}
      <motion.div className="grid grid-cols-2 sm:grid-cols-4 gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
        {[
          { label: 'Total Topics', value: stats.total, color: '#57534e' },
          { label: 'Scored', value: stats.scored, color: '#2563eb' },
          { label: 'Material', value: stats.material, color: '#059669' },
          { label: 'Overrides', value: stats.overrides, color: '#d97706' },
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
            className="h-8 rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 w-52 transition-all"
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
        {/* Left: Matrix */}
        <motion.div className="shrink-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm" style={{ minWidth: 520, maxWidth: 560 }}
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.15 }} data-testid="materiality-matrix-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-800">Materiality Matrix</h2>
            {savingCutoffs && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
          </div>

          {/* Cutoff Controls */}
          <div className="flex gap-4 mb-4 p-3 rounded-lg bg-stone-50 border border-stone-100">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Business Cutoff</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min={scaleMin} max={scaleMax} step="0.1" value={cutoffX}
                  onChange={e => handleCutoffChange('business', parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-stone-600" data-testid="cutoff-x-slider" />
                <span className="text-xs font-bold text-stone-700 w-7 text-right">{cutoffX.toFixed(1)}</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Stakeholder Cutoff</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min={scaleMin} max={scaleMax} step="0.1" value={cutoffY}
                  onChange={e => handleCutoffChange('stakeholder', parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-stone-600" data-testid="cutoff-y-slider" />
                <span className="text-xs font-bold text-stone-700 w-7 text-right">{cutoffY.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {matrixData.length === 0 ? (
            <div className="h-[440px] flex items-center justify-center text-stone-400 text-sm">
              Add and score topics to see the matrix
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={440}>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 35, left: 20 }}>
                <ReferenceArea x1={scaleMin} x2={cutoffX} y1={scaleMin} y2={cutoffY} fill="#e7e5e4" fillOpacity={0.45} strokeOpacity={0} />
                <ReferenceArea x1={cutoffX} x2={scaleMax} y1={cutoffY} y2={scaleMax} fill="#bbf7d0" fillOpacity={0.4} strokeOpacity={0} />
                <ReferenceArea x1={scaleMin} x2={cutoffX} y1={cutoffY} y2={scaleMax} fill="#fef08a" fillOpacity={0.35} strokeOpacity={0} />
                <ReferenceArea x1={cutoffX} x2={scaleMax} y1={scaleMin} y2={cutoffY} fill="#fef08a" fillOpacity={0.35} strokeOpacity={0} />
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" strokeOpacity={0.6} />
                <ReferenceLine x={cutoffX} stroke="#78716c" strokeWidth={1.5} strokeDasharray="6 4" />
                <ReferenceLine y={cutoffY} stroke="#78716c" strokeWidth={1.5} strokeDasharray="6 4" />
                <XAxis type="number" dataKey="x" domain={[scaleMin, scaleMax]} ticks={[1, 2, 3, 4, 5]}
                  tickFormatter={(v) => ['', 'V.Low', 'Low', 'Med', 'High', 'V.High'][v] || v}
                  tick={{ fontSize: 10, fill: '#78716c' }} axisLine={{ stroke: '#d6d3d1' }}
                  label={{ value: 'Impact to Business →', position: 'bottom', offset: 15, style: { fontSize: 11, fontWeight: 600, fill: '#57534e' } }} />
                <YAxis type="number" dataKey="y" domain={[scaleMin, scaleMax]} ticks={[1, 2, 3, 4, 5]}
                  tickFormatter={(v) => ['', 'V.Low', 'Low', 'Med', 'High', 'V.High'][v] || v}
                  tick={{ fontSize: 10, fill: '#78716c' }} axisLine={{ stroke: '#d6d3d1' }} width={55}
                  label={{ value: 'Impact on Stakeholders →', angle: -90, position: 'insideLeft', offset: -5, style: { fontSize: 11, fontWeight: 600, fill: '#57534e' } }} />
                <Tooltip content={CustomTooltip} cursor={false} />
                <Scatter data={matrixData} shape={renderCustomDot}>
                  {matrixData.map((entry) => (
                    <Cell key={entry.id} fill={(CATEGORIES[entry.category] || CATEGORIES.Environmental).color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}

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
        <motion.div className="flex-1 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden min-w-0"
          initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.2 }} data-testid="materiality-table-card">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-800">Assessment Topics</h2>
            <span className="text-xs text-stone-500">{filtered.length} topics</span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 500 }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-stone-400">
                <p className="text-sm mb-3">No topics added yet</p>
                <button onClick={() => setShowTopicSelector(true)}
                  className="h-8 px-3 rounded-lg border border-stone-300 text-stone-600 text-xs font-medium hover:bg-stone-50 flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Topics
                </button>
              </div>
            ) : (
              <table className="w-full text-sm" data-testid="materiality-table">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-stone-100 bg-stone-50/95 backdrop-blur text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800" onClick={() => handleSort('topic_code')}>Code</th>
                    <th className="px-4 py-2.5">Topic</th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">Category</th>
                    <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800" onClick={() => handleSort('business')}>
                      <span className="flex items-center gap-1">Biz <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800" onClick={() => handleSort('stakeholder')}>
                      <span className="flex items-center gap-1">Stake <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="px-4 py-2.5 cursor-pointer hover:text-stone-800" onClick={() => handleSort('status')}>
                      <span className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="px-4 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, idx) => {
                    const cat = CATEGORIES[t.category] || CATEGORIES.Environmental;
                    const status = STATUS_CONFIG[t.final_status] || STATUS_CONFIG.non_material;
                    const isSelected = selected?.id === t.id;
                    return (
                      <motion.tr key={t.id} onClick={() => handleSelect(t)}
                        className={`border-b border-stone-50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/50' : 'hover:bg-stone-50/70'}`}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} data-testid={`table-row-${t.topic_code}`}>
                        <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: cat.color }}>{t.topic_code}</td>
                        <td className="px-4 py-2.5 font-medium text-stone-800 text-xs">{t.topic_name}</td>
                        <td className="px-4 py-2.5 hidden lg:table-cell">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: cat.bg, color: cat.color }}>
                            {t.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-xs text-stone-700">{t.business_score?.toFixed(1) ?? '-'}</td>
                        <td className="px-4 py-2.5 font-semibold text-xs text-stone-700">{t.stakeholder_score?.toFixed(1) ?? '-'}</td>
                        <td className="px-4 py-2.5">
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 w-fit"
                            style={{ backgroundColor: status.bg, color: status.color }}>
                            {status.label}
                            {t.has_override && <span className="text-amber-500">*</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveTopic(t.topic_id); }}
                            className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors"
                            data-testid={`remove-topic-${t.topic_code}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRight className="h-3.5 w-3.5 text-stone-300" />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </div>

      {/* Topic Drawer */}
      <AnimatePresence>
        {selected && (
          <TopicDrawer
            topic={selected}
            assessment={assessment}
            onClose={() => setSelected(null)}
            onScoreUpdate={handleScoreUpdate}
            onOverride={handleOverride}
            onClearOverride={handleClearOverride}
          />
        )}
      </AnimatePresence>

      {/* Topic Selector Modal */}
      <TopicSelectorModal
        open={showTopicSelector}
        onClose={() => setShowTopicSelector(false)}
        masterTopics={masterTopics}
        selectedTopicIds={selectedTopicIds}
        onAddTopics={handleAddTopics}
      />
    </div>
  );
}
