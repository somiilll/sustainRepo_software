/**
 * BRSRSectionC — Section C: Principle-wise Performance Disclosures
 *
 * Fetches ALL questions from environment + social + governance,
 * groups them by brsr_principle (P1-P9), renders collapsible sections.
 * Each question has individual save/draft, status badges, and version history.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { QuestionRenderer } from './ESGQuestionnaire';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Loader2, Save, CheckCircle2, AlertCircle, ChevronDown, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const SECTION = 'section_c';

const PRINCIPLE_META = {
  P1: { name: 'Principle 1', title: 'Ethics, Transparency & Accountability' },
  P2: { name: 'Principle 2', title: 'Sustainable Products & Services' },
  P3: { name: 'Principle 3', title: 'Employee Wellbeing' },
  P4: { name: 'Principle 4', title: 'Stakeholder Responsiveness' },
  P5: { name: 'Principle 5', title: 'Human Rights' },
  P6: { name: 'Principle 6', title: 'Environment Protection' },
  P7: { name: 'Principle 7', title: 'Policy Advocacy' },
  P8: { name: 'Principle 8', title: 'Inclusive Growth' },
  P9: { name: 'Principle 9', title: 'Consumer Value' },
};

const PRINCIPLE_COLORS = {
  P1: '#3b82f6', P2: '#059669', P3: '#8b5cf6',
  P4: '#f59e0b', P5: '#ef4444', P6: '#14b8a6',
  P7: '#6366f1', P8: '#f97316', P9: '#ec4899',
};

export default function BRSRSectionC({ framework = 'BRSR', isEditing = false, reportingYear }) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrinciple, setSavingPrinciple] = useState(null);
  const [allConfigs, setAllConfigs] = useState([]);
  const [allResponses, setAllResponses] = useState({});
  const [approvalStatuses, setApprovalStatuses] = useState({});
  const [versionHistories, setVersionHistories] = useState({});
  const [expanded, setExpanded] = useState({});

  const fetchData = useCallback(async () => {
    if (!reportingYear) return;
    setLoading(true);
    try {
      const headers = getAuthHeader();

      const [configsRes, responsesRes, statusesRes] = await Promise.all([
        axios.get(`${API}/api/esg-questionnaire/configs`, { params: { framework, section: SECTION }, headers })
          .then(r => r.data.configs || []).catch(() => []),
        axios.get(`${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}`, { headers })
          .then(r => r.data.responses || {}).catch(() => ({})),
        axios.get(`${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}/statuses`, { headers })
          .then(r => r.data.statuses || {}).catch(() => ({})),
      ]);

      setAllConfigs(configsRes);
      setAllResponses(responsesRes);
      setApprovalStatuses(statusesRes);
    } catch (err) {
      console.error('Failed to fetch Section C data:', err);
    } finally {
      setLoading(false);
    }
  }, [framework, reportingYear, getAuthHeader]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const grouped = useMemo(() => {
    const map = {};
    for (const c of allConfigs) {
      const p = c.brsr_principle || 'OTHER';
      if (!map[p]) map[p] = [];
      map[p].push(c);
    }
    return map;
  }, [allConfigs]);

  const principleKeys = useMemo(() =>
    ['P1','P2','P3','P4','P5','P6','P7','P8','P9'].filter(p => grouped[p]?.length > 0),
  [grouped]);

  const summary = useMemo(() => {
    const total = allConfigs.length;
    const answered = allConfigs.filter(c => {
      const v = allResponses[c.question_key];
      return v !== undefined && v !== null && v !== '';
    }).length;
    return { total, answered, pct: total > 0 ? Math.round((answered / total) * 100) : 0 };
  }, [allConfigs, allResponses]);

  const handleResponseChange = (questionKey, value) => {
    setAllResponses(prev => ({ ...prev, [questionKey]: value }));
  };

  const togglePrinciple = (p) => {
    setExpanded(prev => ({ ...prev, [p]: !prev[p] }));
  };

  const expandAll = () => {
    const all = {};
    principleKeys.forEach(p => { all[p] = true; });
    setExpanded(all);
  };

  const collapseAll = () => setExpanded({});

  // Save individual question
  const saveQuestion = async (questionKey, value, status = 'saved') => {
    try {
      const headers = getAuthHeader();
      await axios.post(
        `${API}/api/esg-questionnaire/response`,
        {
          question_key: questionKey,
          value,
          status,
          reporting_period: reportingYear,
        },
        { headers }
      );
      toast.success(status === 'draft' ? 'Saved as draft' : 'Response saved');
      
      // Refresh status for this question
      try {
        const statusRes = await axios.get(
          `${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}/statuses`,
          { headers }
        );
        setApprovalStatuses(statusRes.data.statuses || {});
      } catch (e) {
        // Ignore status fetch errors
      }
    } catch (error) {
      console.error('Save question error:', error);
      toast.error(error.response?.data?.detail || 'Failed to save');
      throw error;
    }
  };

  // Fetch version history for a question
  const fetchVersionHistory = async (questionKey) => {
    try {
      const headers = getAuthHeader();
      const res = await axios.get(
        `${API}/api/esg-questionnaire/history/${questionKey}`,
        { 
          params: { reporting_period: reportingYear },
          headers 
        }
      );
      setVersionHistories(prev => ({
        ...prev,
        [questionKey]: res.data.history || []
      }));
      return res.data.history || [];
    } catch (error) {
      console.error('Failed to fetch version history:', error);
      return [];
    }
  };

  // Save all responses for a principle
  const savePrincipleResponses = async (principle, status = 'saved') => {
    const questions = grouped[principle] || [];
    if (questions.length === 0) return;
    
    setSavingPrinciple(principle);
    try {
      const headers = getAuthHeader();
      const responses = {};
      questions.forEach(q => {
        if (allResponses[q.question_key] !== undefined) {
          responses[q.question_key] = allResponses[q.question_key];
        }
      });
      
      await axios.put(
        `${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}`,
        { responses, status },
        { headers }
      );
      toast.success(`${PRINCIPLE_META[principle]?.name || principle} ${status === 'draft' ? 'saved as draft' : 'saved'}`);
      fetchData();
    } catch (err) {
      console.error('Save principle error:', err);
      toast.error('Failed to save responses');
    } finally {
      setSavingPrinciple(null);
    }
  };

  // Save all responses
  const saveAllResponses = async () => {
    setSaving(true);
    try {
      const headers = getAuthHeader();
      await axios.put(
        `${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}`,
        { responses: allResponses },
        { headers }
      );
      toast.success(`Section C responses saved for ${reportingYear}`);
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save responses');
    } finally {
      setSaving(false);
    }
  };

  // Get status badge for a principle
  const getPrincipleStatus = (principle) => {
    const questions = grouped[principle] || [];
    const statuses = questions.map(q => approvalStatuses[q.question_key]?.approval_status).filter(Boolean);
    
    if (statuses.length === 0) return null;
    
    const hasPending = statuses.includes('pending_approval');
    const hasRejected = statuses.includes('rejected');
    const allApproved = statuses.every(s => s === 'approved');
    
    if (allApproved) return { label: 'Approved', className: 'bg-green-100 text-green-800' };
    if (hasRejected) return { label: 'Has Rejections', className: 'bg-red-100 text-red-800' };
    if (hasPending) return { label: 'Awaiting Approval', className: 'bg-amber-100 text-amber-800' };
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-text-muted">Loading Section C...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg border">
        <div className="flex items-center gap-4">
          <div>
            <Badge variant="outline" className="mb-1">{framework}</Badge>
            <p className="text-sm text-text-muted">
              {allConfigs.length} questions across {principleKeys.length} principles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={expandAll} className="text-xs text-blue-600 hover:underline">Expand All</button>
          <span className="text-stone-300">|</span>
          <button onClick={collapseAll} className="text-xs text-blue-600 hover:underline">Collapse All</button>
          {summary && (
            <div className="flex items-center gap-2 ml-3">
              {summary.pct === 100
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <AlertCircle className="w-5 h-5 text-amber-500" />}
              <span className="text-sm font-medium">
                {summary.answered}/{summary.total} answered ({summary.pct}%)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Principle Sections */}
      {principleKeys.map(p => {
        const meta = PRINCIPLE_META[p] || { name: p, title: '' };
        const questions = grouped[p] || [];
        const isOpen = !!expanded[p];
        const answeredInP = questions.filter(c => {
          const v = allResponses[c.question_key];
          return v !== undefined && v !== null && v !== '';
        }).length;
        const color = PRINCIPLE_COLORS[p] || '#78716c';
        const principleStatus = getPrincipleStatus(p);
        const isSavingThis = savingPrinciple === p;

        return (
          <div key={p} className="border rounded-lg bg-white overflow-hidden" data-testid={`principle-${p}`}>
            <button
              onClick={() => togglePrinciple(p)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50/50 transition-colors"
              data-testid={`principle-${p}-toggle`}
            >
              <div className="flex items-center gap-3">
                <span className="w-2 h-8 rounded-full" style={{ backgroundColor: color }} />
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-900">{meta.name}: {meta.title}</h3>
                    {principleStatus && (
                      <Badge className={`text-xs ${principleStatus.className}`}>
                        {principleStatus.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">{questions.length} questions · {answeredInP} answered</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${questions.length > 0 ? (answeredInP / questions.length) * 100 : 0}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-xs tabular-nums text-stone-500 w-8 text-right">
                  {questions.length > 0 ? Math.round((answeredInP / questions.length) * 100) : 0}%
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t">
                {/* Questions */}
                <div className="px-5 py-4 space-y-1">
                  {questions.map(config => (
                    <QuestionRenderer
                      key={config.question_key}
                      config={config}
                      value={allResponses[config.question_key]}
                      onChange={(val) => handleResponseChange(config.question_key, val)}
                      isEditing={isEditing}
                      allResponses={{
                        ...allResponses,
                        reporting_year: reportingYear,
                        framework,
                      }}
                      historicalData={null}
                      approvalStatus={approvalStatuses[config.question_key]}
                      versionHistory={versionHistories[config.question_key]}
                      onSaveQuestion={isEditing ? saveQuestion : null}
                      onFetchVersionHistory={() => fetchVersionHistory(config.question_key)}
                    />
                  ))}
                </div>
                
                {/* Principle-level Save Buttons */}
                {isEditing && questions.length > 0 && (
                  <div className="flex justify-end gap-2 px-5 py-3 bg-stone-50 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => savePrincipleResponses(p, 'draft')}
                      disabled={isSavingThis}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      Save as Draft
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => savePrincipleResponses(p, 'saved')}
                      disabled={isSavingThis}
                      className="bg-primary hover:bg-primary/90"
                    >
                      {isSavingThis ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-1" /> Save {meta.name}</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Global Save Button */}
      {isEditing && allConfigs.length > 0 && (
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => saveAllResponses('draft')}
            disabled={saving}
          >
            <FileText className="w-4 h-4 mr-2" />
            Save All as Draft
          </Button>
          <Button onClick={saveAllResponses} disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save All Responses</>}
          </Button>
        </div>
      )}
    </div>
  );
}
