import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Building2, CheckCircle2, ClipboardList, Leaf, Landmark, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ResponseReviewSidebar } from './components/ResponseReviewSidebar';
import { ResponseReviewQuestionPanel } from './components/ResponseReviewQuestionPanel';
import { ResponseAnswerHistory } from './components/ResponseAnswerHistory';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PILLARS = [
  { id: 'environment', label: 'Environment', Icon: Leaf, card: 'border-emerald-100 bg-emerald-50/70 text-emerald-900', icon: 'text-emerald-700' },
  { id: 'social', label: 'Social', Icon: UsersRound, card: 'border-sky-100 bg-sky-50/70 text-sky-900', icon: 'text-sky-700' },
  { id: 'governance', label: 'Governance', Icon: Landmark, card: 'border-violet-100 bg-violet-50/70 text-violet-900', icon: 'text-violet-700' },
];

const scoreLabel = (value) => {
  const score = Number(value);
  return Number.isFinite(score) ? (Number.isInteger(score) ? String(score) : score.toFixed(2)) : '—';
};

const humanize = (value) => String(value || 'General').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function SupplierResponseReviewPage() {
  const { supplierId, questionnaireId } = useParams();
  const navigate = useNavigate();
  const { getAuthHeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [activePillar, setActivePillar] = useState('all');
  const [activeCategoryKey, setActiveCategoryKey] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');
  const [reviewingQuestionId, setReviewingQuestionId] = useState('');

  const fetchResponseData = useCallback(async () => {
    const result = await axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/responses`, { headers: getAuthHeader() });
    setResponse(result.data); setQuestions(result.data.questions || []);
  }, [getAuthHeader, questionnaireId, supplierId]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [responseResult, supplierResult, questionnaireResult] = await Promise.allSettled([
        axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/responses`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/suppliers/${supplierId}`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/questionnaires/${questionnaireId}`, { headers: getAuthHeader() }),
      ]);
      if (responseResult.status !== 'fulfilled') throw responseResult.reason;
      setResponse(responseResult.value.data); setQuestions(responseResult.value.data.questions || []);
      if (supplierResult.status === 'fulfilled') setSupplier(supplierResult.value.data);
      if (questionnaireResult.status === 'fulfilled') setQuestionnaire(questionnaireResult.value.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load questionnaire response');
    } finally { setLoading(false); }
  }, [getAuthHeader, questionnaireId, supplierId]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const taxonomyNames = useMemo(() => Object.fromEntries(Object.entries(questionnaire?.esg_subcategories || {}).flatMap(([section, categories]) => (categories || []).map((category) => [`${section}:${category.code}`, category.name]))), [questionnaire]);
  const visibleQuestions = useMemo(() => questions.filter((question) => {
    if (activePillar !== 'all' && question.category !== activePillar) return false;
    return !activeCategoryKey || `${question.category}:${question.question_category || 'general'}` === activeCategoryKey;
  }), [activeCategoryKey, activePillar, questions]);
  const selectedIndex = Math.max(0, visibleQuestions.findIndex((question) => question.id === selectedQuestionId));
  const selectedQuestion = visibleQuestions[selectedIndex] || null;
  const calculatedScores = useMemo(() => Object.fromEntries((response?.score_breakdown?.question_scores || []).map((item) => [item.question_id, item])), [response]);
  const sidebarGroups = useMemo(() => Object.fromEntries(PILLARS.map(({ id }) => {
    const pillarQuestions = questions.filter((question) => question.category === id);
    const categories = [...new Set(pillarQuestions.map((question) => question.question_category || 'general'))].map((category) => ({
      key: `${id}:${category}`, label: taxonomyNames[`${id}:${category}`] || humanize(category), questions: pillarQuestions.filter((question) => (question.question_category || 'general') === category),
    }));
    return [id, { questionCount: pillarQuestions.length, categories }];
  })), [questions, taxonomyNames]);

  useEffect(() => { if (visibleQuestions.length && !visibleQuestions.some((question) => question.id === selectedQuestionId)) setSelectedQuestionId(visibleQuestions[0].id); }, [selectedQuestionId, visibleQuestions]);

  const submitReview = async (payload) => {
    if (!selectedQuestion) return false;
    setReviewingQuestionId(selectedQuestion.id);
    try {
      await axios.put(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/questions/${selectedQuestion.id}/review`, payload, { headers: getAuthHeader() });
      toast.success(payload.status === 'accepted' ? 'Question response accepted' : payload.needs_resubmission ? 'Clarification requested and question unlocked for supplier' : 'Question rejected with approved score');
      if (payload.needs_resubmission) {
        navigate('/supplier-assessment/esg');
        return true;
      }
      await fetchResponseData();
      return true;
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit review decision'); return false; }
    finally { setReviewingQuestionId(''); }
  };
  const submitInlineDecision = async (decision, reviewerNote, reviewerScore) => {
    if (decision === 'accepted') return submitReview({ status: 'accepted', needs_resubmission: false });
    if (decision === 'clarification') {
      if (!reviewerNote.trim()) return toast.error('A reviewer comment is required for clarification');
      return submitReview({ status: 'rejected', needs_resubmission: true, reviewer_note: reviewerNote.trim() });
    }
    const score = Number(reviewerScore);
    if (Number.isNaN(score) || score < 0 || score > (selectedQuestion?.max_points ?? selectedQuestion?.weight ?? 100)) return toast.error('Enter an approved score within the question maximum');
    return submitReview({ status: 'rejected', needs_resubmission: false, reviewer_score: score, reviewer_note: reviewerNote.trim() });
  };
  const openEvidence = async (file, download = false) => {
    if (!selectedQuestion) return false;
    const key = `${selectedQuestion.id}-${file.id}-${download ? 'download' : 'view'}`; setOpeningEvidenceKey(key);
    try { const { data } = await axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/questions/${selectedQuestion.id}/evidence/${file.id}`, { params: { download }, headers: getAuthHeader() }); window.open(data.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not open evidence file'); }
    finally { setOpeningEvidenceKey(''); }
  };

  if (loading) return <div className="flex h-96 items-center justify-center" data-testid="response-review-loading"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" /><p className="mt-3 text-sm text-stone-500">Loading submission review...</p></div></div>;
  if (!selectedQuestion) return <div className="mx-auto max-w-3xl border border-dashed border-stone-300 bg-white p-12 text-center" data-testid="response-review-empty"><p className="text-sm text-stone-600">No submitted questions are available to review.</p><Button variant="outline" className="mt-4" onClick={() => navigate('/supplier-assessment/esg')} data-testid="response-review-empty-back-button">Back to questionnaires</Button></div>;

  const esgScore = response?.score_breakdown?.esg_score || {};
  const supplierName = supplier?.company_name || response?.company_name || 'Supplier';
  const questionnaireName = questionnaire?.name || response?.name || 'ESG Questionnaire';
  const reportingPeriod = supplier?.reporting_period || response?.reporting_period || questionnaire?.reporting_period || 'Current period';
  return <div className="space-y-5 pb-10" data-testid="supplier-response-review-page">
    <header className="border-b border-stone-200 bg-white px-1 pb-4" data-testid="response-review-header">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate('/supplier-assessment/esg')} aria-label="Back to questionnaires" data-testid="response-review-back-button"><ArrowLeft className="h-4 w-4" /></Button><h1 className="text-xl font-bold text-stone-950" data-testid="response-review-title">Review Response</h1></div>
        <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100" data-testid="response-review-status"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Submitted</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_9rem_repeat(3,9rem)]" data-testid="response-review-summary">
        <div className="flex min-w-0 items-center gap-3 rounded-md border border-sky-100 bg-sky-50/70 px-4 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sky-600 text-white"><Building2 className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-medium text-sky-700">Supplier</p><p className="truncate text-sm font-bold text-slate-950" data-testid="response-review-supplier-name">{supplierName}</p></div></div>
        <div className="flex min-w-0 items-center gap-3 rounded-md border border-indigo-100 bg-indigo-50/70 px-4 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-indigo-600 text-white"><ClipboardList className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-medium text-indigo-700">Questionnaire</p><p className="truncate text-sm font-bold text-slate-950" data-testid="response-review-questionnaire-name">{questionnaireName}</p><p className="mt-0.5 text-xs text-slate-500" data-testid="response-review-reporting-period">{reportingPeriod}</p></div></div>
        <div className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-white"><p className="text-xs font-medium text-slate-300">Overall Score</p><p className="mt-1 text-xl font-bold" data-testid="response-review-overall-score">{scoreLabel(response?.calculated_score ?? esgScore.overall_score)} <span className="text-xs font-medium text-slate-300">/ 100</span></p></div>
        {PILLARS.map(({ id, label, Icon, card, icon }) => <div key={id} className={`rounded-md border px-4 py-3 ${card}`} data-testid={`response-review-pillar-score-${id}`}><p className={`flex items-center gap-1.5 text-xs font-bold ${icon}`}><Icon className="h-3.5 w-3.5" />{label}</p><p className="mt-1 text-xl font-bold">{scoreLabel(esgScore[id]?.score)} <span className="text-xs font-medium">/ 100</span></p></div>)}
      </div>
    </header>
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white px-2" data-testid="response-review-tabs"><div className="flex min-w-max gap-1">{[{ id: 'all', label: 'All Questions', count: questions.length }, ...PILLARS.map(({ id, label }) => ({ id, label, count: sidebarGroups[id].questionCount }))].map((tab) => { const activeClasses = tab.id === 'environment' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : tab.id === 'social' ? 'border-sky-600 bg-sky-50 text-sky-800' : tab.id === 'governance' ? 'border-violet-600 bg-violet-50 text-violet-800' : 'border-slate-900 bg-slate-100 text-slate-900'; return <button key={tab.id} type="button" onClick={() => { setActivePillar(tab.id); setActiveCategoryKey(''); }} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-[background-color,border-color,color] ${activePillar === tab.id ? activeClasses : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`} data-testid={`response-review-tab-${tab.id}`}><span>{tab.label}</span><span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${activePillar === tab.id ? 'bg-white/80' : 'bg-slate-100'}`}>{tab.count}</span></button>; })}</div></div>
    <main className="grid min-w-0 items-start gap-4 xl:grid-cols-[13rem_minmax(0,1fr)_18rem] 2xl:grid-cols-[15rem_minmax(0,1fr)_21rem]" data-testid="response-review-workspace"><ResponseReviewSidebar groups={sidebarGroups} activeCategoryKey={activeCategoryKey} onCategorySelect={(categoryKey) => { const firstQuestion = questions.find((question) => `${question.category}:${question.question_category || 'general'}` === categoryKey); setActiveCategoryKey(categoryKey); setActivePillar(categoryKey.split(':')[0]); setSelectedQuestionId(firstQuestion?.id || ''); }} /><ResponseReviewQuestionPanel key={selectedQuestion.id} question={selectedQuestion} categoryLabel={taxonomyNames[`${selectedQuestion.category}:${selectedQuestion.question_category || 'general'}`] || humanize(selectedQuestion.question_category)} index={selectedIndex} total={visibleQuestions.length} score={calculatedScores[selectedQuestion.id]} onDecision={submitInlineDecision} onPrevious={() => setSelectedQuestionId(visibleQuestions[Math.max(0, selectedIndex - 1)]?.id || selectedQuestion.id)} onNext={() => setSelectedQuestionId(visibleQuestions[Math.min(visibleQuestions.length - 1, selectedIndex + 1)]?.id || selectedQuestion.id)} onOpenEvidence={openEvidence} openingEvidenceKey={openingEvidenceKey} saving={reviewingQuestionId === selectedQuestion.id} /><ResponseAnswerHistory history={selectedQuestion.history || []} questionId={selectedQuestion.id} /></main>
  </div>;
}
