/**
 * BRSRSectionC — Section C: Principle-wise Performance Disclosures
 *
 * Fetches ALL questions from environment + social + governance,
 * groups them by brsr_principle (P1-P9), renders collapsible sections.
 * Saves responses back to their original section.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { QuestionRenderer } from './ESGQuestionnaire';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Loader2, Save, CheckCircle2, AlertCircle, ChevronDown,
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
  const [allConfigs, setAllConfigs] = useState([]);
  const [allResponses, setAllResponses] = useState({});
  const [expanded, setExpanded] = useState({});

  const fetchData = useCallback(async () => {
    if (!reportingYear) return;
    setLoading(true);
    try {
      const headers = getAuthHeader();

      const [configsRes, responsesRes] = await Promise.all([
        axios.get(`${API}/api/esg-questionnaire/configs`, { params: { framework, section: SECTION }, headers })
          .then(r => r.data.configs || []).catch(() => []),
        axios.get(`${API}/api/esg-questionnaire/responses/${framework}/${SECTION}/${reportingYear}`, { headers })
          .then(r => r.data.responses || {}).catch(() => ({})),
      ]);

      setAllConfigs(configsRes);
      setAllResponses(responsesRes);
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

  const saveResponses = async () => {
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
                  <h3 className="text-sm font-bold text-stone-900">{meta.name}: {meta.title}</h3>
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
              <div className="border-t px-5 py-4 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
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
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Save Button */}
      {isEditing && allConfigs.length > 0 && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={saveResponses} disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Responses</>}
          </Button>
        </div>
      )}
    </div>
  );
}
