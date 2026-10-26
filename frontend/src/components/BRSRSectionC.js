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
import { QuestionVersionHistory } from './QuestionVersionHistory';
import { mergeBRSRAutofill } from '../utils/brsrAutofill';

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

const LEADERSHIP_KEYS = new Set([
  'p1_value_chain_awareness', 'p1_conflict_management_process',
  'env_life_cycle_assessment', 'env_lca_concerns_actions', 'env_recycled_input_material',
  'env_reclaimed_products_packaging', 'p2_reclaimed_products_pct',
  'p3_life_insurance_package', 'p3_value_chain_statutory_dues', 'p3_rehabilitation_injured',
  'transition_assistance_programs', 'p3_value_chain_assessment', 'p3_value_chain_corrective',
  'p4_se_3', 'p4_se_4', 'p4_se_5',
  'p5_business_process_changes', 'p5_hr_due_diligence', 'p5_accessibility_differently_abled',
  'p5_value_chain_hr_assessment', 'p5_value_chain_corrective',
  'p6_water_stress_areas', 'env_assurance_water_stress', 'p6_scope3_emissions', 'env_assurance_ghg_scope3',
  'env_biodiversity_impact', 'env_resource_efficiency_initiatives', 'env_business_continuity_disaster',
  'env_value_chain_impacts', 'env_value_chain_assessment',
  'public_policy_positions',
  'p8_sia_corrective_actions', 'p8_csr_aspirational_districts', 'p8_preferential_procurement',
  'p8_intellectual_property_traditional', 'p8_ip_corrective_actions', 'p8_csr_beneficiaries',
  'p9_product_info_channels', 'p9_consumer_education', 'p9_service_disruption_mechanism',
  'p9_product_info_beyond_legal', 'p9_consumer_satisfaction_survey',
]);

const TRAINING_COLUMN_LABELS = {
  total: 'Total number of training and awareness programmes held',
  trained: 'Topics / principles covered under the training and its impact',
  pct: '%age of persons in respective category covered by the awareness programmes',
};

const applyConfigOverrides = (config) => {
  if (config.question_key === 'p1_fines_penalties') {
    return { ...config, question: 'Details of fines / penalties /punishment/ award/ compounding fees/ settlement amount paid in proceedings (by the entity or by directors / KMPs) with regulators/ law enforcement agencies/ judicial institutions, in the financial year, in the following format' };
  }
  if (config.question_key === 'p1_training_awareness_coverage' && config.table_config?.columns) {
    return { ...config, table_config: { ...config.table_config, columns: config.table_config.columns.map(c => ({ ...c, label: TRAINING_COLUMN_LABELS[c.key] || c.label })) } };
  }
  if (config.question_key === 'env_sustainable_rd_capex' && config.table_config?.columns) {
    return { ...config, table_config: { ...config.table_config, columns: config.table_config.columns.map(c => c.key === 'details' ? { ...c, label: 'Details of improvements in environmental and social impacts' } : c) } };
  }
  if (config.question_key === 'env_end_of_life_reclamation' && config.table_columns) {
    return { ...config, table_columns: config.table_columns.map(c => c.key === 'product_category' ? { ...c, options: c.options.map(o => o === 'Plastics' ? 'Plastics (including packaging)' : o) } : c) };
  }
  if (config.question_key === 'p1_conflict_of_interest_complaints' && config.table_config) {
    const num = { type: 'number' };
    const txt = { type: 'text' };
    return { ...config, table_config: {
      ...config.table_config,
      columns: [
        { key: 'current_fy', label: 'Number', ...num }, { key: 'current_fy_remarks', label: 'Remarks', ...txt },
        { key: 'previous_fy', label: 'Number', ...num }, { key: 'previous_fy_remarks', label: 'Remarks', ...txt },
      ],
      column_groups: [
        { label: 'Current Financial Year', columns: [{ key: 'current_fy', label: 'Number' }, { key: 'current_fy_remarks', label: 'Remarks' }] },
        { label: 'Previous Financial Year', columns: [{ key: 'previous_fy', label: 'Number' }, { key: 'previous_fy_remarks', label: 'Remarks' }] },
      ],
    } };
  }
  if (['p1_anticorruption_policy', 'p1_conflict_management_process', 'env_sustainable_sourcing'].includes(config.question_key) && config.conditional_fields) {
    return { ...config, conditional_fields: config.conditional_fields.map(f => ({ ...f, show_when: 'yes' })) };
  }
  return config;
};

export default function BRSRSectionC({ framework = 'BRSR', isEditing = false, reportingYear, liveKPIAutofillByQuestion = {}, statusFilter = 'all', questionProgress = {}, approvalEnabled = false, isAdmin = false, onSaved = null }) {
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allConfigs, setAllConfigs] = useState([]);
  const [allResponses, setAllResponses] = useState({});
  const [approvalStatuses, setApprovalStatuses] = useState({});
  const [versionHistories, setVersionHistories] = useState({});
  const [timelineQuestionKey, setTimelineQuestionKey] = useState(null);
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
      if (onSaved) onSaved();
      
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

  const renderQuestion = (config) => (
                    <QuestionRenderer
                      key={config.question_key}
                      config={config}
                      value={mergeBRSRAutofill(allResponses[config.question_key], liveKPIAutofillByQuestion[config.question_key]?.value)}
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
                      onSaveQuestion={saveQuestion}
                      perQuestionEdit
                      approvalEnabled={approvalEnabled}
                      isAdmin={isAdmin}
                      onCancelEdit={fetchData}
                      onFetchVersionHistory={() => fetchVersionHistory(config.question_key)}
                      onOpenTimeline={() => setTimelineQuestionKey(config.question_key)}
                      lockedAnswerPaths={liveKPIAutofillByQuestion[config.question_key]?.locked_paths || []}
                      dynamicAutofillRows={liveKPIAutofillByQuestion[config.question_key]?.dynamic_rows || []}
                    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-text-muted">Loading Section C...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Principle Sections */}
      {principleKeys.map(p => {
        const meta = PRINCIPLE_META[p] || { name: p, title: '' };
        const allQuestions = grouped[p] || [];
        const questions = statusFilter === 'all'
          ? allQuestions
          : allQuestions.filter(c => questionProgress[c.question_key] === statusFilter);
        if (statusFilter !== 'all' && questions.length === 0) return null;
        const isOpen = statusFilter !== 'all' || !!expanded[p];
        const answeredInP = allQuestions.filter(c => {
          const v = allResponses[c.question_key];
          return v !== undefined && v !== null && v !== '';
        }).length;
        const color = PRINCIPLE_COLORS[p] || '#78716c';
        const principleStatus = getPrincipleStatus(p);

        return (
          <div key={p} id={`brsr-group-${p}`} className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden scroll-mt-24 mb-6" data-testid={`principle-${p}`}>
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
                  <p className="text-xs text-stone-500 mt-0.5">{allQuestions.length} questions · {answeredInP} answered</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${allQuestions.length > 0 ? (answeredInP / allQuestions.length) * 100 : 0}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-xs tabular-nums text-stone-500 w-8 text-right">
                  {allQuestions.length > 0 ? Math.round((answeredInP / allQuestions.length) * 100) : 0}%
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t">
                {[['Essential Indicators', questions.filter(c => !LEADERSHIP_KEYS.has(c.question_key))],
                  ['Leadership Indicators', questions.filter(c => LEADERSHIP_KEYS.has(c.question_key))]].map(([title, list]) => list.length > 0 && (
                  <div key={title} className="px-5 py-4" data-testid={`principle-${p}-${title.split(' ')[0].toLowerCase()}-indicators`}>
                    <h4 className="text-base font-bold text-stone-900 border-b border-stone-200 pb-2 mb-4">{title}</h4>
                    <div className="space-y-1">
                      {list.map(c => renderQuestion(applyConfigOverrides(c)))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <QuestionVersionHistory
        open={Boolean(timelineQuestionKey)}
        onOpenChange={(open) => !open && setTimelineQuestionKey(null)}
        framework={framework}
        questionKey={timelineQuestionKey}
        reportingYear={reportingYear}
      />
    </div>
  );
}
