import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Building2, ClipboardList, Leaf, Landmark, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent } from '../../components/ui/sheet';
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
  const [markingQuestionId, setMarkingQuestionId] = useState('');
  const [draftingQuestionId, setDraftingQuestionId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewSuppliers, setReviewSuppliers] = useState([]);
  const [periodQuestionnaires, setPeriodQuestionnaires] = useState([]);
  const [loadingReviewOptions, setLoadingReviewOptions] = useState(false);

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

  useEffect(() => {
    let active = true;
    const loadReviewOptions = async () => {
      setLoadingReviewOptions(true);
      try {
        const period = response?.reporting_period || supplier?.reporting_period || questionnaire?.reporting_period;
        const params = period ? { reporting_period: period } : {};
        const [submissionsResult, questionnairesResult] = await Promise.all([
          axios.get(`${API}/supplier-assessment/questionnaires/${questionnaireId}/submissions`, { params, headers: getAuthHeader() }),
          axios.get(`${API}/supplier-assessment/questionnaires`, { params, headers: getAuthHeader() }),
        ]);
        if (!active) return;
        setReviewSuppliers(submissionsResult.data?.submissions || []);
        const available = Array.isArray(questionnairesResult.data) ? questionnairesResult.data : questionnairesResult.data?.questionnaires || [];
        const candidates = available.filter((item) => item.is_active !== false);
        const submissionChecks = await Promise.allSettled(candidates.map((item) => axios.get(`${API}/supplier-assessment/questionnaires/${item.id}/submissions`, { params, headers: getAuthHeader() })));
        if (!active) return;
        setPeriodQuestionnaires(candidates.filter((item, index) => submissionChecks[index].status === 'fulfilled' && (submissionChecks[index].value.data?.submissions || []).some((submission) => submission.supplier_id === supplierId)));
      } catch (error) {
        if (active) {
          setReviewSuppliers([]);
          setPeriodQuestionnaires([]);
        }
      } finally { if (active) setLoadingReviewOptions(false); }
    };
    if (response && questionnaire) loadReviewOptions();
    return () => { active = false; };
  }, [getAuthHeader, questionnaire, questionnaireId, response, supplier]);

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
  const saveReviewDraft = async (decision, reviewerNote, reviewerScore) => {
    if (!selectedQuestion) return false;
    let payload;
    if (decision === 'accepted') payload = { status: 'accepted', needs_resubmission: false };
    else if (decision === 'clarification') {
      if (!reviewerNote.trim()) { toast.error('A reviewer comment is required for clarification'); return false; }
      payload = { status: 'rejected', needs_resubmission: true, reviewer_note: reviewerNote.trim() };
    } else {
      const score = Number(reviewerScore);
      if (Number.isNaN(score) || score < 0 || score > (selectedQuestion.max_points ?? selectedQuestion.weight ?? 100)) { toast.error('Enter an approved score within the question maximum'); return false; }
      if (!reviewerNote.trim()) { toast.error('A rejection rationale is required'); return false; }
      payload = { status: 'rejected', needs_resubmission: false, reviewer_score: score, reviewer_note: reviewerNote.trim() };
    }
    setDraftingQuestionId(selectedQuestion.id);
    try {
      await axios.put(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/questions/${selectedQuestion.id}/review-draft`, payload, { headers: getAuthHeader() });
      toast.success('Review draft saved for the parent organization');
      await fetchResponseData();
      return true;
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not save the review draft'); return false; }
    finally { setDraftingQuestionId(''); }
  };
  const openEvidence = async (file, download = false) => {
    if (!selectedQuestion) return false;
    const key = `${selectedQuestion.id}-${file.id}-${download ? 'download' : 'view'}`; setOpeningEvidenceKey(key);
    try { const { data } = await axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${questionnaireId}/questions/${selectedQuestion.id}/evidence/${file.id}`, { params: { download }, headers: getAuthHeader() }); window.open(data.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not open evidence file'); }
    finally { setOpeningEvidenceKey(''); }
  };
  const changeSupplier = (nextSupplierId) => navigate(`/supplier-assessment/suppliers/${nextSupplierId}/questionnaires/${questionnaireId}/review`);
  const changeQuestionnaire = async (nextQuestionnaireId) => {
    if (nextQuestionnaireId === questionnaireId) return;
    try {
      const period = response?.reporting_period || supplier?.reporting_period || questionnaire?.reporting_period;
      const { data } = await axios.get(`${API}/supplier-assessment/questionnaires/${nextQuestionnaireId}/submissions`, { params: period ? { reporting_period: period } : {}, headers: getAuthHeader() });
      const submission = (data?.submissions || []).find((item) => item.supplier_id === supplierId) || data?.submissions?.[0];
      if (!submission) return toast.error('No locked supplier submission is available for this questionnaire');
      navigate(`/supplier-assessment/suppliers/${submission.supplier_id}/questionnaires/${nextQuestionnaireId}/review`);
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not switch questionnaire response'); }
  };

  if (loading) return <div className="flex h-96 items-center justify-center" data-testid="response-review-loading"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" /><p className="mt-3 text-sm text-stone-500">Loading submission review...</p></div></div>;
  if (!selectedQuestion) return <div className="mx-auto max-w-3xl border border-dashed border-stone-300 bg-white p-12 text-center" data-testid="response-review-empty"><p className="text-sm text-stone-600">No submitted questions are available to review.</p><Button variant="outline" className="mt-4" onClick={() => navigate('/supplier-assessment/esg')} data-testid="response-review-empty-back-button">Back to questionnaires</Button></div>;

  const esgScore = response?.score_breakdown?.esg_score || {};
  const supplierName = supplier?.company_name || response?.company_name || 'Supplier';
  const questionnaireName = questionnaire?.name || response?.name || 'ESG Questionnaire';
  return <div className="space-y-5 pb-10" data-testid="supplier-response-review-page">
    <header className="border-b border-stone-200 bg-white px-4 pb-4 sm:px-5 lg:px-6" data-testid="response-review-header">
      <div className="flex flex-wrap items-center gap-3">
        <div><button type="button" className="inline-flex items-center gap-1.5 bg-transparent p-0 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950" onClick={() => navigate('/supplier-assessment/esg')} data-testid="response-review-back-button"><ArrowLeft className="h-4 w-4" />Back to ESG Questionnaire</button><h1 className="mt-1 text-2xl font-bold text-stone-950" data-testid="response-review-title">Review ESG Questionnaire Responses</h1></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_9rem_repeat(3,9rem)]" data-testid="response-review-summary">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-600 text-white"><Building2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-medium text-sky-700">Supplier</p><Select value={supplierId} onValueChange={changeSupplier} disabled={loadingReviewOptions || reviewSuppliers.length === 0}><SelectTrigger className="mt-1 h-8 border-0 bg-transparent px-0 text-sm font-bold text-slate-950 shadow-none focus:ring-0" data-testid="response-review-supplier-select"><SelectValue>{supplierName}</SelectValue></SelectTrigger><SelectContent>{reviewSuppliers.map((item) => <SelectItem key={item.supplier_id} value={item.supplier_id} data-testid={`response-review-supplier-option-${item.supplier_id}`}>{item.supplier_name}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white"><ClipboardList className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-medium text-indigo-700">Questionnaire</p><Select value={questionnaireId} onValueChange={changeQuestionnaire} disabled={loadingReviewOptions || periodQuestionnaires.length === 0}><SelectTrigger className="mt-1 h-8 border-0 bg-transparent px-0 text-sm font-bold text-slate-950 shadow-none focus:ring-0" data-testid="response-review-questionnaire-select"><SelectValue>{questionnaireName}</SelectValue></SelectTrigger><SelectContent>{periodQuestionnaires.map((item) => <SelectItem key={item.id} value={item.id} data-testid={`response-review-questionnaire-option-${item.id}`}>{item.name}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white"><p className="text-xs font-medium text-slate-300">Overall Score</p><p className="mt-1 text-xl font-bold" data-testid="response-review-overall-score">{scoreLabel(response?.calculated_score ?? esgScore.overall_score)} <span className="text-xs font-medium text-slate-300">/ 100</span></p></div>
        {PILLARS.map(({ id, label, Icon, card, icon }) => <div key={id} className={`rounded-xl border px-4 py-3 ${card}`} data-testid={`response-review-pillar-score-${id}`}><p className={`flex items-center gap-1.5 text-xs font-bold ${icon}`}><Icon className="h-3.5 w-3.5" />{label}</p><p className="mt-1 text-xl font-bold">{scoreLabel(esgScore[id]?.score)} <span className="text-xs font-medium">/ 100</span></p></div>)}
      </div>
    </header>
    <main className="grid min-w-0 items-start gap-4 xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[21rem_minmax(0,1fr)]" data-testid="response-review-workspace"><ResponseReviewSidebar groups={sidebarGroups} activeCategoryKey={activeCategoryKey} onCategorySelect={(categoryKey) => { const firstQuestion = questions.find((question) => `${question.category}:${question.question_category || 'general'}` === categoryKey); setActiveCategoryKey(categoryKey); setActivePillar(categoryKey.split(':')[0]); setSelectedQuestionId(firstQuestion?.id || ''); }} /><ResponseReviewQuestionPanel key={selectedQuestion.id} question={selectedQuestion} categoryLabel={taxonomyNames[`${selectedQuestion.category}:${selectedQuestion.question_category || 'general'}`] || humanize(selectedQuestion.question_category)} index={selectedIndex} total={visibleQuestions.length} score={calculatedScores[selectedQuestion.id]} onDecision={submitInlineDecision} onMarkForReview={saveReviewDraft} onOpenHistory={() => setHistoryOpen(true)} onPrevious={() => setSelectedQuestionId(visibleQuestions[Math.max(0, selectedIndex - 1)]?.id || selectedQuestion.id)} onNext={() => setSelectedQuestionId(visibleQuestions[Math.min(visibleQuestions.length - 1, selectedIndex + 1)]?.id || selectedQuestion.id)} onOpenEvidence={openEvidence} openingEvidenceKey={openingEvidenceKey} saving={reviewingQuestionId === selectedQuestion.id} marking={draftingQuestionId === selectedQuestion.id} /></main>
    <Sheet open={historyOpen} onOpenChange={setHistoryOpen}><SheetContent side="right" hideClose className="w-full max-w-xl p-0 sm:max-w-xl" data-testid="response-review-history-drawer"><ResponseAnswerHistory history={selectedQuestion.history || []} questionId={selectedQuestion.id} onClose={() => setHistoryOpen(false)} /></SheetContent></Sheet>
  </div>;
}
